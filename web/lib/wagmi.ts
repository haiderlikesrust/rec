import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { brand, local, robinhood, robinhoodTestnet } from "@cook/shared";
import { CHAIN_ID } from "./contracts";

const all = [local, robinhoodTestnet, robinhood] as const;
const primary = all.find((c) => c.id === CHAIN_ID) ?? local;
const chains = [primary, ...all.filter((c) => c.id !== primary.id)] as unknown as readonly [
  typeof local,
  typeof robinhoodTestnet,
  typeof robinhood,
];

const transports = {
  [local.id]: http(process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545"),
  [robinhoodTestnet.id]: http(process.env.NEXT_PUBLIC_TESTNET_RPC ?? robinhoodTestnet.rpcUrls.default.http[0]),
  [robinhood.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC ?? robinhood.rpcUrls.default.http[0]),
};

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const appName = brand.name;

/** WalletConnect needs a project id; without one we fall back to browser-injected wallets only. */
export const wagmiConfig = projectId
  ? getDefaultConfig({ appName, projectId, chains, transports, ssr: true })
  : createConfig({
      chains,
      transports,
      ssr: true,
      connectors: connectorsForWallets(
        [{ groupName: "Browser wallets", wallets: [injectedWallet, metaMaskWallet, rabbyWallet] }],
        { appName, projectId: "00000000000000000000000000000000" },
      ),
    });

export const primaryChain = primary;
