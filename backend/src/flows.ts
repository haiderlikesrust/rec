import { randomUUID } from "node:crypto";
import { otcPolicy, type OtcQuote, type OtcQuoteRequest } from "@cook/shared";
import { big, one, run, type OtcQuoteRow } from "./db";
import { UserError, memoFor, type Engine } from "./engine";
import { settleOtc } from "./jobs";
import { getCoin } from "./ledger";
import { now, otcCoin, treasury, walletDailyCapSol, walletSoldToday } from "./services";
import { toUnits } from "./prices";

const LAMPORTS = 1_000_000_000;

/**
 * OTC: the reserve quotes a fixed price, reserves the limit, and co-signs one transaction that moves both legs
 * (coins in, SOL out, the 3% to the fee wallet) and burns the coins it took. It settles atomically or not at all.
 */
export async function otcQuote(engine: Engine, req: OtcQuoteRequest): Promise<OtcQuote> {
  if (req.side !== "sell") throw new UserError("The OTC reserve only buys coins, and burns every one it buys.");
  const c = getCoin(req.coin);
  if (!c) throw new UserError("Unknown coin.");
  const amount = big(req.amount);
  if (amount <= 0n) throw new UserError("Enter an amount.");
  const info = otcCoin(c);
  if (!info.twapReady) throw new UserError("OTC opens once the coin has 30 minutes of price history.");
  const spread = otcPolicy.spreadBps / 10_000;
  const at = now();

  // coins in, SOL out at min(spot, TWAP) minus the spread
  const solGross = toUnits(amount, c.decimals) * (info.sellPriceSol / (1 - spread));
  const tax = BigInt(Math.floor(solGross * spread * LAMPORTS));
  const amountOut = BigInt(Math.floor(solGross * LAMPORTS)) - tax;
  if (solGross > info.sellLimitSol) throw new UserError("That's above this coin's current OTC limit.");
  if (walletSoldToday(c.mint, req.wallet, at) + solGross > walletDailyCapSol())
    throw new UserError("That's above your daily OTC cap for this coin.");
  if (amountOut <= 0n) throw new UserError("Amount too small.");
  if (solGross > treasury.otcSol * 0.95) throw new UserError("The reserve can't cover that right now.");

  const id = randomUUID();
  const row: OtcQuoteRow = {
    id,
    coin: c.mint,
    wallet: req.wallet,
    side: req.side,
    amount_in: amount.toString(),
    amount_out: amountOut.toString(),
    tax: tax.toString(),
    sol_gross: solGross,
    price_sol: info.sellPriceSol,
    created_at: at,
    expires_at: at + otcPolicy.quoteTtlSeconds,
    last_valid_height: 0,
    status: "issued",
    signature: null,
  };
  run(
    `INSERT INTO otc_quote (id, coin, wallet, side, amount_in, amount_out, tax, sol_gross, price_sol, created_at, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')`,
    row.id,
    row.coin,
    row.wallet,
    row.side,
    row.amount_in,
    row.amount_out,
    row.tax,
    row.sol_gross,
    row.price_sol,
    row.created_at,
    row.expires_at,
  );
  try {
    const env = await engine.otcTx(row, c);
    if (env.demo && env.signature) settleOtc(id, env.signature, at);
    else run("UPDATE otc_quote SET last_valid_height = ? WHERE id = ?", env.lastValidBlockHeight ?? 0, id);
    return {
      ...env,
      id,
      side: req.side,
      coin: c.mint,
      amountIn: row.amount_in,
      amountOut: row.amount_out,
      taxLamports: row.tax,
      priceSol: row.price_sol,
      expiresAt: row.expires_at,
    };
  } catch (e) {
    run("UPDATE otc_quote SET status = 'expired' WHERE id = ?", id);
    throw e;
  }
}

export async function otcConfirm(engine: Engine, id: string, signature: string) {
  const q = one<OtcQuoteRow>("SELECT * FROM otc_quote WHERE id = ?", id);
  if (!q) throw new UserError("Unknown OTC quote.");
  if (q.status === "done") return { ok: true };
  run("UPDATE otc_quote SET signature = ? WHERE id = ?", signature, id);
  const s = await engine.verify(signature, memoFor("otc", id), "otc");
  if (s === "failed") {
    run("UPDATE otc_quote SET status = 'expired' WHERE id = ?", id);
    throw new UserError("The OTC transaction failed on-chain.");
  }
  if (s === "ok") settleOtc(id, signature);
  return { ok: s === "ok" };
}

