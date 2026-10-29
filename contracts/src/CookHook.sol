// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";

import {FeeSplit} from "./libraries/FeeSplit.sol";
import {IFeeRouter} from "./interfaces/IFeeRouter.sol";

/// @title CookHook
/// @notice Uniswap v4 hook attached to every launch pool. It
///  - takes a 3% tax on the quote side of every buy and sell (plus a decaying anti-snipe surcharge on launch buys),
///    minting it as ERC-6909 claims to the FeeRouter;
///  - keeps the full supply's liquidity locked (only the Launchpad can add, nobody can remove);
///  - records a minute-granularity TWAP used for OTC pricing and buyback slippage checks;
///  - flags graduation once the quote in the pool crosses the quote asset's threshold.
contract CookHook is IHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    struct PoolInfo {
        address token;
        Currency quote;
        bool quoteIsCurrency0;
        bool graduated;
        uint40 launchedAt;
        address creator;
        uint160 sqrtPriceStart;
        uint128 liquidity;
        uint256 graduationThreshold;
    }

    struct OracleState {
        uint32 lastTs;
        uint8 index;
        uint8 count;
        uint32 lastObsTs;
        int56 cumulative;
    }

    struct Observation {
        uint32 ts;
        int56 cumulative;
    }

    uint8 public constant OBS_SLOTS = 64;
    uint32 public constant OBS_INTERVAL = 60;

    IPoolManager public immutable poolManager;
    address public immutable deployer;

    address public launchpad;
    IFeeRouter public feeRouter;
    mapping(address => bool) public trustedRouter;

    mapping(PoolId => PoolInfo) public pools;
    mapping(address token => PoolId) public poolIdOf;
    mapping(PoolId => mapping(address => bool)) public snipeExempt;
    mapping(PoolId => OracleState) public oracles;
    mapping(PoolId => Observation[64]) internal _observations;

    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 quoteAmount,
        uint256 tokenAmount,
        uint256 tax,
        uint160 sqrtPriceX96,
        int24 tick
    );
    event Graduated(address indexed token, uint256 quoteInPool);
    event TrustedRouterSet(address indexed router, bool trusted);

    error NotPoolManager();
    error NotLaunchpad();
    error NotDeployer();
    error AlreadyInitialized();
    error UnknownPool();
    error LiquidityLocked();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyLaunchpad() {
        if (msg.sender != launchpad) revert NotLaunchpad();
        _;
    }

    constructor(IPoolManager poolManager_, address deployer_) {
        poolManager = poolManager_;
        deployer = deployer_;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice One-time wiring, done by the deployer right after the CREATE2 deploy.
    function initialize(address launchpad_, IFeeRouter feeRouter_, address[] calldata routers) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (launchpad != address(0)) revert AlreadyInitialized();
        launchpad = launchpad_;
        feeRouter = feeRouter_;
        trustedRouter[launchpad_] = true;
        emit TrustedRouterSet(launchpad_, true);
        for (uint256 i; i < routers.length; ++i) {
            trustedRouter[routers[i]] = true;
            emit TrustedRouterSet(routers[i], true);
        }
    }

    /// @notice Routers allowed to name the trader in hookData. Managed by the Launchpad owner.
    function setTrustedRouter(address router, bool trusted) external onlyLaunchpad {
        trustedRouter[router] = trusted;
        emit TrustedRouterSet(router, trusted);
    }

    function registerPool(PoolKey calldata key, PoolInfo calldata info, address[] calldata exempt)
        external
        onlyLaunchpad
    {
        PoolId id = key.toId();
        pools[id] = info;
        poolIdOf[info.token] = id;
        snipeExempt[id][info.creator] = true;
        for (uint256 i; i < exempt.length; ++i) {
            snipeExempt[id][exempt[i]] = true;
        }
    }

    // ---------------------------------------------------------------- hooks

    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != launchpad) revert NotLaunchpad();
        PoolId id = key.toId();
        if (pools[id].token == address(0)) revert UnknownPool();
        uint32 nowTs = uint32(block.timestamp);
        oracles[id] = OracleState({lastTs: nowTs, index: 0, count: 1, lastObsTs: nowTs, cumulative: 0});
        _observations[id][0] = Observation({ts: nowTs, cumulative: 0});
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != launchpad) revert NotLaunchpad();
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert LiquidityLocked();
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        PoolInfo storage p = pools[id];
        _updateOracle(id);

        if (!_specifiedIsQuote(p, params)) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        uint256 rate = _taxRate(p, id, sender, _trader(sender, hookData), _isBuy(p, params));
        if (rate == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        (uint256 fee,) = _specifiedFee(params, rate);
        _collect(p, fee, rate);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolInfo storage p = pools[id];
        address trader = _trader(sender, hookData);
        bool isBuy = _isBuy(p, params);
        uint256 rate = _taxRate(p, id, sender, trader, isBuy);

        int128 quoteDelta = p.quoteIsCurrency0 ? delta.amount0() : delta.amount1();
        int128 tokenDelta = p.quoteIsCurrency0 ? delta.amount1() : delta.amount0();

        uint256 fee;
        uint256 grossQuote;
        int128 hookReturn;
        if (_specifiedIsQuote(p, params)) {
            // fee already taken in beforeSwap; recompute it for the event
            (fee, grossQuote) = rate == 0 ? (0, _abs(quoteDelta)) : _specifiedFee(params, rate);
        } else if (isBuy) {
            // exact-output buy: the swap's quote input is net of tax, so gross it up
            uint256 net = _abs(quoteDelta);
            fee = rate == 0 ? 0 : FullMath.mulDivRoundingUp(net, rate, FeeSplit.BPS - rate);
            grossQuote = net + fee;
        } else {
            // exact-input sell: tax comes out of the quote the seller receives
            grossQuote = _abs(quoteDelta);
            fee = grossQuote * rate / FeeSplit.BPS;
        }
        if (fee > 0 && !_specifiedIsQuote(p, params)) {
            _collect(p, fee, rate);
            hookReturn = int128(int256(fee));
        }

        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(id);
        emit Trade(p.token, trader, isBuy, grossQuote, _abs(tokenDelta), fee, sqrtPriceX96, tick);

        if (!p.graduated) {
            uint256 q = _quoteInPool(p, sqrtPriceX96);
            if (q >= p.graduationThreshold) {
                p.graduated = true;
                emit Graduated(p.token, q);
            }
        }
        return (IHooks.afterSwap.selector, hookReturn);
    }

    // ---------------------------------------------------------------- views

    /// @notice Time-weighted average tick over at least `window` seconds (or as long as the pool has existed).
    function consult(PoolId id, uint32 window) public view returns (int24 avgTick, uint32 actualWindow) {
        OracleState memory o = oracles[id];
        (, int24 tick,,) = poolManager.getSlot0(id);
        uint32 nowTs = uint32(block.timestamp);
        int56 cumNow = o.cumulative + int56(tick) * int56(uint56(nowTs - o.lastTs));

        Observation memory chosen = _observations[id][o.index];
        for (uint8 i; i < o.count; ++i) {
            chosen = _observations[id][(o.index + OBS_SLOTS - i) % OBS_SLOTS];
            if (nowTs - chosen.ts >= window) break;
        }
        actualWindow = nowTs - chosen.ts;
        if (actualWindow == 0) return (tick, 0);
        int56 diff = cumNow - chosen.cumulative;
        int56 w = int56(uint56(actualWindow));
        avgTick = int24(diff / w);
        if (diff < 0 && diff % w != 0) avgTick--;
    }

    function quoteInPool(PoolId id) external view returns (uint256) {
        PoolInfo storage p = pools[id];
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        return _quoteInPool(p, sqrtPriceX96);
    }

    function currentTaxBps(address token, address trader, bool isBuy) external view returns (uint256) {
        PoolId id = poolIdOf[token];
        return _taxRate(pools[id], id, address(0), trader, isBuy);
    }

    // ---------------------------------------------------------------- internals

    function _isBuy(PoolInfo storage p, SwapParams calldata params) internal view returns (bool) {
        // buying the coin == quote goes in
        return params.zeroForOne == p.quoteIsCurrency0;
    }

    function _specifiedIsQuote(PoolInfo storage p, SwapParams calldata params) internal view returns (bool) {
        bool specifiedIsCurrency0 = (params.amountSpecified < 0) == params.zeroForOne;
        return specifiedIsCurrency0 == p.quoteIsCurrency0;
    }

    /// @dev Fee when the quote side is the specified amount: exact-in buys and exact-out sells.
    function _specifiedFee(SwapParams calldata params, uint256 rate) internal pure returns (uint256 fee, uint256 gross) {
        if (params.amountSpecified < 0) {
            gross = uint256(-params.amountSpecified);
            fee = gross * rate / FeeSplit.BPS;
        } else {
            uint256 net = uint256(params.amountSpecified);
            fee = FullMath.mulDivRoundingUp(net, rate, FeeSplit.BPS - rate);
            gross = net + fee;
        }
    }

    function _taxRate(PoolInfo storage p, PoolId id, address sender, address trader, bool isBuy)
        internal
        view
        returns (uint256 rate)
    {
        if (sender == address(feeRouter) && sender != address(0)) return 0; // protocol buybacks + conversions
        rate = FeeSplit.TAX_BPS;
        if (isBuy && !snipeExempt[id][trader]) rate += FeeSplit.snipeExtraBps(block.timestamp - p.launchedAt);
    }

    function _trader(address sender, bytes calldata hookData) internal view returns (address) {
        if (sender == address(feeRouter)) return sender;
        if (trustedRouter[sender] && hookData.length == 32) return abi.decode(hookData, (address));
        return tx.origin;
    }

    function _collect(PoolInfo storage p, uint256 fee, uint256 rate) internal {
        poolManager.mint(address(feeRouter), p.quote.toId(), fee);
        uint256 base = fee * FeeSplit.TAX_BPS / rate;
        feeRouter.accrue(p.token, base, fee - base);
    }

    function _updateOracle(PoolId id) internal {
        OracleState storage o = oracles[id];
        uint32 nowTs = uint32(block.timestamp);
        if (nowTs == o.lastTs) return;
        (, int24 tick,,) = poolManager.getSlot0(id);
        o.cumulative += int56(tick) * int56(uint56(nowTs - o.lastTs));
        o.lastTs = nowTs;
        if (nowTs - o.lastObsTs >= OBS_INTERVAL) {
            uint8 next = (o.index + 1) % OBS_SLOTS;
            _observations[id][next] = Observation({ts: nowTs, cumulative: o.cumulative});
            o.index = next;
            if (o.count < OBS_SLOTS) o.count++;
            o.lastObsTs = nowTs;
        }
    }

    function _quoteInPool(PoolInfo storage p, uint160 sqrtPriceX96) internal view returns (uint256) {
        if (p.quoteIsCurrency0) {
            // coin is currency1, liquidity sits below the start price
            return SqrtPriceMath.getAmount0Delta(sqrtPriceX96, p.sqrtPriceStart, p.liquidity, false);
        }
        return SqrtPriceMath.getAmount1Delta(p.sqrtPriceStart, sqrtPriceX96, p.liquidity, false);
    }

    function _abs(int128 x) internal pure returns (uint256) {
        return uint256(int256(x < 0 ? -x : x));
    }

    // ---------------------------------------------------------------- unused

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
