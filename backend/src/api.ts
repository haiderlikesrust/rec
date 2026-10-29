import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  LAUNCH_FEE_SOL,
  PROTECTION_PAYOUT_BPS,
  clusters,
  isSolanaAddress,
  type ActivityItem,
  type Candle,
  type CoinDetail,
  type CoinSort,
  type LaunchRequest,
  type OtcQuoteRequest,
  type PlatformStats,
  type Position,
  type ProtectionStatus,
  type SwapRequest,
  type Trade,
  type WalletSummary,
} from "@cook/shared";
import { config, log, roles } from "./config";
import { lease } from "./lease";
import { all, big, kvGet, kvSet, one, type CoinRow, type HolderRow, type QuoteRow, type TradeRow } from "./db";
import { UserError, type Engine } from "./engine";
import { otcConfirm, otcQuote } from "./flows";
import { getCoin } from "./ledger";
import { solUsd, toQuoteAsset, toUnits } from "./prices";
import {
  allCoins,
  coinCandles24h,
  coinProtection,
  coveredLosses,
  holdersOf,
  now,
  otcCoin,
  owedProtectionSol,
  quotesMap,
  shapeCoin,
  sortCoins,
  treasury,
  walletDailyCapSol,
  walletProtection,
  walletSoldToday,
} from "./services";

export function createApi(engine: Engine) {
  const app = new Hono();
  app.use("*", cors());
  app.onError((err, ctx) => {
    if (err instanceof UserError) return ctx.json({ error: err.message }, 400);
    log(`api ${ctx.req.method} ${ctx.req.path}: ${err.message}`);
    return ctx.json({ error: friendly(err) }, 500);
  });

  const address = (ctx: Context, name: string) => {
    const v = ctx.req.param(name) ?? "";
    if (!isSolanaAddress(v)) throw new UserError("Not a Solana address.");
    return v;
  };

  // ---------------------------------------------------------------- reads

  app.get("/api/quotes", (ctx) =>
    // a quote needs a live USD price: it sets where the curve starts and graduates
    ctx.json(all<QuoteRow>("SELECT * FROM quote WHERE available = 1 AND usd > 0 ORDER BY rowid").map(toQuoteAsset)),
  );

  app.get("/api/stats", (ctx) => {
    const since = now() - 86_400;
    const sums = one<{ fees: number; meteora: number; airdropped: number; burnedValue: number; protection: number; coins: number }>(
      `SELECT COALESCE(SUM(fees_sol), 0) AS fees, COALESCE(SUM(meteora_sol), 0) AS meteora, COALESCE(SUM(airdropped_sol), 0) AS airdropped,
         COALESCE(SUM(burned_value_sol), 0) AS burnedValue, COALESCE(SUM(sol_to_protection), 0) AS protection, COUNT(*) AS coins FROM coin`,
    )!;
    const vol = one<{ v: number }>("SELECT COALESCE(SUM(sol_value), 0) AS v FROM trade WHERE ts >= ? AND kind = 'trade'", since)!.v;
    const main = one<CoinRow>("SELECT * FROM coin WHERE is_main = 1");
    const sUsd = solUsd();
    const stats: PlatformStats = {
      cluster: config.cluster,
      demo: engine.demo,
      solUsd: sUsd,
      coins: sums.coins,
      mainToken: main?.mint ?? null,
      volume24hSol: vol,
      volume24hUsd: vol * sUsd,
      totalFeesSol: sums.fees,
      totalFeesUsd: sums.fees * sUsd,
      meteoraFeesSol: sums.meteora,
      mainBurned: kvGet("main_burned") ?? "0",
      mainSupply: main?.total_supply ?? "0",
      otcReserveSol: treasury.otcSol,
      protectionFundSol: treasury.protectionSol,
      protectionPaidSol: toUnits(kvGet("protection_paid") ?? "0", 9),
      airdroppedSol: sums.airdropped,
      coinsBurnedSol: sums.burnedValue,
      treasury: roles.map((r) => ({
        role: r.role,
        label: r.label,
        address: engine.wallets[r.role],
        sol: { fees: treasury.feesSol, otc: treasury.otcSol, protection: treasury.protectionSol, airdrop: treasury.airdropSol }[r.role],
      })),
    };
    return ctx.json(stats);
  });

  app.get("/api/coins", (ctx) => {
    const sort = (ctx.req.query("sort") ?? "mcap") as CoinSort;
    const quote = ctx.req.query("quote");
    const search = ctx.req.query("search")?.toLowerCase().trim();
    const limit = Math.min(Number(ctx.req.query("limit") ?? 100), 500);
    let list = allCoins();
    if (quote && quote !== "all") list = list.filter((c) => c.quote.address === quote || c.quote.category === quote);
    if (search)
      list = list.filter(
        (c) => c.name.toLowerCase().includes(search) || c.symbol.toLowerCase().includes(search) || c.address.toLowerCase() === search,
      );
    return ctx.json(sortCoins(list, sort).slice(0, limit));
  });

  app.get("/api/trending", (ctx) =>
    ctx.json(
      allCoins()
        .filter((c) => c.volume24hUsd > 0)
        .sort((a, b) => b.volume24hUsd - a.volume24hUsd || b.trades24h - a.trades24h)
        .slice(0, 10),
    ),
  );

  app.get("/api/coins/:address", (ctx) => {
    const mint = address(ctx, "address");
    const c = getCoin(mint);
    if (!c) return ctx.json({ error: "not found" }, 404);
    const q = quotesMap().get(c.quote)!;
    const trades24h = one<{ n: number }>("SELECT COUNT(*) AS n FROM trade WHERE coin = ? AND ts >= ? AND kind = 'trade'", mint, now() - 86_400)!.n;
    const detail: CoinDetail = {
      ...shapeCoin(c, q, coinCandles24h(mint), trades24h),
      buckets: {
        coinBurned: c.coin_burned,
        solToOtc: c.sol_to_otc,
        solToProtection: c.sol_to_protection,
        solToMainBuyback: c.sol_to_main,
        airdropQuote: c.airdrop_quote,
        meteoraQuote: c.meteora_quote,
        pendingQuote: (big(c.income_quote) - big(c.split_quote)).toString(),
      },
      otc: otcCoin(c),
      airdropsPaid: c.airdrops_paid,
      airdropRecipientsLastEpoch: c.airdrop_last_recipients,
      buybacks24h: (() => {
        const rows = all<{ token_amount: string; quote_amount: string }>(
          "SELECT token_amount, quote_amount FROM trade WHERE coin = ? AND kind = 'buyback' AND ts >= ?",
          mint,
          now() - 86_400,
        );
        const quote = rows.reduce((s, r) => s + big(r.quote_amount), 0n);
        return {
          count: rows.length,
          tokenAmount: rows.reduce((s, r) => s + big(r.token_amount), 0n).toString(),
          usd: toUnits(quote, q.decimals) * q.usd,
        };
      })(),
      protection: coinProtection(c),
    };
    return ctx.json(detail);
  });

  app.get("/api/coins/:address/candles", (ctx) => {
    const mint = address(ctx, "address");
    const interval = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 }[ctx.req.query("interval") ?? "5m"] ?? 300;
    const rows = all<Candle & { coin: string }>("SELECT * FROM candle WHERE coin = ? AND t >= ? ORDER BY t", mint, now() - interval * 500);
    const out: Candle[] = [];
    for (const k of rows) {
      const t = Math.floor(k.t / interval) * interval;
      const last = out[out.length - 1];
      if (last && last.t === t) {
        last.h = Math.max(last.h, k.h);
        last.l = Math.min(last.l, k.l);
        last.c = k.c;
        last.v += k.v;
      } else out.push({ t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
    }
    return ctx.json(out);
  });

  app.get("/api/coins/:address/trades", (ctx) => {
    const mint = address(ctx, "address");
    const limit = Math.min(Number(ctx.req.query("limit") ?? 50), 200);
    // buybacks run every few seconds; the UI hides them from the feed by default (?buybacks=0)
    const hideBuybacks = ctx.req.query("buybacks") === "0";
    const rows = all<TradeRow>(
      `SELECT * FROM trade WHERE coin = ? ${hideBuybacks ? "AND kind != 'buyback'" : ""} ORDER BY ts DESC, rowid DESC LIMIT ?`,
      mint,
      limit,
    );
    const trades: Trade[] = rows.map((t) => ({
      id: t.id,
      tx: t.tx,
      t: t.ts,
      trader: t.trader,
      isBuy: t.is_buy === 1,
      quoteAmount: t.quote_amount,
      tokenAmount: t.token_amount,
      tax: t.tax,
      price: t.price,
      kind: t.kind as Trade["kind"],
    }));
    return ctx.json(trades);
  });

  app.get("/api/coins/:address/holders", (ctx) => ctx.json(holdersOf(address(ctx, "address"))));

  app.get("/api/wallet/:address", (ctx) => {
    const wallet = address(ctx, "address");
    const coins = new Map(allCoins().map((c) => [c.address, c]));
    const positions: Position[] = all<HolderRow>("SELECT * FROM holder WHERE wallet = ? AND (balance != '0' OR airdrops != '0')", wallet)
      .filter((h) => coins.has(h.coin))
      .map((h) => {
        const c = coins.get(h.coin)!;
        const bal = toUnits(h.balance, c.decimals);
        const basis = toUnits(h.cost_basis, c.quote.decimals);
        const value = bal * c.price;
        const avgEntry = bal > 0 ? basis / bal : 0;
        const realized = toUnits(h.realized.startsWith("-") ? -big(h.realized.slice(1)) : big(h.realized), c.quote.decimals);
        const usd = c.quote.usdPerUnit;
        return {
          coin: c,
          balance: h.balance,
          avgEntry,
          costBasis: h.cost_basis,
          value,
          valueUsd: value * usd,
          unrealized: value - basis,
          unrealizedUsd: (value - basis) * usd,
          realizedPnl: realized,
          realizedPnlUsd: realized * usd,
          firstBuyAt: h.first_buy_at,
          taxPaid: h.tax_paid,
          airdropEligible: bal > 0 && avgEntry > c.price,
          airdropsReceived: h.airdrops,
        };
      });
    const quotes = quotesMap();
    const drops = all<{ coin: string; amount: string; ts: number; tx: string }>(
      "SELECT coin, amount, ts, tx FROM airdrop WHERE recipient = ? ORDER BY ts DESC LIMIT 200",
      wallet,
    );
    const summary: WalletSummary = {
      address: wallet,
      positions,
      airdrops: drops.map((d) => {
        const c = coins.get(d.coin);
        const q = c ? quotes.get(c.quote.address) : undefined;
        return {
          coin: d.coin,
          symbol: c?.symbol ?? "?",
          amount: d.amount,
          quoteSymbol: q?.symbol ?? "SOL",
          quoteDecimals: q?.decimals ?? 9,
          t: d.ts,
          tx: d.tx,
        };
      }),
      protection: walletProtection(wallet),
    };
    return ctx.json(summary);
  });

  app.get("/api/balances/:address", async (ctx) => ctx.json(await engine.balances(address(ctx, "address"))));

  app.get("/api/protection", (ctx) => {
    const owed = owedProtectionSol();
    const available = treasury.protectionSol - owed;
    const status: ProtectionStatus = {
      wallet: engine.wallets.protection,
      fundSol: treasury.protectionSol,
      owedSol: owed,
      totalPaidSol: toUnits(kvGet("protection_paid") ?? "0", 9),
      paid24hSol: one<{ s: number }>(
        "SELECT COALESCE(SUM(amount_sol), 0) AS s FROM protection_payout WHERE sent_at >= ? AND tx NOT LIKE 'sending:%'",
        now() - 86_400,
      )!.s,
      payoutBps: PROTECTION_PAYOUT_BPS,
      recent: coveredLosses("p.amount_sol > 0", [], 30),
      coins: all<CoinRow>("SELECT * FROM coin WHERE sol_to_protection > 0 ORDER BY sol_to_protection DESC").map((c) => coinProtection(c, available)),
    };
    return ctx.json(status);
  });

  app.get("/api/activity", (ctx) => {
    const limit = Math.min(Number(ctx.req.query("limit") ?? 40), 100);
    const sUsd = solUsd();
    const meta = new Map(all<CoinRow>("SELECT * FROM coin").map((c) => [c.mint, c]));
    const trades = all<TradeRow>("SELECT * FROM trade WHERE kind = 'trade' ORDER BY ts DESC, rowid DESC LIMIT ?", limit);
    const launches = all<CoinRow>("SELECT * FROM coin ORDER BY created_at DESC LIMIT 10");
    const items: ActivityItem[] = [
      ...trades.map((t) => ({
        id: t.id,
        kind: (t.is_buy ? "buy" : "sell") as ActivityItem["kind"],
        coin: t.coin,
        symbol: meta.get(t.coin)?.symbol ?? "?",
        image: meta.get(t.coin)?.image ?? "",
        wallet: t.trader,
        solValue: t.sol_value,
        usdValue: t.sol_value * sUsd,
        t: t.ts,
      })),
      ...launches.map((c) => ({
        id: `launch-${c.mint}`,
        kind: "launch" as const,
        coin: c.mint,
        symbol: c.symbol,
        image: c.image,
        wallet: c.creator,
        solValue: 0,
        usdValue: 0,
        t: c.created_at,
      })),
    ];
    return ctx.json(items.sort((a, b) => b.t - a.t).slice(0, limit));
  });

  // ---------------------------------------------------------------- OTC

  app.get("/api/otc", (ctx) =>
    ctx.json({
      wallet: engine.wallets.otc,
      reserveSol: treasury.otcSol,
      walletDailyCapSol: walletDailyCapSol(),
      coins: all<CoinRow>("SELECT * FROM coin WHERE otc_credit > 0 OR otc_burned != '0' ORDER BY sol_to_otc DESC").map((c) => otcCoin(c)),
    }),
  );

  app.get("/api/otc/:coin", (ctx) => {
    const c = getCoin(address(ctx, "coin"));
    if (!c) return ctx.json({ error: "not found" }, 404);
    const wallet = ctx.req.query("wallet");
    const info = otcCoin(c);
    const cap = walletDailyCapSol();
    return ctx.json({
      ...info,
      reserveSol: treasury.otcSol,
      walletRemainingSol: wallet && isSolanaAddress(wallet) ? Math.max(0, cap - walletSoldToday(c.mint, wallet)) : cap,
    });
  });

  app.post("/api/otc/quote", async (ctx) => {
    const req = await ctx.req.json<OtcQuoteRequest>();
    if (!isSolanaAddress(req.wallet) || !isSolanaAddress(req.coin)) throw new UserError("Connect a wallet first.");
    if (req.side !== "sell" && req.side !== "buy") throw new UserError("Bad side.");
    return ctx.json(await otcQuote(engine, req));
  });

  app.post("/api/otc/confirm", async (ctx) => {
    const { id, signature } = await ctx.req.json<{ id: string; signature: string }>();
    return ctx.json(await otcConfirm(engine, id, signature));
  });

  // ---------------------------------------------------------------- trading and launching

  app.get("/api/swap/quote", async (ctx) => {
    const c = getCoin(ctx.req.query("coin") ?? "");
    if (!c) throw new UserError("Unknown coin.");
    const side = ctx.req.query("side") === "sell" ? "sell" : "buy";
    const amount = big(ctx.req.query("amount"));
    if (amount <= 0n) throw new UserError("Enter an amount.");
    return ctx.json(await engine.swapQuote(c, side, amount, Number(ctx.req.query("slippageBps") ?? 100), ctx.req.query("wallet")));
  });

  app.post("/api/tx/swap", async (ctx) => {
    const req = await ctx.req.json<SwapRequest>();
    if (!isSolanaAddress(req.wallet)) throw new UserError("Connect a wallet first.");
    const c = getCoin(req.coin);
    if (!c) throw new UserError("Unknown coin.");
    if (big(req.amount) <= 0n) throw new UserError("Enter an amount.");
    return ctx.json(await engine.swap(c, { ...req, slippageBps: Math.min(Math.max(Number(req.slippageBps) || 100, 10), 5000) }));
  });

  app.post("/api/tx/launch", async (ctx) => {
    const req = await ctx.req.json<LaunchRequest>();
    if (!isSolanaAddress(req.wallet)) throw new UserError("Connect a wallet first.");
    const name = (req.name ?? "").trim();
    const symbol = (req.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
    if (!name || name.length > 32) throw new UserError("Name must be 1–32 characters.");
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new UserError("Ticker must be 1–10 letters or digits.");
    const q = one<QuoteRow>("SELECT * FROM quote WHERE mint = ?", req.quote);
    if (!q || !q.available) throw new UserError("That quote asset isn't available.");
    if (!(q.usd > 0)) throw new UserError(`No live USD price for ${q.symbol} yet, so its curve can't be priced. Try another pair.`);
    const clean = { ...req, name, symbol, description: (req.description ?? "").slice(0, 1000) };
    // metadata JSON is served from here (or pinned to IPFS by the engine when configured)
    const uriBase = `${config.publicUrl}/api/metadata/`;
    const res = await engine.launch(clean, uriBase);
    return ctx.json(res);
  });

  app.get("/api/metadata/:file", (ctx) => {
    const mint = ctx.req.param("file").replace(/\.json$/, "");
    const meta = kvGet(`meta:${mint}`);
    if (!meta) return ctx.json({ error: "not found" }, 404);
    return ctx.json(JSON.parse(meta));
  });

  app.post("/api/ingest", async (ctx) => {
    const { signature } = await ctx.req.json<{ signature: string }>();
    if (typeof signature !== "string" || signature.length < 60) throw new UserError("Bad signature.");
    await engine.ingest(signature);
    return ctx.json({ ok: true });
  });

  // runtime settings for the web app, so one image works for demo, devnet and mainnet. The browser gets its own
  // RPC (PUBLIC_RPC_URL), never the backend's, whose URL usually carries an API key.
  app.get("/api/config", (ctx) =>
    ctx.json({
      cluster: config.cluster,
      demo: engine.demo,
      launchFeeSol: LAUNCH_FEE_SOL,
      rpc: process.env.PUBLIC_RPC_URL || clusters[config.cluster].rpc,
    }),
  );

  /**
   * Docker's health check. A standby (the new server during an update, waiting for the old one to hand over
   * background work) counts as healthy: that is what lets Swarm stop the old one. A stopping server reports 503.
   */
  app.get("/api/health", (ctx) => {
    let ok = lease.state !== "stopping";
    try {
      one("SELECT 1");
    } catch {
      ok = false;
    }
    return ctx.json(
      { ok, state: lease.state, mode: engine.demo ? "demo" : config.cluster },
      ok ? 200 : 503,
      { "cache-control": "no-store" },
    );
  });

  return app;
}

/** Store token metadata (Metaplex JSON) for a mint. */
export function storeMetadata(mint: string, req: LaunchRequest) {
  const meta = {
    name: req.name,
    symbol: req.symbol,
    description: req.description,
    image: req.image,
    external_url: req.website || undefined,
    extensions: { website: req.website, twitter: req.twitter, telegram: req.telegram },
    createdOn: config.publicUrl,
  };
  kvSet(`meta:${mint}`, JSON.stringify(meta));
  return meta;
}

function friendly(e: Error) {
  const m = e.message ?? String(e);
  if (/insufficient (funds|lamports)|0x1\b/i.test(m)) return "Not enough balance for this transaction (including network fees).";
  if (/blockhash/i.test(m)) return "The network is busy. Try again.";
  if (/slippage|0x1771|ExceededSlippage/i.test(m)) return "Price moved beyond your slippage setting.";
  return m.split("\n")[0]!.slice(0, 200);
}
