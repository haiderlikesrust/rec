import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { encodeAbiParameters, keccak256, parseEther, type Address, type Hex } from "viem";
import {
  cookRouterAbi,
  planProtectionEpoch,
  feeRouterAbi,
  holderAirdropAbi,
  launchpadAbi,
  otcReserveAbi,
  protectionFundAbi,
  NATIVE,
  type Coin,
  type Holder,
  type ProtectionLoss,
} from "@cook/shared";
import { type Ctx, waitForIndexer } from "./config";

const POOLS_SLOT = 6n;
const poolManagerAbi = [
  { type: "function", name: "extsload", stateMutability: "view", inputs: [{ name: "slot", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
] as const;

type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

const poolId = (k: PoolKey) =>
  keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );

async function spotSqrtPrice(ctx: Ctx, key: PoolKey): Promise<bigint> {
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId(key), POOLS_SLOT]));
  const word = await ctx.pub.readContract({ abi: poolManagerAbi, address: ctx.d.poolManager, functionName: "extsload", args: [slot] });
  return BigInt(word) & ((1n << 160n) - 1n);
}

async function send(ctx: Ctx, req: Parameters<Ctx["wallet"]["writeContract"]>[0]) {
  // fee processing nests swaps and hook callbacks; a bare estimate can come up short, so pad it
  const estimate = await ctx.pub.estimateContractGas({ ...req, account: ctx.wallet.account } as never);
  const hash = await ctx.wallet.writeContract({ ...req, gas: (estimate * 13n) / 10n } as never);
  const receipt = await ctx.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return receipt;
}

async function indexer<T>(ctx: Ctx, p: string): Promise<T> {
  const res = await fetch(`${ctx.indexerUrl}${p}`);
  if (!res.ok) throw new Error(`indexer ${res.status} ${p}`);
  return res.json() as Promise<T>;
}

function loadState(ctx: Ctx): { airdropEpochs: Record<string, number>; protectionTo: number } {
  const f = path.join(ctx.dataDir, "state.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { airdropEpochs: {}, protectionTo: 0 };
}
function saveState(ctx: Ctx, s: ReturnType<typeof loadState>) {
  writeFileSync(path.join(ctx.dataDir, "state.json"), JSON.stringify(s, null, 2));
}

async function chainNow(ctx: Ctx) {
  return Number((await ctx.pub.getBlock()).timestamp);
}

// ---------------------------------------------------------------- quote rates

/** ETH per quote from the quote's conversion route (spot), pushed to the OTC reserve when it moves. */
export async function updateQuoteRates(ctx: Ctx) {
  const count = await ctx.pub.readContract({ abi: launchpadAbi, address: ctx.d.launchpad, functionName: "quoteCount" });
  for (let i = 0n; i < count; i++) {
    const quote = await ctx.pub.readContract({ abi: launchpadAbi, address: ctx.d.launchpad, functionName: "quoteList", args: [i] });
    if (quote === NATIVE) continue;
    const route = (await ctx.pub.readContract({
      abi: launchpadAbi,
      address: ctx.d.launchpad,
      functionName: "quoteRoute",
      args: [quote],
    })) as readonly PoolKey[];
    let cur = quote.toLowerCase();
    let ratio = 1; // raw ETH per raw quote
    for (const key of route) {
      const s = Number(await spotSqrtPrice(ctx, key)) / 2 ** 96;
      const p = s * s; // currency1 per currency0
      const isC0 = key.currency0.toLowerCase() === cur;
      ratio *= isC0 ? p : 1 / p;
      cur = (isC0 ? key.currency1 : key.currency0).toLowerCase();
    }
    const wad = BigInt(Math.round(ratio * 1e18));
    const [old, updatedAt] = await ctx.pub.readContract({
      abi: otcReserveAbi,
      address: ctx.d.otcReserve,
      functionName: "quoteRates",
      args: [quote],
    });
    const stale = (await chainNow(ctx)) - Number(updatedAt) > 6 * 3600;
    const moved = old === 0n || Number(old > wad ? old - wad : wad - old) / Number(old) > 0.005;
    if (stale || moved) {
      await send(ctx, { abi: otcReserveAbi, address: ctx.d.otcReserve, functionName: "setQuoteRate", args: [quote, wad] });
      ctx.log(`rate ${quote.slice(0, 8)} = ${(ratio * 1e18).toExponential(3)} wei/1e18`);
    }
  }
}

// ---------------------------------------------------------------- fee processing

export async function processFees(ctx: Ctx, minEth = 0) {
  const total = await ctx.pub.readContract({ abi: launchpadAbi, address: ctx.d.launchpad, functionName: "allTokensLength" });
  const main = ctx.d.mainToken;
  let processed = 0;
  for (let i = 0n; i < total; i++) {
    const token = await ctx.pub.readContract({ abi: launchpadAbi, address: ctx.d.launchpad, functionName: "allTokens", args: [i] });
    const [mainB, coinB, otcB, protB, airB] = await ctx.pub.readContract({
      abi: feeRouterAbi,
      address: ctx.d.feeRouter,
      functionName: "pending",
      args: [token],
    });
    const sum = mainB + coinB + otcB + protB + airB;
    if (sum === 0n) continue;
    const launch = await ctx.pub.readContract({ abi: launchpadAbi, address: ctx.d.launchpad, functionName: "getLaunch", args: [token] });
    const isEth = launch.quote === NATIVE;
    let ethPerQuote = 1;
    if (!isEth) {
      const [wad] = await ctx.pub.readContract({ abi: otcReserveAbi, address: ctx.d.otcReserve, functionName: "quoteRates", args: [launch.quote] });
      ethPerQuote = Number(wad) / 1e18;
    }
    const sumEth = Number(sum) * ethPerQuote;
    if (sumEth < minEth * 1e18) continue;

    // slippage floors from live quotes (protocol swaps are tax-free, so real fills beat these)
    const quoteOut = async (t: Address, amount: bigint) =>
      amount === 0n
        ? 0n
        : (
            await ctx.pub.simulateContract({
              abi: cookRouterAbi,
              address: ctx.d.router,
              functionName: "quote",
              args: [t, true, amount],
              account: ctx.wallet.account,
            })
          ).result;
    const minCoinOut = ((await quoteOut(token, coinB)) * 90n) / 100n;
    const ethExpected = BigInt(Math.floor(Number(mainB + otcB + protB) * ethPerQuote));
    const minEthOut = isEth ? 0n : (ethExpected * 85n) / 100n;
    const heldMainEth = await ctx.pub.readContract({ abi: feeRouterAbi, address: ctx.d.feeRouter, functionName: "pendingMainEth" });
    const mainEth = (ethExpected * mainB) / (mainB + otcB + protB || 1n) + heldMainEth;
    const minMainOut = main ? ((await quoteOut(main, mainEth)) * 85n) / 100n : 0n;

    await send(ctx, {
      abi: feeRouterAbi,
      address: ctx.d.feeRouter,
      functionName: "process",
      args: [{ token, minCoinOut, minEthOut, minMainOut }],
    });
    processed++;
  }
  if (processed) ctx.log(`processed fees for ${processed} coin(s)`);
  return processed;
}

// ---------------------------------------------------------------- airdrops

/** Hourly: each coin's airdrop bucket goes to holders whose average entry is above the current price. */
export async function runAirdrops(ctx: Ctx) {
  await waitForIndexer(ctx);
  const state = loadState(ctx);
  const epoch = Math.floor((await chainNow(ctx)) / 3600);
  const coins = await indexer<Coin[]>(ctx, "/api/coins?limit=500");
  let paid = 0;
  for (const c of coins) {
    if ((state.airdropEpochs[c.address] ?? -1) >= epoch) continue;
    const balance = await ctx.pub.readContract({ abi: holderAirdropAbi, address: ctx.d.holderAirdrop, functionName: "balanceOf", args: [c.address] });
    if (balance === 0n) continue;
    const holders = (await indexer<Holder[]>(ctx, `/api/coins/${c.address}/holders`)).filter((h) => h.airdropEligible);
    if (holders.length === 0) continue; // keep the bucket for the next epoch

    const recipients: Address[] = [];
    const amounts: bigint[] = [];
    for (const h of holders) {
      const amt = (balance * BigInt(Math.floor(h.airdropWeight * 1e9))) / 1_000_000_000n;
      if (amt > 0n) {
        recipients.push(h.address);
        amounts.push(amt);
      }
    }
    for (let b = 0; b * 100 < recipients.length; b++) {
      await send(ctx, {
        abi: holderAirdropAbi,
        address: ctx.d.holderAirdrop,
        functionName: "distribute",
        args: [c.address, BigInt(epoch), BigInt(b), recipients.slice(b * 100, b * 100 + 100), amounts.slice(b * 100, b * 100 + 100)],
      });
    }
    state.airdropEpochs[c.address] = epoch;
    paid++;
  }
  saveState(ctx, state);
  if (paid) ctx.log(`airdropped ${paid} coin(s) for epoch ${epoch}`);
  return paid;
}

// ---------------------------------------------------------------- protection epochs

type ProtectionInput = {
  losses: ProtectionLoss[];
  contributedEth: Record<string, number>;
  totalContributedEth: number;
};

/** When an epoch is due: cover realized losses since the last epoch. Each coin draws only its share of the
 *  on-chain budget (by what it paid into the fund), so the total always fits the budget. */
export async function runProtectionEpoch(ctx: Ctx) {
  const pf = { abi: protectionFundAbi, address: ctx.d.protectionFund } as const;
  const [last, minInterval, count, budget] = await Promise.all([
    ctx.pub.readContract({ ...pf, functionName: "lastPublished" }),
    ctx.pub.readContract({ ...pf, functionName: "minEpochInterval" }),
    ctx.pub.readContract({ ...pf, functionName: "epochCount" }),
    ctx.pub.readContract({ ...pf, functionName: "epochBudget" }),
  ]);
  const now = await chainNow(ctx);
  if (Number(last) !== 0 && now < Number(last) + Number(minInterval)) return false;

  await waitForIndexer(ctx);
  const state = loadState(ctx);
  const input = await indexer<ProtectionInput>(ctx, `/api/keeper/protection-input?from=${state.protectionTo}&to=${now}`);
  // a hair under the budget so wei rounding can never exceed it
  const budgetEth = (Number(budget) / 1e18) * 0.999;
  const plan = planProtectionEpoch(input.losses, input.contributedEth, input.totalContributedEth, budgetEth);
  if (plan.totalEth === 0) {
    state.protectionTo = now;
    saveState(ctx, state);
    return false;
  }

  const epoch = count + 1n;
  const values: [Address, bigint, bigint][] = [];
  for (const [wallet, w] of plan.wallets) {
    const amount = parseEther(w.totalEth.toFixed(18));
    if (amount > 0n) values.push([wallet as Address, epoch, amount]);
  }
  if (values.length === 0) return false;
  const tree = StandardMerkleTree.of(values, ["address", "uint256", "uint256"]);
  const total = values.reduce((s, v) => s + v[2], 0n);

  const file = `epoch-${epoch}.json`;
  await send(ctx, { ...pf, functionName: "publishEpoch", args: [tree.root as Hex, total, `keeper://${file}`] });
  writeFileSync(
    path.join(ctx.dataDir, file),
    JSON.stringify(
      {
        epoch: Number(epoch),
        root: tree.root,
        total: total.toString(),
        window: { from: state.protectionTo, to: now },
        coins: Object.fromEntries(plan.coins),
        claims: [...tree.entries()].map(([i, v]) => ({
          account: v[0],
          amount: v[2].toString(),
          proof: tree.getProof(i),
          breakdown: plan.wallets.get(v[0])!.breakdown,
        })),
      },
      null,
      2,
    ),
  );
  state.protectionTo = now;
  saveState(ctx, state);
  ctx.log(`protection epoch ${epoch}: ${values.length} wallet(s) across ${plan.coins.size} coin(s), ${(Number(total) / 1e18).toFixed(4)} ETH`);
  return true;
}
