// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";

import {CookHook} from "./CookHook.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {KeeperAuth} from "./libraries/KeeperAuth.sol";
import {IFeeRouter} from "./interfaces/IFeeRouter.sol";
import {ILaunchpad, LaunchInfo} from "./interfaces/ILaunchpad.sol";

/// @title Launchpad
/// @notice Deploys a fixed-supply coin, opens its v4 pool against an approved quote asset with the whole supply as
///         locked single-sided liquidity, and optionally performs the creator's first buy, all in one transaction.
contract Launchpad is ILaunchpad, KeeperAuth, IUnlockCallback, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;

    struct QuoteConfig {
        bool enabled;
        uint256 startFdv; // fully diluted value at launch, in quote raw units
        uint256 graduationThreshold; // quote in the pool that marks graduation, in quote raw units
    }

    struct LaunchParams {
        string name;
        string symbol;
        LaunchToken.Metadata meta;
        Currency quote;
        uint256 initialBuy; // quote amount for the creator's first buy (0 = none)
        uint256 minTokensOut;
        address[] snipeExempt;
    }

    struct CallbackData {
        PoolKey key;
        bool tokenIsCurrency0;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address creator;
        uint256 initialBuy;
        uint256 minTokensOut;
    }

    int24 public constant TICK_SPACING = 200;

    IPoolManager public immutable poolManager;
    CookHook public immutable hook;
    IFeeRouter public feeRouter;
    uint256 public launchFee = 0.0005 ether;
    address public mainToken;

    mapping(Currency => QuoteConfig) public quotes;
    Currency[] public quoteList;
    mapping(Currency => PoolKey[]) internal _routes;

    mapping(address => LaunchInfo) internal _launches;
    address[] public allTokens;

    event QuoteSet(Currency indexed quote, bool enabled, uint256 startFdv, uint256 graduationThreshold, uint256 hops);
    event MainTokenSet(address indexed token);
    event LaunchFeeSet(uint256 fee);
    event TokenLaunched(
        address indexed token,
        address indexed creator,
        Currency indexed quote,
        PoolId poolId,
        bool tokenIsCurrency0,
        uint160 sqrtPriceStart,
        uint128 liquidity,
        uint256 initialBuy,
        uint256 tokensBought,
        string name,
        string symbol,
        string image
    );

    error QuoteNotEnabled();
    error WrongValue();
    error NotPoolManager();
    error InsufficientOutput();
    error BadRoute();
    error NotLaunched();
    error MainTokenMustPairWithEth();

    constructor(IPoolManager poolManager_, CookHook hook_, address owner_) KeeperAuth(owner_) {
        poolManager = poolManager_;
        hook = hook_;
    }

    // ---------------------------------------------------------------- admin

    function setFeeRouter(IFeeRouter feeRouter_) external onlyOwner {
        feeRouter = feeRouter_;
    }

    function setLaunchFee(uint256 fee) external onlyOwner {
        launchFee = fee;
        emit LaunchFeeSet(fee);
    }

    function setTrustedRouter(address router, bool trusted) external onlyOwner {
        hook.setTrustedRouter(router, trusted);
    }

    /// @notice Approve (or update) a quote asset. `route` converts it to native ETH hop by hop; empty for ETH itself.
    function setQuote(Currency quote, QuoteConfig calldata cfg, PoolKey[] calldata route) external onlyOwner {
        if (!quote.isAddressZero()) {
            if (route.length == 0) revert BadRoute();
            Currency cur = quote;
            for (uint256 i; i < route.length; ++i) {
                if (route[i].currency0 == cur) cur = route[i].currency1;
                else if (route[i].currency1 == cur) cur = route[i].currency0;
                else revert BadRoute();
            }
            if (!cur.isAddressZero()) revert BadRoute();
        }
        // both orientations must produce a valid start price
        _startPrice(cfg.startFdv, true);
        _startPrice(cfg.startFdv, false);

        if (quotes[quote].startFdv == 0) quoteList.push(quote);
        quotes[quote] = cfg;
        delete _routes[quote];
        for (uint256 i; i < route.length; ++i) {
            _routes[quote].push(route[i]);
        }
        emit QuoteSet(quote, cfg.enabled, cfg.startFdv, cfg.graduationThreshold, route.length);
    }

    function setMainToken(address token) external onlyOwner {
        LaunchInfo storage l = _launches[token];
        if (l.creator == address(0)) revert NotLaunched();
        if (!l.quote.isAddressZero()) revert MainTokenMustPairWithEth();
        mainToken = token;
        emit MainTokenSet(token);
    }

    // ---------------------------------------------------------------- launch

    function createLaunch(LaunchParams calldata p) external payable nonReentrant returns (address token) {
        QuoteConfig memory qc = quotes[p.quote];
        if (!qc.enabled) revert QuoteNotEnabled();
        bool payInEth = p.quote.isAddressZero();
        if (msg.value != launchFee + (payInEth ? p.initialBuy : 0)) revert WrongValue();
        if (!payInEth && p.initialBuy > 0) {
            IERC20(Currency.unwrap(p.quote)).safeTransferFrom(msg.sender, address(this), p.initialBuy);
        }

        token = address(
            new LaunchToken{salt: keccak256(abi.encode(msg.sender, allTokens.length))}(
                p.name, p.symbol, p.meta, msg.sender
            )
        );
        bool tokenIs0 = Currency.wrap(token) < p.quote;
        PoolKey memory key = tokenIs0
            ? PoolKey(Currency.wrap(token), p.quote, 0, TICK_SPACING, IHooks(address(hook)))
            : PoolKey(p.quote, Currency.wrap(token), 0, TICK_SPACING, IHooks(address(hook)));

        (uint160 sqrtStart, int24 tickStart) = _startPrice(qc.startFdv, tokenIs0);
        CallbackData memory cb;
        cb.key = key;
        cb.tokenIsCurrency0 = tokenIs0;
        cb.creator = msg.sender;
        cb.initialBuy = p.initialBuy;
        cb.minTokensOut = p.minTokensOut;
        if (tokenIs0) {
            cb.tickLower = tickStart;
            cb.tickUpper = TickMath.maxUsableTick(TICK_SPACING);
            cb.liquidity = LiquidityAmounts.getLiquidityForAmount0(
                sqrtStart, TickMath.getSqrtPriceAtTick(cb.tickUpper), LaunchToken(token).TOTAL_SUPPLY()
            );
        } else {
            cb.tickLower = TickMath.minUsableTick(TICK_SPACING);
            cb.tickUpper = tickStart;
            cb.liquidity = LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(cb.tickLower), sqrtStart, LaunchToken(token).TOTAL_SUPPLY()
            );
        }

        hook.registerPool(
            key,
            CookHook.PoolInfo({
                token: token,
                quote: p.quote,
                quoteIsCurrency0: !tokenIs0,
                graduated: false,
                launchedAt: uint40(block.timestamp),
                creator: msg.sender,
                sqrtPriceStart: sqrtStart,
                liquidity: cb.liquidity,
                graduationThreshold: qc.graduationThreshold
            }),
            p.snipeExempt
        );
        _launches[token] = LaunchInfo({
            key: key,
            quote: p.quote,
            creator: msg.sender,
            launchedAt: uint40(block.timestamp),
            tokenIsCurrency0: tokenIs0
        });
        allTokens.push(token);

        poolManager.initialize(key, sqrtStart);
        uint256 tokensBought = abi.decode(poolManager.unlock(abi.encode(cb)), (uint256));

        // rounding leaves a few wei of supply unallocated; burn it
        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust > 0) LaunchToken(token).burn(dust);

        if (launchFee > 0) feeRouter.depositLaunchFee{value: launchFee}();

        emit TokenLaunched(
            token,
            msg.sender,
            p.quote,
            key.toId(),
            tokenIs0,
            sqrtStart,
            cb.liquidity,
            p.initialBuy,
            tokensBought,
            p.name,
            p.symbol,
            p.meta.image
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        CallbackData memory cb = abi.decode(data, (CallbackData));
        Currency tokenC = cb.tokenIsCurrency0 ? cb.key.currency0 : cb.key.currency1;
        Currency quoteC = cb.tokenIsCurrency0 ? cb.key.currency1 : cb.key.currency0;

        (BalanceDelta added,) = poolManager.modifyLiquidity(
            cb.key, ModifyLiquidityParams(cb.tickLower, cb.tickUpper, int256(uint256(cb.liquidity)), 0), ""
        );
        uint256 owed = uint256(int256(-(cb.tokenIsCurrency0 ? added.amount0() : added.amount1())));
        poolManager.sync(tokenC);
        IERC20(Currency.unwrap(tokenC)).safeTransfer(address(poolManager), owed);
        poolManager.settle();

        uint256 bought;
        if (cb.initialBuy > 0) {
            bool zeroForOne = !cb.tokenIsCurrency0;
            BalanceDelta d = poolManager.swap(
                cb.key,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(cb.initialBuy),
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                abi.encode(cb.creator)
            );
            uint256 quoteOwed = uint256(int256(-(zeroForOne ? d.amount0() : d.amount1())));
            bought = uint256(int256(zeroForOne ? d.amount1() : d.amount0()));
            if (bought < cb.minTokensOut) revert InsufficientOutput();
            if (quoteC.isAddressZero()) {
                poolManager.settle{value: quoteOwed}();
            } else {
                poolManager.sync(quoteC);
                IERC20(Currency.unwrap(quoteC)).safeTransfer(address(poolManager), quoteOwed);
                poolManager.settle();
            }
            poolManager.take(tokenC, cb.creator, bought);
        }
        return abi.encode(bought);
    }

    // ---------------------------------------------------------------- views

    function getLaunch(address token) external view returns (LaunchInfo memory) {
        return _launches[token];
    }

    function quoteRoute(Currency quote) external view returns (PoolKey[] memory) {
        return _routes[quote];
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function quoteCount() external view returns (uint256) {
        return quoteList.length;
    }

    /// @dev Start price so that the full supply is worth `startFdv` quote, aligned to the tick spacing on the side
    ///      that makes the coin slightly cheaper (never more expensive) than the target.
    function _startPrice(uint256 startFdv, bool tokenIs0) internal pure returns (uint160 sqrtPriceX96, int24 tick) {
        uint256 supply = 1_000_000_000e18;
        uint256 priceX192 =
            tokenIs0 ? FullMath.mulDiv(startFdv, 1 << 192, supply) : FullMath.mulDiv(supply, 1 << 192, startFdv);
        tick = TickMath.getTickAtSqrtPrice(uint160(Math.sqrt(priceX192)));
        int24 rem = tick % TICK_SPACING;
        if (tokenIs0) {
            // price is quote-per-coin: round down
            tick = tick - rem - (rem < 0 ? TICK_SPACING : int24(0));
        } else {
            // price is coin-per-quote: round up
            tick = tick - rem + (rem > 0 ? TICK_SPACING : int24(0));
        }
        sqrtPriceX96 = TickMath.getSqrtPriceAtTick(tick);
    }

    receive() external payable {}
}
