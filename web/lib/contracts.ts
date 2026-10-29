import {
  cookHookAbi,
  cookRouterAbi,
  deployments,
  holderAirdropAbi,
  launchpadAbi,
  launchTokenAbi,
  otcReserveAbi,
  protectionFundAbi,
  type Address,
} from "@cook/shared";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

type Deployment = {
  chainId: number;
  poolManager: Address;
  hook: Address;
  launchpad: Address;
  feeRouter: Address;
  otcReserve: Address;
  protectionFund: Address;
  holderAirdrop: Address;
  router: Address;
  mainToken: Address;
  [symbol: string]: Address | number;
};

export const deployment = (deployments as unknown as Record<string, Deployment | undefined>)[String(CHAIN_ID)];

export const addresses = {
  hook: deployment?.hook,
  launchpad: deployment?.launchpad,
  router: deployment?.router,
  otcReserve: deployment?.otcReserve,
  protectionFund: deployment?.protectionFund,
  holderAirdrop: deployment?.holderAirdrop,
  mainToken: deployment?.mainToken,
};

export const abis = {
  hook: cookHookAbi,
  launchpad: launchpadAbi,
  router: cookRouterAbi,
  otc: otcReserveAbi,
  protection: protectionFundAbi,
  airdrop: holderAirdropAbi,
  token: launchTokenAbi,
};

export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const isNative = (a?: string) => !a || /^0x0{40}$/i.test(a);

/** Pull a readable message out of a viem / wallet error. */
export function errorMessage(e: unknown): string {
  if (!e) return "";
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string }; shortMessage?: string } };
  const name = err.cause?.data?.errorName;
  const friendly: Record<string, string> = {
    PoolTooYoung: "OTC opens once the coin's pool has 30 minutes of price history.",
    OverLimit: "That's above this coin's current OTC limit.",
    OverWalletLimit: "That's above your daily OTC cap for this coin.",
    NotEnoughInventory: "The reserve doesn't hold that many coins right now.",
    StaleRate: "The quote-asset price feed is stale. Try again after the keeper updates it.",
    Slippage: "Price moved beyond your slippage setting.",
    QuoteNotEnabled: "That quote asset isn't enabled.",
    WrongValue: "Wrong ETH amount sent.",
    AlreadyClaimed: "Already claimed.",
    BadProof: "Claim proof doesn't match this epoch.",
    ClaimWindowClosed: "This epoch's claim window has closed.",
    NothingToClaim: "Nothing to claim.",
    UnknownCoin: "Unknown coin.",
  };
  if (name && friendly[name]) return friendly[name];
  const msg = err.shortMessage ?? err.cause?.shortMessage ?? err.message ?? String(e);
  if (/User rejected|denied/i.test(msg)) return "Transaction rejected in wallet.";
  for (const [k, v] of Object.entries(friendly)) if (msg.includes(k)) return v;
  return msg.split("\n")[0].slice(0, 180);
}
