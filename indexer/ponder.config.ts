import { createConfig, factory } from "ponder";
import { getAbiItem, type Address } from "viem";
import {
  cookHookAbi,
  deployments,
  feeRouterAbi,
  holderAirdropAbi,
  launchpadAbi,
  launchTokenAbi,
  otcReserveAbi,
  protectionFundAbi,
} from "@cook/shared";

const chainId = Number(process.env.CHAIN_ID ?? 31337);
const d = (deployments as Record<number, Record<string, unknown>>)[chainId];
if (!d) throw new Error(`No deployment for chain ${chainId}. Run the deploy script, then \`pnpm gen\`.`);
const addr = (k: string) => d[k] as Address;
const startBlock = Number(d.startBlock ?? 0);

export default createConfig({
  chains: {
    cook: {
      id: chainId,
      rpc: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      pollingInterval: chainId === 31337 ? 1_000 : 2_000,
      cacheRpcRequests: chainId !== 31337,
    },
  },
  contracts: {
    Launchpad: { chain: "cook", abi: launchpadAbi, address: addr("launchpad"), startBlock },
    CookHook: { chain: "cook", abi: cookHookAbi, address: addr("hook"), startBlock },
    FeeRouter: { chain: "cook", abi: feeRouterAbi, address: addr("feeRouter"), startBlock },
    OTCReserve: { chain: "cook", abi: otcReserveAbi, address: addr("otcReserve"), startBlock },
    ProtectionFund: { chain: "cook", abi: protectionFundAbi, address: addr("protectionFund"), startBlock },
    HolderAirdrop: { chain: "cook", abi: holderAirdropAbi, address: addr("holderAirdrop"), startBlock },
    LaunchToken: {
      chain: "cook",
      abi: launchTokenAbi,
      address: factory({
        address: addr("launchpad"),
        event: getAbiItem({ abi: launchpadAbi, name: "TokenLaunched" }),
        parameter: "token",
      }),
      startBlock,
    },
  },
});
