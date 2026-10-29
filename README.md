# Recur: a Solana launchpad where every fee comes back

Every Recur coin is a [Meteora](https://meteora.ag) pool: a Dynamic Bonding Curve from launch, then a DAMM v2 pool
once it graduates. A coin can pair with SOL, a stablecoin or any of 120+ tokenized stocks (xStocks, Backpack stocks,
PreStocks, Tessera). The quote list is the set stonk.fun offers. Every coin starts at a **$2.5k** market cap and
graduates at **$30k**, whatever its pair.

The pool charges **3% on the quote side of every buy and sell**. Creators and the team take nothing. Meteora keeps
its protocol share: 20% of the fee, or 16% on trades Recur builds, because the fee wallet is the referral. Recur's
fee wallet claims the rest and splits it:

| Bucket | Share | Paid in | Goes to |
|---|---|---|---|
| Protection fund | 40% | SOL (converted) | Loss payouts, sent automatically: up to 60% by hold time (70% on rugs), from the coin's own pot |
| OTC reserve | 30% | SOL (converted) | A SOL wallet you sell coins into with no slippage; limits follow each coin's contributions |
| Platform buyback & burn | 10% | quote → SOL → $RECR | burned |
| Coin buyback & burn | 10% | quote → the coin | burned |
| High-entry airdrop | 10% | quote | continuously, to holders whose average entry is above the current price |

**No custom Solana programs.** The buckets are plain wallets controlled by the backend:
- **fee**: Meteora partner and LP fee claimer; it splits, converts and burns.
- **OTC**: the reserve.
- **protection**: the fund.
- **airdrop**: pays the airdrops.

Their addresses are public, on the site and in `/api/stats`, so anyone can audit them on Solscan. An OTC trade is a
single transaction co-signed by the reserve and the user (coins one way, SOL the other, the 3% to the fee wallet), so it
settles atomically or not at all. Airdrops and protection payouts are pushed to wallets, with nothing to claim.

The brand lives in [packages/shared/src/brand.ts](packages/shared/src/brand.ts): `Recur` / `$RECR` / recur.lol.

The policy lives in [packages/shared/src/fees.ts](packages/shared/src/fees.ts) (split, anti-snipe, OTC, protection)
and [packages/shared/src/quotes.ts](packages/shared/src/quotes.ts) (quote catalog with logos, $2.5k / $30k).

## Layout

```
backend/          Node service: Meteora configs, launch/swap/OTC transactions, indexer, fee router, airdrops,
                  protection payouts, REST API (http://localhost:42069/api/...). SQLite via node:sqlite.
  src/chain/      Solana engine: DBC + DAMM v2 SDKs, event decoding, Jupiter conversions, co-signed transactions
  src/demo/       Demo engine: the same money moves simulated in the database, plus a market simulator
web/              Next.js app: home, launch, token, OTC, protection, portfolio, docs (Solana wallet adapter)
packages/shared/  API types, fee policy, quote catalog, brand, Solana constants
```

## How the money moves

1. **Launch.** The backend builds `createPoolWithFirstBuy` against the quote's Recur config. The new mint key
   co-signs, and the creator signs and pays the network fee plus a 0.01 SOL pool-creation fee (it funds the platform
   buyback). Each quote has its own DBC config, priced from the quote's live USD price so the curve starts at $2.5k
   and completes at $30k. A config is replaced when that price drifts more than 15%.
2. **Trade.** The 3% fee is charged by Meteora on every swap, through Recur or any aggregator. It starts at 99% and
   decays to 3% over the first 6 seconds as anti-snipe. The creator's bundled first buy skips that ramp.
3. **Graduate.** The curve migrates to DAMM v2 with the same 3%. 100% of the LP is permanently locked to the fee
   wallet, so post-graduation fees keep coming.
4. **Split** (continuously: every 15 s, per coin with ≥ $2 of new fees): the fee wallet claims the partner/LP fees and then:
   - buys the coin and burns it;
   - sends the airdrop share to the airdrop wallet;
   - converts the rest to SOL (Jupiter) for OTC 30 : protection 40 : platform burn 10;
   - buys $RECR with the platform-burn SOL and burns it.
5. **OTC.** Each coin earns sell credit worth 2× the SOL it contributed. The credit is full while the coin keeps
   paying fees and drops to 5% after 2 days without any (fresh trading restores it). Sells price at
   min(spot, 30-min TWAP) minus 3%; one coin can draw at most 10% of the reserve, and one wallet at most 5% per coin
   per day. The coins are burned in the same transaction that pays the seller, so the reserve never holds any.
6. **Airdrops** (continuously). Every pass (20 s), new airdrop money is allocated to holders whose average entry is
   above the price, weighted by unrealized loss, with at least ~$20 at stake. Each holder's allocation is sent as
   soon as it's worth $0.50, so payouts never cost more than they deliver. Coins received by transfer carry zero
   cost basis.
7. **Protection** (continuously, every 30 s). Each losing sale is covered as it's indexed and paid automatically:
   - Payout = loss × hold-time rate: <5 min 0%, 5–30 min 25%, 30 min–6 h 45%, 6 h+ 60%, rug 70%.
   - Capped at 5× the tax that wallet paid on the coin, across all its payouts.
   - Paid from the coin's own pot (what its fees put into the fund, minus what it has paid out), at most 15% of the
     pot per payout, and never more than the protection wallet holds.
   - Sent in batched transfers once a wallet is owed 0.001 SOL. Nothing to claim, nothing expires. Claims still open
     from the old 6-day rounds are sent the same way.

## Run it locally (demo mode, no chain)

Requirements: Node ≥ 22.13 (for `node:sqlite`) and pnpm 10.

```bash
pnpm install
```

```bash
pnpm --filter @cook/backend demo
```

```bash
pnpm dev:web
```

Open http://localhost:3000.
- **Backend:** seeds two days of market history (two dozen coins on SOL, stablecoin and stock pairs) and keeps the
  market moving.
- **Web:** with `NEXT_PUBLIC_DEMO=1` in `web/.env.local`, adds a burner wallet; every new demo wallet gets $10k of
  each quote asset.
- **Transactions:** launches, trades, OTC and payouts are applied by the demo engine instead of being sent on-chain.
- **Reset:** `pnpm --filter @cook/backend demo:reset` wipes the demo database.

Tests:

```bash
pnpm test
```

That covers:
- the fee split and the anti-snipe schedule against Meteora's fee scheduler;
- each pair's config against Meteora's own `buildCurveWithMarketCap` and `validateConfigParameters`;
- a full fee-router, OTC and protection run on the demo engine.

`NETWORK_TESTS=1 pnpm test` also decodes live Meteora swaps from mainnet (read-only).

## Run it on Solana

1. Copy `backend/.env.example` to `backend/.env`. Set `CLUSTER` (`devnet` or `mainnet-beta`) and a real `RPC_URL`
   (Helius, Triton…). Indexing uses `getProgramAccounts`, which public RPCs refuse.
2. `pnpm --filter @cook/backend wallets` creates the four wallets in `backend/data/wallets` (gitignored) and prints
   their addresses. Back the keys up, or supply your own via `FEE_WALLET`, `OTC_WALLET`, `PROTECTION_WALLET` and
   `AIRDROP_WALLET`. Fund the fee wallet with ~0.5 SOL for config rent and fees.
3. Optional: `pnpm --filter @cook/backend setup:configs SOL USDC NVDAX` pre-creates configs. Otherwise each is
   created on the first launch for that pair.
4. `pnpm --filter @cook/backend start`, and run the web app with `NEXT_PUBLIC_CLUSTER` (and `NEXT_PUBLIC_SOLANA_RPC`)
   set to match.
5. Launch $RECR through the app on the SOL pair, then set `MAIN_TOKEN_MINT` and restart the backend.

## Deploy (Dokploy, zero downtime)

One Docker image runs the site and the backend. Dokploy runs it as a Swarm Application with start-first updates:
the new container serves at once while the old one hands over background work through a database lease, then
stops. Setup, settings and the go-live checklist are in [docs/DOKPLOY.md](docs/DOKPLOY.md). The environment
template is [deploy/dokploy.env.example](deploy/dokploy.env.example).

## Known limits

- **Custodial treasury.** The bucket wallets are hot keys on the backend server. Whoever holds them can move the
  funds. Use a dedicated server and secret storage, keep balances visible, and consider moving the larger balances
  to a multisig (e.g. Squads) that the backend tops up from.
- **Trusted backend.** Airdrop recipients, OTC limits and protection payouts are computed off-chain from public chain
  data. They're reproducible, but not enforced on-chain.
- **Not exercised on a live cluster here.** The demo engine and the tests run end to end. The on-chain engine is
  type-checked against the Meteora SDKs, its configs pass Meteora's validator, and its event decoder is tested on live
  mainnet swaps. Run a devnet launch → trade → split → payout cycle before mainnet.
- **Token-2022 quotes.** xStocks and most stock tokens are Token-2022 mints. Meteora DBC accepts them as a quote only
  when the mint has a token badge. The backend marks a quote unavailable if Meteora rejects its config.
- **Meteora's share.** 16–20% of each 3% fee is Meteora's protocol fee. To route a full 3% to the buckets, raise
  `TAX_BPS` to 375 in [packages/shared/src/fees.ts](packages/shared/src/fees.ts).
- **Protection farming.** Colluding wallets can try to farm losses. Hold-time tiers, the 5×-tax cap, per-coin budgets
  and creator exclusion limit the damage but don't eliminate it.
