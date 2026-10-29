// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
import {HookMiner} from "../lib/v4-periphery/test/shared/HookMiner.sol";

import {CookHook} from "../src/CookHook.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {OTCReserve} from "../src/OTCReserve.sol";
import {ProtectionFund} from "../src/ProtectionFund.sol";
import {HolderAirdrop} from "../src/HolderAirdrop.sol";
import {CookRouter} from "../src/CookRouter.sol";
import {Create2Factory} from "../src/utils/Create2Factory.sol";
import {IFeeRouter} from "../src/interfaces/IFeeRouter.sol";
import {IOTCReserve, IProtectionFund, IHolderAirdrop} from "../src/interfaces/ISinks.sol";
import {MockQuoteToken} from "./MockQuoteToken.sol";

/// @notice Deploys the launchpad.
///   PRIVATE_KEY           deployer (owner) key
///   KEEPER                keeper bot address (default: deployer)
///   POOL_MANAGER          existing Uniswap v4 PoolManager (Robinhood Chain mainnet: 0x8366a39c...). Empty = deploy one.
///   MOCK_QUOTES           true = deploy mock USDG / NVDA / TSLA with conversion pools (local + testnet)
///   MOCK_ETH_LIQUIDITY    ETH per mock conversion pool (default 100 ether)
///   LAUNCH_MAIN           true = launch the platform token and register it (default true)
///   PROTECTION_EPOCH_SECS minimum seconds between protection epochs (default 6 days)
contract Deploy is Script {
    Currency internal constant ETH = CurrencyLibrary.ADDRESS_ZERO;
    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    IPoolManager internal pm;
    CookHook internal hook;
    Launchpad internal launchpad;
    FeeRouter internal feeRouter;
    OTCReserve internal otc;
    ProtectionFund internal protection;
    HolderAirdrop internal airdrop;
    CookRouter internal router;
    PoolModifyLiquidityTest internal lpHelper;
    address internal mainToken;

    string internal json = "deployment";

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address keeper = vm.envOr("KEEPER", deployer);
        uint256 startBlock = vm.getBlockNumber();

        vm.startBroadcast(pk);
        _deployCore(deployer, keeper, vm.envOr("POOL_MANAGER", address(0)));
        protection.setParams(1_500, uint40(vm.envOr("PROTECTION_EPOCH_SECS", uint256(6 days))), 60 days);

        launchpad.setQuote(ETH, Launchpad.QuoteConfig(true, 1 ether, 4.2 ether), new PoolKey[](0));
        if (vm.envOr("MOCK_QUOTES", false)) _deployMockQuotes();
        if (vm.envOr("LAUNCH_MAIN", true)) _launchMain();
        vm.stopBroadcast();

        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "startBlock", startBlock);
        vm.serializeAddress(json, "poolManager", address(pm));
        vm.serializeAddress(json, "hook", address(hook));
        vm.serializeAddress(json, "launchpad", address(launchpad));
        vm.serializeAddress(json, "feeRouter", address(feeRouter));
        vm.serializeAddress(json, "otcReserve", address(otc));
        vm.serializeAddress(json, "protectionFund", address(protection));
        vm.serializeAddress(json, "holderAirdrop", address(airdrop));
        vm.serializeAddress(json, "router", address(router));
        vm.serializeAddress(json, "keeper", keeper);
        string memory out = vm.serializeAddress(json, "mainToken", mainToken);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("wrote", path);
    }

    function _deployCore(address deployer, address keeper, address pmAddr) internal {
        pm = pmAddr == address(0) ? IPoolManager(address(new PoolManager(deployer))) : IPoolManager(pmAddr);

        Create2Factory factory = new Create2Factory();
        bytes memory args = abi.encode(address(pm), deployer);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(factory), HOOK_FLAGS, type(CookHook).creationCode, args);
        factory.deploy(salt, abi.encodePacked(type(CookHook).creationCode, args));
        hook = CookHook(hookAddr);

        launchpad = new Launchpad(pm, hook, deployer);
        feeRouter = new FeeRouter(pm, address(hook), launchpad, deployer);
        router = new CookRouter(pm, launchpad);
        otc = new OTCReserve(pm, hook, launchpad, address(feeRouter), deployer);
        protection = new ProtectionFund(address(feeRouter), deployer);
        airdrop = new HolderAirdrop(address(feeRouter), launchpad, deployer);

        address[] memory routers = new address[](1);
        routers[0] = address(router);
        hook.initialize(address(launchpad), IFeeRouter(address(feeRouter)), routers);
        launchpad.setFeeRouter(IFeeRouter(address(feeRouter)));
        feeRouter.setSinks(
            IOTCReserve(address(otc)), IProtectionFund(address(protection)), IHolderAirdrop(address(airdrop))
        );
        feeRouter.setKeeper(keeper, true);
        otc.setKeeper(keeper, true);
        protection.setKeeper(keeper, true);
        airdrop.setKeeper(keeper, true);
    }

    function _deployMockQuotes() internal {
        uint256 ethLiq = vm.envOr("MOCK_ETH_LIQUIDITY", uint256(100 ether));
        lpHelper = new PoolModifyLiquidityTest(pm);

        MockQuoteToken usdg = new MockQuoteToken("Global Dollar", "USDG", 6);
        MockQuoteToken nvda = new MockQuoteToken("NVIDIA Stock Token", "NVDA", 18);
        MockQuoteToken tsla = new MockQuoteToken("Tesla Stock Token", "TSLA", 18);

        // 4,000 USDG per ETH; NVDA 180 USDG; TSLA 250 USDG
        PoolKey memory ethUsdg = _seedPool(ETH, _c(usdg), ethLiq, ethLiq * 4_000e6 / 1e18);
        uint256 usdgSide = ethLiq * 4_000e6 / 1e18;
        PoolKey memory nvdaUsdg = _seedPool(_c(nvda), _c(usdg), usdgSide * 1e18 / 180e6, usdgSide);
        PoolKey memory tslaUsdg = _seedPool(_c(tsla), _c(usdg), usdgSide * 1e18 / 250e6, usdgSide);

        PoolKey[] memory r1 = new PoolKey[](1);
        r1[0] = ethUsdg;
        launchpad.setQuote(_c(usdg), Launchpad.QuoteConfig(true, 4_000e6, 16_800e6), r1);

        PoolKey[] memory r2 = new PoolKey[](2);
        r2[0] = nvdaUsdg;
        r2[1] = ethUsdg;
        launchpad.setQuote(_c(nvda), Launchpad.QuoteConfig(true, 22e18, 93e18), r2);
        r2[0] = tslaUsdg;
        launchpad.setQuote(_c(tsla), Launchpad.QuoteConfig(true, 16e18, 67e18), r2);

        vm.serializeAddress(json, "USDG", address(usdg));
        vm.serializeAddress(json, "NVDA", address(nvda));
        vm.serializeAddress(json, "TSLA", address(tsla));
    }

    function _launchMain() internal {
        Launchpad.LaunchParams memory p;
        p.name = "Recur";
        p.symbol = "RECR";
        p.meta = LaunchToken.Metadata(
            "/brand/recur.svg",
            "The launchpad token. 10% of every fee on every coin buys it back and burns it.",
            "",
            "",
            ""
        );
        p.quote = ETH;
        p.initialBuy = 0.2 ether;
        p.snipeExempt = new address[](0);
        mainToken = launchpad.createLaunch{value: launchpad.launchFee() + p.initialBuy}(p);
        launchpad.setMainToken(mainToken);
    }

    /// @dev Creates a hookless 0.3% pool between two assets at the price implied by the amounts and adds
    ///      full-range liquidity of roughly those amounts.
    function _seedPool(Currency a, Currency b, uint256 amountA, uint256 amountB) internal returns (PoolKey memory key) {
        (Currency c0, Currency c1, uint256 a0, uint256 a1) = a < b ? (a, b, amountA, amountB) : (b, a, amountB, amountA);
        key = PoolKey(c0, c1, 3000, 60, IHooks(address(0)));
        pm.initialize(key, uint160(Math.sqrt(FullMath.mulDiv(a1, 1 << 192, a0))));
        if (!c0.isAddressZero()) MockQuoteToken(Currency.unwrap(c0)).approve(address(lpHelper), type(uint256).max);
        MockQuoteToken(Currency.unwrap(c1)).approve(address(lpHelper), type(uint256).max);
        lpHelper.modifyLiquidity{value: c0.isAddressZero() ? a0 + a0 / 50 : 0}(
            key,
            ModifyLiquidityParams(
                TickMath.minUsableTick(60), TickMath.maxUsableTick(60), int256(Math.sqrt(a0 * a1)), 0
            ),
            ""
        );
    }

    function _c(MockQuoteToken t) internal pure returns (Currency) {
        return Currency.wrap(address(t));
    }
}
