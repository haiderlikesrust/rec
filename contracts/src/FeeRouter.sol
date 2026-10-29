// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";

import {LaunchToken} from "./LaunchToken.sol";
import {KeeperAuth} from "./libraries/KeeperAuth.sol";
import {FeeSplit} from "./libraries/FeeSplit.sol";
import {IFeeRouter} from "./interfaces/IFeeRouter.sol";
import {ILaunchpad, LaunchInfo} from "./interfaces/ILaunchpad.sol";
import {IOTCReserve, IProtectionFund, IHolderAirdrop} from "./interfaces/ISinks.sol";

/// @title FeeRouter
/// @notice Receives every coin's tax (as v4 ERC-6909 claims in the coin's quote asset), books it into the five
///         buckets, and on `process` turns the buckets into their destinations:
///           coin buyback  -> buy the coin in its own pool, burn it
///           main buyback  -> quote -> ETH -> platform token, burn it
///           OTC reserve   -> quote -> ETH, credited to the coin that paid it
///           protection    -> quote -> ETH
///           airdrop       -> quote, handed to HolderAirdrop for the high-entry holders of that coin
///         All swaps run inside a single PoolManager unlock and are exempt from the tax.
contract FeeRouter is IFeeRouter, KeeperAuth, IUnlockCallback, ReentrancyGuard {
    struct Buckets {
        uint256 mainBuyback;
        uint256 coinBuyback;
        uint256 otc;
        uint256 protection;
        uint256 airdrop;
    }

    struct Totals {
        uint256 feesQuote; // base tax collected (quote)
        uint256 snipeQuote; // anti-snipe surcharge collected (quote)
        uint256 coinBurned; // coin tokens bought back and burned
        uint256 ethToOtc;
        uint256 ethToProtection;
        uint256 ethToMainBuyback;
        uint256 airdropQuote;
    }

    struct ProcessParams {
        address token;
        uint256 minCoinOut;
        uint256 minEthOut;
        uint256 minMainOut;
    }

    struct ProcessResult {
        uint256 coinBurned;
        uint256 ethConverted;
        uint256 ethForMain;
        uint256 mainBurned;
    }

    IPoolManager public immutable poolManager;
    address public immutable hook;
    ILaunchpad public immutable launchpad;

    IOTCReserve public otcReserve;
    IProtectionFund public protectionFund;
    IHolderAirdrop public holderAirdrop;

    mapping(address token => Buckets) public pending;
    mapping(address token => Totals) public totals;
    uint256 public pendingMainEth;
    uint256 public totalMainBurned;

    event FeesAccrued(address indexed token, uint256 baseFee, uint256 snipeExtra);
    event LaunchFeeDeposited(uint256 amount);
    event Processed(
        address indexed token,
        uint256 coinBurned,
        uint256 ethToOtc,
        uint256 ethToProtection,
        uint256 ethToMainBuyback,
        uint256 mainBurned,
        uint256 airdropQuote
    );

    error NotHook();
    error NotPoolManager();
    error SinksNotSet();
    error Slippage();
    error NothingToProcess();

    constructor(IPoolManager poolManager_, address hook_, ILaunchpad launchpad_, address owner_) KeeperAuth(owner_) {
        poolManager = poolManager_;
        hook = hook_;
        launchpad = launchpad_;
    }

    function setSinks(IOTCReserve otc, IProtectionFund protection, IHolderAirdrop airdrop) external onlyOwner {
        otcReserve = otc;
        protectionFund = protection;
        holderAirdrop = airdrop;
    }

    // ---------------------------------------------------------------- inflows

    function accrue(address token, uint256 baseFee, uint256 snipeExtra) external {
        if (msg.sender != hook) revert NotHook();
        (uint256 main, uint256 coin, uint256 otc, uint256 prot, uint256 air) = FeeSplit.split(baseFee);
        Buckets storage b = pending[token];
        b.mainBuyback += main;
        b.coinBuyback += coin + snipeExtra; // snipers fund the coin's own buyback
        b.otc += otc;
        b.protection += prot;
        b.airdrop += air;
        Totals storage t = totals[token];
        t.feesQuote += baseFee;
        t.snipeQuote += snipeExtra;
        emit FeesAccrued(token, baseFee, snipeExtra);
    }

    function depositLaunchFee() external payable {
        pendingMainEth += msg.value;
        emit LaunchFeeDeposited(msg.value);
    }

    // ---------------------------------------------------------------- processing

    function process(ProcessParams calldata pp) external onlyKeeper nonReentrant {
        if (address(otcReserve) == address(0)) revert SinksNotSet();
        Buckets memory b = pending[pp.token];
        uint256 total = b.mainBuyback + b.coinBuyback + b.otc + b.protection + b.airdrop;
        if (total == 0) revert NothingToProcess();
        delete pending[pp.token];

        ProcessResult memory r = abi.decode(poolManager.unlock(abi.encode(pp, b)), (ProcessResult));

        uint256 convertTotal = b.mainBuyback + b.otc + b.protection;
        uint256 ethMain = convertTotal == 0 ? 0 : r.ethConverted * b.mainBuyback / convertTotal;
        uint256 ethOtc = convertTotal == 0 ? 0 : r.ethConverted * b.otc / convertTotal;
        uint256 ethProt = r.ethConverted - ethMain - ethOtc;

        if (r.mainBurned == 0) pendingMainEth += ethMain; // no main token yet: hold the ETH for later
        else pendingMainEth = 0;
        totalMainBurned += r.mainBurned;

        Totals storage t = totals[pp.token];
        t.coinBurned += r.coinBurned;
        t.ethToOtc += ethOtc;
        t.ethToProtection += ethProt;
        t.ethToMainBuyback += ethMain;
        t.airdropQuote += b.airdrop;

        if (ethOtc > 0) otcReserve.deposit{value: ethOtc}(pp.token);
        if (ethProt > 0) protectionFund.deposit{value: ethProt}(pp.token);
        if (b.airdrop > 0) holderAirdrop.notifyDeposit(pp.token, b.airdrop);

        emit Processed(pp.token, r.coinBurned, ethOtc, ethProt, ethMain, r.mainBurned, b.airdrop);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (ProcessParams memory pp, Buckets memory b) = abi.decode(data, (ProcessParams, Buckets));
        LaunchInfo memory l = launchpad.getLaunch(pp.token);
        ProcessResult memory r;

        uint256 total = b.mainBuyback + b.coinBuyback + b.otc + b.protection + b.airdrop;
        poolManager.burn(address(this), l.quote.toId(), total);

        // 1. buy back this coin and burn it
        if (b.coinBuyback > 0) {
            r.coinBurned = _swapExactIn(l.key, l.quote, b.coinBuyback);
            if (r.coinBurned < pp.minCoinOut) revert Slippage();
            Currency coin = Currency.wrap(pp.token);
            poolManager.take(coin, address(this), r.coinBurned);
            LaunchToken(pp.token).burn(r.coinBurned);
        }

        // 2. airdrop bucket stays in the quote asset
        if (b.airdrop > 0) poolManager.take(l.quote, address(holderAirdrop), b.airdrop);

        // 3. everything else becomes ETH
        uint256 toConvert = b.mainBuyback + b.otc + b.protection;
        if (l.quote.isAddressZero()) {
            r.ethConverted = toConvert;
        } else if (toConvert > 0) {
            PoolKey[] memory route = launchpad.quoteRoute(l.quote);
            Currency cur = l.quote;
            uint256 amt = toConvert;
            for (uint256 i; i < route.length; ++i) {
                Currency next = route[i].currency0 == cur ? route[i].currency1 : route[i].currency0;
                amt = _swapExactIn(route[i], cur, amt);
                cur = next;
            }
            r.ethConverted = amt;
            if (r.ethConverted < pp.minEthOut) revert Slippage();
        }

        // 4. main-token buyback with its share plus anything held from launch fees / earlier runs
        address main = launchpad.mainToken();
        if (main != address(0)) {
            uint256 ethMain = toConvert == 0 ? 0 : r.ethConverted * b.mainBuyback / toConvert;
            uint256 held = pendingMainEth;
            if (held > 0) {
                poolManager.sync(CurrencyLibrary.ADDRESS_ZERO);
                poolManager.settle{value: held}();
            }
            r.ethForMain = ethMain + held;
            if (r.ethForMain > 0) {
                LaunchInfo memory ml = launchpad.getLaunch(main);
                r.mainBurned = _swapExactIn(ml.key, CurrencyLibrary.ADDRESS_ZERO, r.ethForMain);
                if (r.mainBurned < pp.minMainOut) revert Slippage();
                poolManager.take(Currency.wrap(main), address(this), r.mainBurned);
                LaunchToken(main).burn(r.mainBurned);
            }
            uint256 ethLeft = r.ethConverted - ethMain;
            if (ethLeft > 0) poolManager.take(CurrencyLibrary.ADDRESS_ZERO, address(this), ethLeft);
        } else if (r.ethConverted > 0) {
            poolManager.take(CurrencyLibrary.ADDRESS_ZERO, address(this), r.ethConverted);
        }
        return abi.encode(r);
    }

    /// @dev Exact-input swap of `amountIn` of `input` in `key`; returns the output amount (left as credit).
    function _swapExactIn(PoolKey memory key, Currency input, uint256 amountIn) internal returns (uint256) {
        bool zeroForOne = key.currency0 == input;
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 out = zeroForOne ? d.amount1() : d.amount0();
        return uint256(int256(out));
    }

    receive() external payable {}
}
