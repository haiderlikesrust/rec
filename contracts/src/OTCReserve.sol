// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";

import {CookHook} from "./CookHook.sol";
import {KeeperAuth} from "./libraries/KeeperAuth.sol";
import {PriceMath} from "./libraries/PriceMath.sol";
import {IOTCReserve} from "./interfaces/ISinks.sol";
import {ILaunchpad, LaunchInfo} from "./interfaces/ILaunchpad.sol";

/// @title OTCReserve
/// @notice ETH pool funded by 30% of every coin's tax. Holders can sell a coin straight into the reserve for ETH
///         (no pool slippage) and anyone can buy the reserve's inventory back. Each coin's sell limit is the credit
///         its own fees earned, scaled down as the coin goes quiet: active coins get full limits, dead coins get
///         next to nothing.
contract OTCReserve is IOTCReserve, KeeperAuth, ReentrancyGuard {
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;

    struct Coin {
        uint256 credit; // ETH of sell capacity earned by this coin's fees
        uint256 totalContributed; // ETH this coin has paid into the reserve
        uint40 lastContribution;
        uint256 inventory; // coins the reserve holds, available to OTC buyers
        uint256 ethPaidOut; // ETH paid to sellers
        uint256 ethReceived; // ETH paid in by OTC buyers
    }

    struct QuoteRate {
        uint256 ethPerQuoteWad; // ETH wei for 1e18 raw units of the quote asset
        uint40 updatedAt;
    }

    IPoolManager public immutable poolManager;
    CookHook public immutable hook;
    ILaunchpad public immutable launchpad;
    address public immutable feeRouter;

    uint256 public spreadBps = 300; // OTC trades carry the same 3%; it stays in the reserve
    uint256 public creditMultiplierBps = 20_000; // 1 ETH contributed = 2 ETH of sell capacity
    uint32 public twapWindow = 30 minutes;
    uint40 public activeWindow = 3 days; // full limit while the coin contributed within this window
    uint40 public decayWindow = 27 days; // then fades linearly...
    uint256 public floorBps = 500; // ...to 5% of its credit
    uint256 public maxShareOfReserveBps = 1_000; // one coin can never draw more than 10% of the reserve at once
    uint256 public walletDailyBps = 500; // one wallet can sell at most 5% of the reserve per coin per day
    uint40 public maxRateAge = 1 days;

    mapping(address token => Coin) public coins;
    mapping(Currency => QuoteRate) public quoteRates;
    mapping(address token => mapping(address wallet => mapping(uint256 day => uint256))) public walletSold;
    uint256 public totalContributed;

    event Contributed(address indexed token, uint256 amount, uint256 creditAdded);
    event SoldToReserve(address indexed token, address indexed seller, uint256 tokenAmount, uint256 ethOut);
    event BoughtFromReserve(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokenAmount);
    event QuoteRateSet(Currency indexed quote, uint256 ethPerQuoteWad);
    event ParamsSet();

    error NotFeeRouter();
    error OverLimit();
    error OverWalletLimit();
    error Slippage();
    error PoolTooYoung();
    error StaleRate();
    error NotEnoughInventory();
    error UnknownCoin();
    error TransferFailed();

    constructor(IPoolManager poolManager_, CookHook hook_, ILaunchpad launchpad_, address feeRouter_, address owner_)
        KeeperAuth(owner_)
    {
        poolManager = poolManager_;
        hook = hook_;
        launchpad = launchpad_;
        feeRouter = feeRouter_;
    }

    // ---------------------------------------------------------------- admin / keeper

    function setParams(
        uint256 spreadBps_,
        uint256 creditMultiplierBps_,
        uint32 twapWindow_,
        uint40 activeWindow_,
        uint40 decayWindow_,
        uint256 floorBps_,
        uint256 maxShareOfReserveBps_,
        uint256 walletDailyBps_
    ) external onlyOwner {
        require(spreadBps_ <= 1_000 && floorBps_ <= BPS && maxShareOfReserveBps_ <= BPS && walletDailyBps_ <= BPS);
        require(decayWindow_ > 0);
        spreadBps = spreadBps_;
        creditMultiplierBps = creditMultiplierBps_;
        twapWindow = twapWindow_;
        activeWindow = activeWindow_;
        decayWindow = decayWindow_;
        floorBps = floorBps_;
        maxShareOfReserveBps = maxShareOfReserveBps_;
        walletDailyBps = walletDailyBps_;
        emit ParamsSet();
    }

    /// @notice Reference ETH price for non-ETH quote assets (USDG, stock tokens). Keeper-updated, must be fresh.
    function setQuoteRate(Currency quote, uint256 ethPerQuoteWad) external onlyKeeper {
        quoteRates[quote] = QuoteRate(ethPerQuoteWad, uint40(block.timestamp));
        emit QuoteRateSet(quote, ethPerQuoteWad);
    }

    // ---------------------------------------------------------------- inflow

    function deposit(address token) external payable {
        if (msg.sender != feeRouter) revert NotFeeRouter();
        Coin storage c = coins[token];
        uint256 credit = msg.value * creditMultiplierBps / BPS;
        c.credit += credit;
        c.totalContributed += msg.value;
        c.lastContribution = uint40(block.timestamp);
        totalContributed += msg.value;
        emit Contributed(token, msg.value, credit);
    }

    // ---------------------------------------------------------------- OTC

    function sellToReserve(address token, uint256 amountIn, uint256 minEthOut)
        external
        nonReentrant
        returns (uint256 ethOut)
    {
        ethOut = quoteSell(token, amountIn);
        if (ethOut < minEthOut) revert Slippage();
        if (ethOut > sellLimit(token)) revert OverLimit();

        uint256 day = block.timestamp / 1 days;
        uint256 sold = walletSold[token][msg.sender][day] + ethOut;
        if (sold > address(this).balance * walletDailyBps / BPS) revert OverWalletLimit();
        walletSold[token][msg.sender][day] = sold;

        Coin storage c = coins[token];
        c.credit -= Math.min(c.credit, ethOut);
        c.inventory += amountIn;
        c.ethPaidOut += ethOut;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);
        (bool ok,) = msg.sender.call{value: ethOut}("");
        if (!ok) revert TransferFailed();
        emit SoldToReserve(token, msg.sender, amountIn, ethOut);
    }

    function buyFromReserve(address token, uint256 minTokensOut) external payable nonReentrant returns (uint256 out) {
        out = quoteBuy(token, msg.value);
        if (out < minTokensOut) revert Slippage();
        Coin storage c = coins[token];
        if (out > c.inventory) revert NotEnoughInventory();
        c.inventory -= out;
        c.credit += msg.value; // ETH coming back restores this coin's capacity
        c.ethReceived += msg.value;
        IERC20(token).safeTransfer(msg.sender, out);
        emit BoughtFromReserve(token, msg.sender, msg.value, out);
    }

    // ---------------------------------------------------------------- views

    /// @notice ETH a seller receives for `amountIn` coins: the lower of spot and TWAP, minus the spread.
    function quoteSell(address token, uint256 amountIn) public view returns (uint256) {
        (uint256 spotQ, uint256 twapQ, Currency quote) = _quoteValues(token, amountIn);
        uint256 eth = _toEth(quote, Math.min(spotQ, twapQ));
        return eth * (BPS - spreadBps) / BPS;
    }

    /// @notice Coins a buyer receives for `ethIn`: priced at the higher of spot and TWAP, minus the spread.
    function quoteBuy(address token, uint256 ethIn) public view returns (uint256) {
        (uint256 spotQ, uint256 twapQ, Currency quote) = _quoteValues(token, 1e18);
        uint256 ethPerCoin = _toEth(quote, Math.max(spotQ, twapQ));
        if (ethPerCoin == 0) return 0;
        return (ethIn * (BPS - spreadBps) / BPS) * 1e18 / ethPerCoin;
    }

    /// @notice Current ETH sell capacity for a coin.
    function sellLimit(address token) public view returns (uint256) {
        Coin storage c = coins[token];
        uint256 lim = c.credit * activityBps(token) / BPS;
        return Math.min(lim, address(this).balance * maxShareOfReserveBps / BPS);
    }

    /// @notice 100% while a coin keeps paying fees, fading to `floorBps` once it goes quiet.
    function activityBps(address token) public view returns (uint256) {
        uint40 last = coins[token].lastContribution;
        if (last == 0) return 0;
        uint256 age = block.timestamp - last;
        if (age <= activeWindow) return BPS;
        if (age >= uint256(activeWindow) + decayWindow) return floorBps;
        return BPS - (BPS - floorBps) * (age - activeWindow) / decayWindow;
    }

    function _quoteValues(address token, uint256 amount)
        internal
        view
        returns (uint256 spotQ, uint256 twapQ, Currency quote)
    {
        LaunchInfo memory l = launchpad.getLaunch(token);
        if (l.creator == address(0)) revert UnknownCoin();
        PoolId id = PoolIdLibrary.toId(l.key);
        (uint160 spot,,,) = poolManager.getSlot0(id);
        (int24 avgTick, uint32 window) = hook.consult(id, twapWindow);
        if (window < twapWindow) revert PoolTooYoung();
        spotQ = PriceMath.tokenToQuote(amount, spot, l.tokenIsCurrency0);
        twapQ = PriceMath.tokenToQuote(amount, TickMath.getSqrtPriceAtTick(avgTick), l.tokenIsCurrency0);
        quote = l.quote;
    }

    function _toEth(Currency quote, uint256 quoteAmount) internal view returns (uint256) {
        if (quote.isAddressZero()) return quoteAmount;
        QuoteRate memory r = quoteRates[quote];
        if (r.updatedAt == 0 || block.timestamp - r.updatedAt > maxRateAge) revert StaleRate();
        return quoteAmount * r.ethPerQuoteWad / 1e18;
    }

    receive() external payable {}
}
