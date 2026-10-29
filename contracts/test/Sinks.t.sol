// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Currency} from "v4-core/types/Currency.sol";

import {BaseTest} from "./Base.t.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {OTCReserve} from "../src/OTCReserve.sol";
import {ProtectionFund} from "../src/ProtectionFund.sol";
import {HolderAirdrop} from "../src/HolderAirdrop.sol";
import {KeeperAuth} from "../src/libraries/KeeperAuth.sol";

contract SinksTest is BaseTest {
    address internal mainToken;

    function setUp() public override {
        super.setUp();
        // the platform token is itself a launch, paired with ETH
        mainToken = _launchEth(0.5 ether);
        launchpad.setMainToken(mainToken);
        _skip(10);
    }

    function _process(address token) internal {
        vm.prank(keeper);
        feeRouter.process(FeeRouter.ProcessParams(token, 0, 0, 0));
    }

    // ---------------------------------------------------------------- FeeRouter

    function test_process_ethCoin_burnsAndFundsEverything() public {
        address token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 10 ether); // 0.3 ETH tax
        uint256 supplyBefore = LaunchToken(token).totalSupply();
        uint256 mainSupplyBefore = LaunchToken(mainToken).totalSupply();

        _process(token);

        assertLt(LaunchToken(token).totalSupply(), supplyBefore, "coin burned");
        assertLt(LaunchToken(mainToken).totalSupply(), mainSupplyBefore, "main burned");
        assertEq(address(otc).balance, 0.09 ether, "30% to OTC");
        assertEq(address(protection).balance, 0.12 ether, "40% to protection");
        assertEq(airdrop.balanceOf(token), 0.03 ether, "10% to airdrop");
        assertEq(address(airdrop).balance, 0.03 ether);
        assertEq(feeRouter.pendingMainEth(), 0, "held launch fees spent on main buyback");
        assertEq(pm.balanceOf(address(feeRouter), ETH.toId()), _pendingTotal(mainToken), "only main's own fees left");
        (uint256 credit,,,,,) = otc.coins(token);
        assertEq(credit, 0.18 ether, "credit = 2x contribution");
    }

    function test_process_usdgCoin_convertsToEth() public {
        address token = _launchUsdg(0);
        _skip(10);
        _buyUsdg(alice, token, 40_000e6); // 1,200 USDG tax ~ 0.3 ETH
        uint256 supplyBefore = LaunchToken(token).totalSupply();

        _process(token);

        assertLt(LaunchToken(token).totalSupply(), supplyBefore);
        // 70% of 1,200 USDG (840 USDG ~ 0.21 ETH) became ETH split 30:40 between OTC and protection, 10% bought main
        assertApproxEqRel(address(otc).balance, 0.09 ether, 0.01e18);
        assertApproxEqRel(address(protection).balance, 0.12 ether, 0.01e18);
        // airdrop stays in USDG
        assertEq(airdrop.balanceOf(token), 120e6);
        assertEq(usdg.balanceOf(address(airdrop)), 120e6);
    }

    function test_process_onlyKeeper() public {
        address token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 1 ether);
        vm.expectRevert(KeeperAuth.NotKeeper.selector);
        feeRouter.process(FeeRouter.ProcessParams(token, 0, 0, 0));
    }

    function test_process_slippageGuard() public {
        address token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 1 ether);
        vm.prank(keeper);
        vm.expectRevert(FeeRouter.Slippage.selector);
        feeRouter.process(FeeRouter.ProcessParams(token, type(uint256).max, 0, 0));
    }

    function test_protocolSwapsAreTaxFree() public {
        address token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 1 ether);
        _process(token);
        // buybacks swapped in both pools without paying tax back into the router
        assertEq(_pendingTotal(token), 0);
    }

    // ---------------------------------------------------------------- OTC reserve

    function _activeCoinWithReserve() internal returns (address token) {
        token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 20 ether);
        _buyEth(bob, token, 20 ether);
        _process(token);
        _skip(31 minutes); // TWAP needs 30 minutes of history
    }

    function test_otc_sellWithinLimit() public {
        address token = _activeCoinWithReserve();
        uint256 limit = otc.sellLimit(token);
        assertGt(limit, 0);
        uint256 walletCap = address(otc).balance * otc.walletDailyBps() / 10_000;
        uint256 amount = 1e18 * ((limit < walletCap ? limit : walletCap) / 2) / otc.quoteSell(token, 1e18);
        uint256 quoted = otc.quoteSell(token, amount);
        assertLe(quoted, limit);

        uint256 before = alice.balance;
        vm.startPrank(alice);
        LaunchToken(token).approve(address(otc), amount);
        otc.sellToReserve(token, amount, quoted);
        vm.stopPrank();
        assertEq(alice.balance - before, quoted);
        (,,, uint256 inventory,,) = otc.coins(token);
        assertEq(inventory, amount);

        // and someone can buy the inventory back at >= the price the reserve paid
        uint256 out = otc.quoteBuy(token, quoted);
        assertLt(out, amount);
    }

    function test_otc_overLimitReverts() public {
        address token = _activeCoinWithReserve();
        uint256 amount = LaunchToken(token).balanceOf(alice);
        vm.startPrank(alice);
        LaunchToken(token).approve(address(otc), amount);
        vm.expectRevert(OTCReserve.OverLimit.selector);
        otc.sellToReserve(token, amount, 0);
        vm.stopPrank();
    }

    function test_otc_deadCoinFadesToFloor() public {
        address token = _activeCoinWithReserve();
        assertEq(otc.activityBps(token), 10_000);
        _skip(10 days);
        uint256 mid = otc.activityBps(token);
        assertLt(mid, 10_000);
        assertGt(mid, 500);
        _skip(60 days);
        assertEq(otc.activityBps(token), 500);
    }

    function test_otc_coinWithoutContributionsHasNoLimit() public {
        address token = _activeCoinWithReserve();
        address quiet = _launchEth(0);
        assertGt(otc.sellLimit(token), 0);
        assertEq(otc.sellLimit(quiet), 0);
    }

    function test_otc_youngPoolCannotQuote() public {
        address token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 1 ether);
        vm.expectRevert(OTCReserve.PoolTooYoung.selector);
        otc.quoteSell(token, 1e18);
    }

    function test_otc_twapResistsSpotPump() public {
        address token = _activeCoinWithReserve();
        uint256 amount = 1_000_000e18;
        uint256 fair = otc.quoteSell(token, amount);
        _buyEth(bob, token, 30 ether); // pump the spot price
        uint256 afterPump = otc.quoteSell(token, amount);
        assertEq(afterPump, fair, "seller is paid min(spot, TWAP)");
    }

    // ---------------------------------------------------------------- protection fund

    function _fundProtection() internal returns (address token) {
        token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 30 ether);
        _process(token); // 0.36 ETH into protection
    }

    function _leaf(address account, uint256 epoch, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, epoch, amount))));
    }

    function _root(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function test_protection_claimFlow() public {
        _fundProtection();
        uint256 budget = protection.epochBudget();
        uint256 aAmt = budget / 2;
        uint256 bAmt = budget / 4;
        bytes32 la = _leaf(alice, 1, aAmt);
        bytes32 lb = _leaf(bob, 1, bAmt);
        vm.prank(keeper);
        protection.publishEpoch(_root(la, lb), aAmt + bAmt, "ipfs://epoch1");

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;
        uint256 before = alice.balance;
        protection.claim(1, alice, aAmt, proof);
        assertEq(alice.balance - before, aAmt);

        vm.expectRevert(ProtectionFund.AlreadyClaimed.selector);
        protection.claim(1, alice, aAmt, proof);

        vm.expectRevert(ProtectionFund.BadProof.selector);
        protection.claim(1, bob, bAmt + 1, _single(la));
    }

    function test_protection_epochBudgetEnforced() public {
        _fundProtection();
        uint256 budget = protection.epochBudget();
        assertEq(budget, address(protection).balance * 1_500 / 10_000);
        vm.prank(keeper);
        vm.expectRevert(ProtectionFund.OverBudget.selector);
        protection.publishEpoch(bytes32(uint256(1)), budget + 1, "");
    }

    function test_protection_epochSpacing() public {
        _fundProtection();
        vm.startPrank(keeper);
        protection.publishEpoch(bytes32(uint256(1)), 1, "");
        vm.expectRevert(ProtectionFund.TooSoon.selector);
        protection.publishEpoch(bytes32(uint256(2)), 1, "");
        vm.stopPrank();
        _skip(6 days);
        vm.prank(keeper);
        protection.publishEpoch(bytes32(uint256(2)), 1, "");
    }

    function test_protection_sweepReleasesUnclaimed() public {
        _fundProtection();
        vm.prank(keeper);
        protection.publishEpoch(bytes32(uint256(1)), 0.01 ether, "");
        assertEq(protection.reserved(), 0.01 ether);
        vm.expectRevert(ProtectionFund.ClaimWindowOpen.selector);
        protection.sweep(1);
        _skip(61 days);
        protection.sweep(1);
        assertEq(protection.reserved(), 0);
    }

    // ---------------------------------------------------------------- airdrop

    function test_airdrop_distribute() public {
        address token = _launchEth(0);
        _skip(10);
        _buyEth(alice, token, 10 ether);
        _process(token); // 0.03 ETH airdrop bucket

        address[] memory to = new address[](2);
        to[0] = alice;
        to[1] = bob;
        uint256[] memory amts = new uint256[](2);
        amts[0] = 0.02 ether;
        amts[1] = 0.01 ether;
        uint256 bobBefore = bob.balance;
        vm.prank(keeper);
        airdrop.distribute(token, 1, 0, to, amts);
        assertEq(bob.balance - bobBefore, 0.01 ether);
        assertEq(airdrop.balanceOf(token), 0);

        vm.prank(keeper);
        vm.expectRevert(HolderAirdrop.BatchAlreadyPaid.selector);
        airdrop.distribute(token, 1, 0, to, amts);

        vm.prank(keeper);
        vm.expectRevert(HolderAirdrop.OverBalance.selector);
        airdrop.distribute(token, 2, 0, to, amts);
    }

    function test_airdrop_usdgAndRejectingRecipient() public {
        address token = _launchUsdg(0);
        _skip(10);
        _buyUsdg(alice, token, 10_000e6);
        _process(token); // 30 USDG bucket
        address[] memory to = new address[](1);
        to[0] = bob;
        uint256[] memory amts = new uint256[](1);
        amts[0] = 30e6;
        vm.prank(keeper);
        airdrop.distribute(token, 1, 0, to, amts);
        assertEq(usdg.balanceOf(bob), 1_000_000e6 + 30e6);
    }

    function _single(bytes32 x) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = x;
    }
}
