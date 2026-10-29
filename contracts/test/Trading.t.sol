// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {StateLibrary as StateView} from "v4-core/libraries/StateLibrary.sol";

import {BaseTest} from "./Base.t.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {CookHook} from "../src/CookHook.sol";
import {FeeSplit} from "../src/libraries/FeeSplit.sol";
import {LaunchInfo} from "../src/interfaces/ILaunchpad.sol";

contract TradingTest is BaseTest {
    using PoolIdLibrary for PoolKey;

    function test_feeSplit_sumsExactly(uint128 amount) public pure {
        (uint256 a, uint256 b, uint256 c, uint256 d, uint256 e) = FeeSplit.split(amount);
        assertEq(a + b + c + d + e, amount);
        assertEq(
            FeeSplit.MAIN_BUYBACK_BPS + FeeSplit.COIN_BUYBACK_BPS + FeeSplit.OTC_RESERVE_BPS + FeeSplit.PROTECTION_BPS
                + FeeSplit.AIRDROP_BPS,
            FeeSplit.BPS
        );
    }

    function test_snipeDecay() public pure {
        assertEq(FeeSplit.TAX_BPS + FeeSplit.snipeExtraBps(0), 9_900);
        assertEq(FeeSplit.TAX_BPS + FeeSplit.snipeExtraBps(1), 5_100);
        assertEq(FeeSplit.TAX_BPS + FeeSplit.snipeExtraBps(2), 2_700);
        assertEq(FeeSplit.TAX_BPS + FeeSplit.snipeExtraBps(5), 600);
        assertEq(FeeSplit.TAX_BPS + FeeSplit.snipeExtraBps(6), 300);
    }

    function test_launch_locksWholeSupply() public {
        address token = _launchEth(0);
        LaunchInfo memory l = launchpad.getLaunch(token);
        assertEq(l.creator, creator);
        assertFalse(l.tokenIsCurrency0); // native ETH always sorts first
        assertEq(LaunchToken(token).balanceOf(address(launchpad)), 0);
        // everything not burned as rounding dust is in the PoolManager
        uint256 inPool = LaunchToken(token).balanceOf(address(pm));
        assertApproxEqRel(inPool, 1_000_000_000e18, 1e9);
        assertEq(inPool, LaunchToken(token).totalSupply());
        // launch fee is waiting for the main-token buyback
        assertEq(feeRouter.pendingMainEth(), 0.0005 ether);
    }

    function test_launch_creatorInitialBuy_paysBaseTaxOnly() public {
        address token = _launchEth(1 ether);
        assertGt(LaunchToken(token).balanceOf(creator), 0);
        assertEq(_pendingTotal(token), 0.03 ether);
        assertEq(pm.balanceOf(address(feeRouter), ETH.toId()), 0.03 ether);
    }

    function test_launch_usdgQuote() public {
        address token = _launchUsdg(1_000e6);
        LaunchInfo memory l = launchpad.getLaunch(token);
        assertEq(Currency.unwrap(l.quote), address(usdg));
        assertGt(LaunchToken(token).balanceOf(creator), 0);
        assertEq(_pendingTotal(token), 30e6);
    }

    function test_buy_takes3PercentOfQuoteIn() public {
        address token = _launchEth(0);
        _skip(10);
        uint256 quoted = _quote(alice, token, true, 1 ether);
        uint256 out = _buyEth(alice, token, 1 ether);
        assertEq(out, quoted);
        assertEq(LaunchToken(token).balanceOf(alice), out);
        assertEq(_pendingTotal(token), 0.03 ether);
        (uint256 main, uint256 coin, uint256 otcB, uint256 prot, uint256 air) = feeRouter.pending(token);
        assertEq(main, 0.003 ether);
        assertEq(coin, 0.003 ether);
        assertEq(otcB, 0.009 ether);
        assertEq(prot, 0.012 ether);
        assertEq(air, 0.003 ether);
    }

    function test_sell_takes3PercentOfQuoteOut() public {
        address token = _launchEth(0);
        _skip(10);
        uint256 got = _buyEth(alice, token, 1 ether);
        uint256 before = _pendingTotal(token);
        uint256 quoted = _quote(alice, token, false, got);
        uint256 ethBefore = alice.balance;
        uint256 out = _sell(alice, token, got);
        assertEq(out, quoted);
        assertEq(alice.balance - ethBefore, out);
        uint256 sellFee = _pendingTotal(token) - before;
        // out = gross - 3% * gross
        assertApproxEqAbs(sellFee * 10_000, (out + sellFee) * 300, 10_000);
        // round trip lost ~6% to tax (no LP fee in these pools)
        assertApproxEqRel(out, 0.97 ether * 97 / 100, 1e14);
    }

    function test_snipeTax_onLaunchSecond() public {
        address token = _launchEth(0);
        _buyEth(alice, token, 1 ether);
        assertEq(_pendingTotal(token), 0.99 ether);
        (, uint256 coin,,,) = feeRouter.pending(token);
        assertEq(coin, 0.003 ether + 0.96 ether); // surcharge funds the coin's own buyback
    }

    function test_snipeTax_exemptWallet() public {
        Launchpad.LaunchParams memory p = _params(ETH, 0);
        p.snipeExempt = new address[](1);
        p.snipeExempt[0] = alice;
        uint256 fee = launchpad.launchFee();
        vm.prank(creator);
        address token = launchpad.createLaunch{value: fee}(p);
        _buyEth(alice, token, 1 ether);
        assertEq(_pendingTotal(token), 0.03 ether);
        _skip(1);
        _buyEth(bob, token, 1 ether);
        assertEq(_pendingTotal(token), 0.03 ether + 0.51 ether);
    }

    function test_exactOutput_bothSides() public {
        address token = _launchEth(0);
        _skip(10);
        LaunchInfo memory l = launchpad.getLaunch(token);
        PoolSwapTest.TestSettings memory s = PoolSwapTest.TestSettings(false, false);

        // exact-output buy: ask for 1M coins
        BalanceDelta d = swapRouter.swap{value: 1 ether}(
            l.key, SwapParams(true, int256(1_000_000e18), TickMath.MIN_SQRT_PRICE + 1), s, ""
        );
        uint256 paid = uint256(int256(-d.amount0()));
        assertEq(LaunchToken(token).balanceOf(address(this)), 1_000_000e18);
        uint256 fee = _pendingTotal(token);
        assertApproxEqAbs(fee * 10_000, paid * 300, 10_000);

        // exact-output sell: ask for 0.0005 ETH net
        LaunchToken(token).approve(address(swapRouter), type(uint256).max);
        uint256 ethBefore = address(this).balance;
        swapRouter.swap(l.key, SwapParams(false, int256(0.0005 ether), TickMath.MAX_SQRT_PRICE - 1), s, "");
        assertEq(address(this).balance - ethBefore, 0.0005 ether);
        uint256 sellFee = _pendingTotal(token) - fee;
        assertApproxEqAbs(sellFee * 10_000, (0.0005 ether + sellFee) * 300, 10_000);
    }

    function test_liquidityIsLocked() public {
        address token = _launchEth(0);
        LaunchInfo memory l = launchpad.getLaunch(token);
        vm.expectRevert();
        lpRouter.modifyLiquidity{value: 1 ether}(
            l.key, ModifyLiquidityParams(TickMath.minUsableTick(200), TickMath.maxUsableTick(200), 1e18, 0), ""
        );
        vm.expectRevert();
        lpRouter.modifyLiquidity(
            l.key, ModifyLiquidityParams(TickMath.minUsableTick(200), TickMath.maxUsableTick(200), -1e18, 0), ""
        );
    }

    function test_cannotInitPoolWithHook() public {
        PoolKey memory key = PoolKey(ETH, Currency.wrap(address(usdg)), 0, 200, hook);
        vm.expectRevert();
        pm.initialize(key, TickMath.getSqrtPriceAtTick(0));
    }

    function test_graduation() public {
        address token = _launchEth(0);
        _skip(10);
        PoolId id = launchpad.getLaunch(token).key.toId();
        _buyEth(alice, token, 3 ether);
        (,,, bool graduated,,,,,) = hook.pools(id);
        assertFalse(graduated);
        _buyEth(bob, token, 2 ether);
        (,,, graduated,,,,,) = hook.pools(id);
        assertTrue(graduated);
        assertGe(hook.quoteInPool(id), 4.2 ether);
    }

    function test_twap_tracksPrice() public {
        address token = _launchEth(0);
        PoolId id = launchpad.getLaunch(token).key.toId();
        _skip(10);
        (, int24 startTick,,) = _slot0(id);
        _skip(30 minutes);
        _buyEth(alice, token, 2 ether); // writes an observation at the start price
        (, int24 newTick,,) = _slot0(id);
        (int24 avg, uint32 window) = hook.consult(id, 30 minutes);
        assertGe(window, 30 minutes);
        assertEq(avg, startTick); // TWAP has not yet moved
        _skip(30 minutes);
        (avg,) = hook.consult(id, 30 minutes);
        assertApproxEqAbs(avg, newTick, 1);
    }

    // ---------------------------------------------------------------- helpers

    function _quote(address who, address token, bool isBuy, uint256 amount) internal returns (uint256) {
        vm.prank(who);
        return router.quote(token, isBuy, amount);
    }

    function _slot0(PoolId id) internal view returns (uint160, int24, uint24, uint24) {
        return StateView.getSlot0(pm, id);
    }
}

