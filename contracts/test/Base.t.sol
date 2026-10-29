// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";

import {CookHook} from "../src/CookHook.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {OTCReserve} from "../src/OTCReserve.sol";
import {ProtectionFund} from "../src/ProtectionFund.sol";
import {HolderAirdrop} from "../src/HolderAirdrop.sol";
import {CookRouter} from "../src/CookRouter.sol";
import {IFeeRouter} from "../src/interfaces/IFeeRouter.sol";
import {IOTCReserve, IProtectionFund, IHolderAirdrop} from "../src/interfaces/ISinks.sol";

contract MockERC20 is ERC20 {
    uint8 internal immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

abstract contract BaseTest is Test {
    Currency internal constant ETH = CurrencyLibrary.ADDRESS_ZERO;
    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    PoolManager internal pm;
    CookHook internal hook;
    Launchpad internal launchpad;
    FeeRouter internal feeRouter;
    OTCReserve internal otc;
    ProtectionFund internal protection;
    HolderAirdrop internal airdrop;
    CookRouter internal router;
    PoolModifyLiquidityTest internal lpRouter;
    PoolSwapTest internal swapRouter;

    MockERC20 internal usdg;
    PoolKey internal ethUsdgKey;

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal keeper = makeAddr("keeper");

    function setUp() public virtual {
        vm.warp(1_750_000_000);
        pm = new PoolManager(address(this));

        address hookAddr = address(uint160(uint256(0x4444) << 144) | HOOK_FLAGS);
        deployCodeTo("CookHook.sol:CookHook", abi.encode(pm, address(this)), hookAddr);
        hook = CookHook(hookAddr);

        launchpad = new Launchpad(pm, hook, address(this));
        feeRouter = new FeeRouter(pm, address(hook), launchpad, address(this));
        router = new CookRouter(pm, launchpad);
        otc = new OTCReserve(pm, hook, launchpad, address(feeRouter), address(this));
        protection = new ProtectionFund(address(feeRouter), address(this));
        airdrop = new HolderAirdrop(address(feeRouter), launchpad, address(this));

        address[] memory routers = new address[](1);
        routers[0] = address(router);
        hook.initialize(address(launchpad), IFeeRouter(address(feeRouter)), routers);
        launchpad.setFeeRouter(IFeeRouter(address(feeRouter)));
        feeRouter.setSinks(IOTCReserve(address(otc)), IProtectionFund(address(protection)), IHolderAirdrop(address(airdrop)));
        feeRouter.setKeeper(keeper, true);
        otc.setKeeper(keeper, true);
        protection.setKeeper(keeper, true);
        airdrop.setKeeper(keeper, true);

        lpRouter = new PoolModifyLiquidityTest(pm);
        swapRouter = new PoolSwapTest(pm);

        // ETH quote: launch at 1 ETH FDV, graduate at 4.2 ETH in the pool
        launchpad.setQuote(ETH, Launchpad.QuoteConfig(true, 1 ether, 4.2 ether), new PoolKey[](0));

        // USDG quote with an ETH/USDG pool (4,000 USDG per ETH) used to convert fees to ETH
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        ethUsdgKey = PoolKey(ETH, Currency.wrap(address(usdg)), 3000, 60, IHooks(address(0)));
        pm.initialize(ethUsdgKey, uint160(Math.sqrt(FullMath.mulDiv(4000e6, 1 << 192, 1e18))));
        usdg.mint(address(this), 10_000_000e6);
        usdg.approve(address(lpRouter), type(uint256).max);
        vm.deal(address(this), 1_000 ether);
        lpRouter.modifyLiquidity{value: 200 ether}(
            ethUsdgKey,
            ModifyLiquidityParams(TickMath.minUsableTick(60), TickMath.maxUsableTick(60), 6_324_555_320_336_758, 0),
            ""
        );
        PoolKey[] memory route = new PoolKey[](1);
        route[0] = ethUsdgKey;
        launchpad.setQuote(Currency.wrap(address(usdg)), Launchpad.QuoteConfig(true, 4_000e6, 16_800e6), route);

        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        usdg.mint(creator, 1_000_000e6);
        usdg.mint(alice, 1_000_000e6);
        usdg.mint(bob, 1_000_000e6);
    }

    // ---------------------------------------------------------------- helpers

    function _params(Currency quote, uint256 initialBuy) internal pure returns (Launchpad.LaunchParams memory p) {
        p.name = "Test Coin";
        p.symbol = "TEST";
        p.meta = LaunchToken.Metadata("ipfs://img", "a coin", "", "", "");
        p.quote = quote;
        p.initialBuy = initialBuy;
        p.minTokensOut = 0;
        p.snipeExempt = new address[](0);
    }

    function _launchEth(uint256 initialBuy) internal returns (address token) {
        uint256 fee = launchpad.launchFee();
        vm.prank(creator);
        token = launchpad.createLaunch{value: fee + initialBuy}(_params(ETH, initialBuy));
    }

    /// @dev via-ir caches block.timestamp inside a test, so always warp relative to the cheatcode's clock
    function _skip(uint256 secs) internal {
        vm.warp(vm.getBlockTimestamp() + secs);
    }

    function _launchUsdg(uint256 initialBuy) internal returns (address token) {
        vm.startPrank(creator);
        usdg.approve(address(launchpad), initialBuy);
        token = launchpad.createLaunch{value: launchpad.launchFee()}(_params(Currency.wrap(address(usdg)), initialBuy));
        vm.stopPrank();
    }

    function _buyEth(address who, address token, uint256 amount) internal returns (uint256) {
        vm.prank(who);
        return router.buy{value: amount}(token, amount, 0, who, block.timestamp);
    }

    function _buyUsdg(address who, address token, uint256 amount) internal returns (uint256 out) {
        vm.startPrank(who);
        usdg.approve(address(router), amount);
        out = router.buy(token, amount, 0, who, block.timestamp);
        vm.stopPrank();
    }

    function _sell(address who, address token, uint256 amount) internal returns (uint256 out) {
        vm.startPrank(who);
        LaunchToken(token).approve(address(router), amount);
        out = router.sell(token, amount, 0, who, block.timestamp);
        vm.stopPrank();
    }

    function _pendingTotal(address token) internal view returns (uint256) {
        (uint256 a, uint256 b, uint256 c, uint256 d, uint256 e) = feeRouter.pending(token);
        return a + b + c + d + e;
    }

    receive() external payable {}
}
