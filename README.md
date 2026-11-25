# Gantry

Gantry is a token launchpad for Solana built on Raydium. A coin opens on a Raydium LaunchLab bonding curve and
graduates into a Raydium CPMM pool with its liquidity locked. The trading fee does not go to the coin's creator or to
the operator: after Raydium's cut it is converted to SOL and shared equally between an **OTC reserve** that buys coins
back from holders at a quoted price, and **Heat Shield**, a fund that repays part of a realized loss.

There is no custom on-chain program. A Node backend builds every transaction, the user's wallet signs it, and
Raydium's programs execute it. The money the platform handles sits in three ordinary wallets whose keys the backend
holds.

> **Status.** The demo engine and the test suite run the whole system end to end. The on-chain engine has been checked
> against mainnet by reading live accounts and by simulating the transactions it builds, but it has **not yet carried
> out a real launch from start to finish**. Run the full cycle on devnet before you point it at mainnet. See
> [Known limits](#known-limits).

## Contents

- [What a coin goes through](#what-a-coin-goes-through)
- [Where the fee goes](#where-the-fee-goes)
- [The three wallets and the background loops](#the-three-wallets-and-the-background-loops)
- [Repository map](#repository-map)
- [Try it: demo mode](#try-it-demo-mode)
- [Run it on a cluster](#run-it-on-a-cluster)
- [Tests](#tests)
- [Deploying](#deploying)
- [Known limits](#known-limits)

## What a coin goes through

| Stage | What happens | Numbers |
|---|---|---|
| Launch | One transaction creates a plain SPL token, its metadata and its LaunchLab curve, with an optional first buy. | 1B supply, 6 decimals. Starts at a $2,500 market cap. Costs about 0.021 SOL of rent and no platform fee. |
| Curve | Buys and sells run on a constant-product bonding curve. | About 75.97% of the supply is sold here. 3% fee on the quote side of every trade. |
| Graduation | When the curve is sold out, Raydium's own service moves it to a CPMM pool at the price the curve ended on. | $25,000 market cap. The other 24.03% or so of the supply and the roughly $6.0k raised seed the pool. All LP is locked. |
| Pool | The coin trades in the CPMM pool from then on. | 2.55% fee per trade (2.5% trade fee plus 0.05% creator fee, the tier closest to 3%). |

A coin can be paired with **SOL, the main stablecoins, tokenized stocks and other tokens Raydium's launchpad
accepts**. The catalog lives in [`packages/shared/src/quotes.ts`](packages/shared/src/quotes.ts) and
`GET /api/quotes` serves it with live prices; the site groups and counts the pairs from that response. The curve is
sized from the quote's live USD price at launch, so the $2,500 and $25,000 marks hold for every pair. A first buy on
any pair other than SOL can be paid in SOL: the app swaps it through Jupiter first, in a separate transaction.

Pairing with a tokenized stock, or with any token other than SOL, means the coin is priced and traded against that
token: buyers pay in it, sellers are paid in it, and the fee is taken in it before it is converted to SOL. Tokenized
stocks are Token-2022 mints issued by third parties. The issuer can freeze any token account, pause all transfers,
and move or burn tokens, and its own terms and regional restrictions apply to whoever holds one. Some carry a display
multiplier that the issuer moves for splits and dividends. The API counts in raw units and reports the multiplier as
`uiMultiplier`; the site shows and accepts amounts the way wallets do
([`web/lib/quoteUnits.ts`](web/lib/quoteUnits.ts)).

`GET /api/quotes` reports a pair as unavailable, with the reason, while a coin can't be launched on it:

- the $6.0k raise is below the minimum Raydium sets for that quote at the current price (for SOL, 24 SOL, which means
  above roughly $250 per SOL);
- the token has no good route to SOL on Jupiter, so its fees could not be converted, or its issuer has paused it.

A token whose issuer charges a fee on every transfer (pre-IPO stock tokens do) loses that fee on each movement, on
top of the launchpad's own. Whether such a quote is offered is the backend's decision
([`backend/src/chain/mint.ts`](backend/src/chain/mint.ts)); where the API reports one, the site shows the transfer
fee wherever the pair is picked or traded ([`web/lib/pairs.ts`](web/lib/pairs.ts)).

## Where the fee goes

Percentages are of the trade's quote side.

| | On the curve | After graduation |
|---|---|---|
| Charged | 3% | 2.55% |
| Raydium | 0.25% | about 0.40% |
| OTC reserve + Heat Shield (in SOL, half each) | 2.75% | about 1.10% |
| Burned (paid in the coin itself) | none | about 1.05% |
| Creator, operator | 0% | 0% |

On the curve the 2.75% is the platform fee of the LaunchLab platform config. It accumulates in a vault that only the
fee wallet can claim.

After graduation the fee wallet earns two ways: it holds the Fee Key of the locked liquidity, and it is the pool's
creator of record. Liquidity fees are paid out the way the liquidity is held, so about half arrives in the quote and
half in the coin. The quote half joins the split. **The coin half is burned, not sold**: it reduces supply but adds
nothing to the reserve or the fund, so a graduated coin feeds the two buckets at roughly 40% of the curve-phase rate.

What the two buckets do with it:

- **OTC reserve.** A SOL wallet that only buys. A holder sells coins to it at `min(spot, 30-minute TWAP)` minus 3%,
  with no price impact. The coins are burned in the same transaction that pays the seller, co-signed by the reserve.
  Each coin's sell limit is 2× the SOL its fees contributed, drops to 5% after 2 days without fees, and is capped at
  10% of the reserve per coin and 5% of the reserve per wallet per coin per day.
- **Heat Shield.** Pays part of a realized loss automatically, with nothing to claim. The rate depends on hold time
  (under 5 minutes 0%, 5 to 30 minutes 25%, 30 minutes to 6 hours 45%, longer 60%; 70% on a coin flagged as a rug).
  A payout is capped at 5× the fees that wallet paid on the coin and at 15% of the coin's own pot, and is sent once
  a wallet is owed 0.001 SOL.
- **The Fleet.** Coins whose ticker or name read the same after look-alike characters are folded form one family.
  One member leads: the original while it is active (3 traders and $300 of volume in 12 hours), otherwise the best
  active member, otherwise the best overall. Every other member's fee split is credited to the leader. A copy launched
  while the leader is active also pays a $500 entry as its first buy; those coins are airdropped to up to 50 of the
  leader's holders.
- **The platform token**, `$GANTRY`, is featured on the site once `MAIN_TOKEN_MINT` is set. It receives no fees and
  nothing buys it back.

All of these numbers live in code, not in this file: [`packages/shared/src/fees.ts`](packages/shared/src/fees.ts)
(fee policy, OTC and protection rules), [`quotes.ts`](packages/shared/src/quotes.ts) (pairs and curve targets) and
[`fleet.ts`](packages/shared/src/fleet.ts). The site's docs page prints them from the same modules.

## The three wallets and the background loops

| Wallet | Env var | Role |
|---|---|---|
| Fee wallet | `FEE_WALLET` | Admin of the LaunchLab platform config; claims the platform fee; holds the Fee Keys of graduated pools; converts to SOL through Jupiter; forwards half to each bucket; holds Fleet entry coins until they are airdropped. Pays the network fees. |
| OTC reserve | `OTC_WALLET` | Holds SOL, co-signs each OTC sale and burns what it receives. |
| Heat Shield | `PROTECTION_WALLET` | Holds SOL and sends loss payouts. |

Their addresses are public: on the docs page and in `GET /api/stats`.

One server at a time runs the background work (it holds a lease in the database; others stand by):

| Loop | Default interval | What it does |
|---|---|---|
| Index | 4 s | Reads new transactions on the platform config and on every graduated pool; records launches and trades. |
| Fees | 15 s | Per coin with at least `FEE_MIN_USD` waiting: claim or harvest, burn the coin side, convert to SOL, send half to each bucket. A failed send is re-queued. |
| Fleet entries | 20 s | Shares a copy's entry coins among the leader's holders. |
| Protection | 30 s | Prices each new realized loss and sends what is owed, in batches. If the wallet is short, losses wait in order. |
| Graduations | 20 s | Finds the CPMM pool of a curve that has sold out. |
| Housekeeping | 10 s to 10 min | Refreshes treasury balances, prices and Raydium's per-quote limits, expires OTC quotes, reconciles holders. |

## Repository map

```
packages/shared/   Types of the REST contract, fee policy, quote catalog, Fleet rules, brand, Solana constants.
                   Imported as @gantry/shared by both apps; no build step.
backend/           Node service (Hono + node:sqlite): REST API, indexer, fee router, OTC, protection, Fleet entries.
  src/chain/       The Solana engine: Raydium LaunchLab and CPMM instructions, event decoding, Jupiter swaps.
  src/demo/        The demo engine: the same money moves simulated in SQLite, plus a market simulator.
  src/scripts/     wallets.ts (create the three wallets), platform.ts (set up the LaunchLab platform config).
web/               Next.js app: board, launch, coin page, OTC reserve, Heat Shield, portfolio, docs.
deploy/            Container entrypoint and the Dokploy environment template.
docs/DOKPLOY.md    Deployment guide.
Dockerfile         One image that runs the site and the backend together.
```

The backend is the only thing that talks to Solana for writes. `backend/src/engine.ts` defines the `Engine`
interface; `chain/engine.ts` and `demo/engine.ts` implement it, and everything else is engine-agnostic.

## Try it: demo mode

Demo mode needs no wallet, no RPC and no SOL. It simulates the chain in SQLite.

Requirements: Node 22.13 or newer (the backend uses `node:sqlite`) and pnpm 10.

```bash
pnpm install
pnpm demo        # backend on http://localhost:42069
pnpm dev:web     # site on http://localhost:3000, in a second terminal
```

- The backend seeds two days of history for a couple of dozen coins across SOL, the stablecoins and a few stock
  pairs, then keeps a simulated market trading, launching and paying out.
- The site adds a burner wallet in demo mode. Each demo wallet is handed $10,000 worth of SOL and of every quote
  asset it touches.
- The site reaches the API through a same-origin proxy (`/api/*` to `http://127.0.0.1:42069`), so `web/.env.local`
  is optional. Copy [`web/.env.example`](web/.env.example) if you want to override anything.
- `pnpm --filter @gantry/backend demo:reset` deletes the demo database; the next start seeds a fresh one.

## Run it on a cluster

Start on devnet. Everything below applies to mainnet too, with `CLUSTER=mainnet-beta` and fresh wallets.

**1. Configure the backend.** Copy [`backend/.env.example`](backend/.env.example) to `backend/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `CLUSTER` | `devnet` | `devnet` or `mainnet-beta`. |
| `RPC_URL` | the cluster's public RPC | Use a paid endpoint. The public ones are rate-limited and usually refuse `getProgramAccounts`, which holder reconciliation needs. |
| `PUBLIC_RPC_URL` | the cluster's public RPC | The RPC handed to browsers through `/api/config`. Use a key restricted to your domain, never the backend's. |
| `PORT` | `42069` | Backend port. |
| `PUBLIC_URL` | `http://localhost:42069` | Where the backend is reachable. Token metadata URIs point at it unless `PINATA_JWT` is set, so for real launches it must be public. |
| `FEE_WALLET`, `OTC_WALLET`, `PROTECTION_WALLET` | files in `backend/data/wallets` | Secret keys: base58, a JSON byte array, or a path to a keyfile. |
| `LOOKUP_TABLE` | remembered in the database | The address lookup table launches use. Set it to keep the same table when the database is replaced. |
| `MAIN_TOKEN_MINT` | none | Mint of the platform token to feature. |
| `JUPITER_API`, `JUPITER_API_KEY` | `https://lite-api.jup.ag`, none | Jupiter host for prices and swaps, and a key for the paid host. |
| `PINATA_JWT` | none | Pin token metadata to IPFS instead of serving it from the backend. |
| `FEE_MIN_USD` | `2` | Split a coin's fees once they are worth this much. |
| `FEES_EVERY_MS`, `ENTRIES_EVERY_MS`, `PROTECTION_EVERY_MS`, `POLL_MS` | `15000`, `20000`, `30000`, `4000` | Loop intervals. |
| `PRIORITY_MICROLAMPORTS` | `5000` | Priority fee on transactions the backend builds. |
| `DATA_DIR` | `backend/data` | SQLite database (`<cluster>.db`) and wallet files. |
| `DEMO` | empty | `1` switches to demo mode. |

**2. Create the wallets.**

```bash
pnpm --filter @gantry/backend wallets
```

This writes three keypairs to `backend/data/wallets` (git-ignored) if they are missing and prints each address with
its balance. Back the files up, or generate keys elsewhere and pass them through the three `*_WALLET` variables.
Send SOL to the fee wallet: it pays the rent of the platform's accounts and every network fee, and the backend warns
at startup when it holds less than 0.05 SOL. The OTC reserve and Heat Shield wallets fill up from fees.

**3. Set the platform up on Raydium.**

```bash
pnpm --filter @gantry/backend setup:platform
```

Run once per cluster. The fee wallet creates its LaunchLab platform config (the 2.75% platform fee, no creator fee,
all graduated LP locked for the fee wallet, the CPMM fee tier) and the address lookup table that lets a launch fit in
one transaction. It prints both addresses and, per pair, whether it can launch at today's price. Put the lookup table
address in `LOOKUP_TABLE`. Run the script again after changing the fee policy: it brings an existing config back in
line. If you skip it, the first launch creates both on demand.

**4. Start the backend.**

```bash
pnpm --filter @gantry/backend start     # or: pnpm dev:backend, which restarts on changes
```

**5. Start the site.** For development, `pnpm dev:web`. For a production build:

```bash
pnpm --filter @gantry/web build
pnpm --filter @gantry/web start         # port 3000
```

The site asks the backend for the cluster, the demo flag and the browser RPC at runtime (`/api/config`), so the same
build serves demo, devnet and mainnet. The `NEXT_PUBLIC_*` values in [`web/.env.example`](web/.env.example) only
cover the first render and the case where the API lives on another origin (`NEXT_PUBLIC_API_URL`). `BACKEND_URL`
tells the Next server where to proxy `/api/*`. Coin images go to `UPLOAD_DIR` (default `web/.uploads`) unless
`PINATA_JWT` is set for the web process too.

**6. Walk the whole cycle on devnet** before mainnet: launch, buy and sell, wait for a fee split, sell at a loss and
watch the payout arrive, sell into the OTC reserve, push a coin through graduation and watch a pool harvest, then
launch a look-alike and check that its entry is airdropped. Compare the three wallets on Solscan with `/api/stats`.

Devnet differs from mainnet in three ways: only SOL and Raydium's devnet USDC are available as pairs; graduated pools
use a different fee tier (4% trade fee plus 0.25% creator fee); and Jupiter only routes mainnet tokens, so fees
collected in devnet USDC cannot be converted and a first buy cannot be paid in SOL on that pair. Use the SOL pair for
a complete run.

## Tests

```bash
pnpm test         # backend test suite (node:test through tsx)
pnpm typecheck    # tsc over the backend and the web app
```

The suite needs no network. It covers:

- the fee policy: 3% on the curve inside LaunchLab's cap, the pool tier and its split between Raydium, the buckets
  and the burn, the 50/50 split with no rounding loss;
- the curve: every pair starts at $2.5k and graduates at $25k with numbers LaunchLab accepts, and curve and pool swaps
  match the Raydium SDK's own math;
- the demo engine end to end: trades to fee split to payouts, a failed send being re-queued, graduation into a pool,
  an unavailable pair, a first buy paid in SOL, a Fleet copy paying its entry and feeding its leader;
- the chain engine with a stubbed RPC: the launch transaction (create, buy, Fleet entry) and the OTC transaction;
- the event decoder on recorded mainnet LaunchLab and CPMM transactions.

`NETWORK_TESTS=1 pnpm test` adds one read-only test that decodes whatever LaunchLab trades are happening on mainnet.
Set `MAINNET_RPC` to use your own endpoint for it.

## Deploying

The [`Dockerfile`](Dockerfile) builds one image that runs the site (port 7310) and the backend side by side, with
SQLite on a volume. [`docs/DOKPLOY.md`](docs/DOKPLOY.md) walks through running it on Dokploy with updates that never
take the site down; the environment template is [`deploy/dokploy.env.example`](deploy/dokploy.env.example).

## Known limits

- **Not yet proven on a live cluster.** The on-chain engine type-checks against the Raydium SDK, has been checked by
  reading mainnet accounts and simulating its transactions, and its decoder is tested on real transactions. It has
  not yet executed a real launch, graduation or harvest. Treat the first devnet cycle as part of development.
- **Hot wallets.** The three wallets' keys are on the backend server. Whoever has them can move the funds. Use a
  dedicated host and a secret store, keep only working balances in them, and consider sweeping the excess to a
  multisig.
- **Policy is off-chain.** Cost basis, hold times, OTC limits, Fleet leaders and payouts are computed by the backend
  from indexed transactions. Anyone can recompute them from public data, but no program enforces them.
- **Protection can be farmed.** Colluding wallets can manufacture losses. Hold-time tiers, the 5× fee cap, the per-coin
  pot and the creator exclusion make it costly, not impossible.
- **Pairs depend on Raydium and Jupiter.** LaunchLab's per-quote minimum raise can pause a pair (SOL above roughly
  $250 at the current 24 SOL minimum), and only Raydium can add a quote or migrate a finished curve. A pair other than
  SOL is also unavailable while Jupiter has no good route from its token to SOL.
- **Stock tokens answer to their issuers.** A stock pair trades against a token whose issuer can freeze any account
  that holds it, a pool's vault included, pause all transfers, or move and burn tokens. That can halt a coin or empty
  its pool, and nothing here can prevent or undo it. The issuers' terms and regional restrictions apply to whoever
  holds the tokens; the site does not check them.
- **Burned fees after graduation.** About 1.05% of each pool trade returns as the coin and is burned rather than paid
  to the buckets.
- **Transfer fees.** Coins are classic SPL tokens with no transfer fee. A quote can be a Token-2022 mint, and one
  whose issuer charges a transfer fee loses that fee on every movement: into a pool, out of it, into the fee wallet
  and on to SOL.
- **One writer, one database.** State is a single SQLite file and background work runs on one server. The chain
  records every trade, but which fees have been split, which losses have been paid, owed Fleet entries and open OTC
  quotes exist only in that file. Back it up, and restore from a backup rather than re-indexing into an empty one.
- **The rug flag is a heuristic**: the creator sold at least half of what they bought and the price is 70% or more
  below its high. It can miss and it can misfire.
