# Recur: a Robinhood Chain launchpad where every fee comes back

Pons-style token launchpad on Robinhood Chain. Every coin trades in its own Uniswap v4 pool from block one,
with the whole 1B supply locked as single-sided liquidity. A v4 hook takes a **3% tax on the quote side of every
buy and sell**, and 100% of it goes back to the community. Creators and the team take nothing.

| Bucket | Share | Paid in | Goes to |
|---|---|---|---|
| Protection fund | 40% | ETH (converted) | Loss coverage claims, tiered by hold time, up to 100% on rugs |
| OTC reserve | 30% | ETH (converted) | ETH pool you can sell coins into with no slippage; limits follow each coin's contributions |
| Platform buyback & burn | 10% | quote → ETH → platform token | burned |
| Coin buyback & burn | 10% | quote → the coin | burned |
| High-entry airdrop | 10% | quote | hourly, to holders whose average entry is above the current price |

Brand name, ticker and domain (`Recur` / `$RECR` / recur.lol) live in
[packages/shared/src/brand.ts](packages/shared/src/brand.ts). The fee split lives in
[contracts/src/libraries/FeeSplit.sol](contracts/src/libraries/FeeSplit.sol) and is mirrored in
[packages/shared/src/fees.ts](packages/shared/src/fees.ts).

## Layout

```
contracts/        Foundry: CookHook (v4 hook), Launchpad, FeeRouter, OTCReserve, ProtectionFund, HolderAirdrop, CookRouter
indexer/          Ponder indexer + REST API (http://localhost:42069/api/...)
keeper/           viem jobs: quote rates, fee processing (burns + ETH conversion), hourly airdrops, protection epochs; local seed
web/              Next.js app: home, launch, token, OTC, protection, portfolio, docs
packages/shared/  ABIs + addresses (generated), API types, fee math, brand, chains
```

## How the money moves

1. **Trade.** `CookHook.beforeSwap/afterSwap` takes 3% of the quote side (99% → 3% anti-snipe surcharge on buys in
   the first 6 seconds; snipers' extra goes to the coin's buyback) and mints it to the FeeRouter as v4 ERC-6909 claims.
2. **Process** (keeper, `FeeRouter.process`). In one PoolManager unlock: buy the coin and burn it; convert the
   protection + OTC + platform shares to ETH along the quote's route (e.g. NVDA → USDG → ETH); buy the platform token
   with its share and burn it; hand the airdrop share (in the quote asset) to `HolderAirdrop`. Protocol swaps are tax-free.
3. **OTC reserve.** Each coin earns sell credit worth 2× the ETH it contributed, at full strength while it keeps paying
   fees and fading to 5% after ~30 quiet days. Sells are priced at min(spot, 30-min TWAP) minus a 3% spread; one coin
   can draw at most 10% of the reserve, one wallet at most 5% per coin per day. The reserve resells inventory at
   max(spot, TWAP).
4. **Airdrops** (keeper, hourly). Recipients are holders whose average entry is above the current price, weighted by
   unrealized loss, minimum ~$20. Recipients rotate as price moves. Tokens received by transfer carry zero cost basis.
5. **Protection** (keeper, every 6 days on mainnet). Effective coverage = hold-time rate × the coin's funding.
   Hold-time rates are "up to" and short because markets are fast: <5 min 0%, 5–30 min 25%, 30 min–6 h 45%, 6 h+ 60%,
   rug-flagged coin 70%. Each coin can only draw its share of the epoch budget, in proportion to what it has paid into
   the fund; if its claims ask for more they are paid pro-rata, so coins that paid little cover little. Each claim is
   capped at 5× the tax that wallet paid on the coin. The contract enforces the budget (≤15% of the uncommitted fund
   per epoch) and spacing. Claims are Merkle proofs; unclaimed ETH returns to the fund after 60 days. The policy lives
   in `planProtectionEpoch` in [packages/shared/src/fees.ts](packages/shared/src/fees.ts), shared by keeper, indexer and UI.

## Run it locally

Requirements: Node ≥ 20, pnpm 10, Foundry.

```bash
pnpm install
```

```bash
cd contracts && forge test
```

Start a chain two days in the past (so the seed can fill in history), deploy, and generate addresses:

```bash
anvil --timestamp $(( $(date +%s) - 172800 ))
```

```bash
cd contracts && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 KEEPER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 MOCK_QUOTES=true PROTECTION_EPOCH_SECS=3600 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

(The keys above are anvil's public development keys. Never use them anywhere else.)

```bash
pnpm gen
```

Then, each in its own terminal:

```bash
pnpm dev:indexer
```

```bash
pnpm seed
```

```bash
pnpm keeper
```

```bash
pnpm dev:web
```

Open http://localhost:3000. Add the local network to your wallet (RPC `http://127.0.0.1:8545`, chain id 31337) and
import an anvil dev account to trade. If you restart anvil, delete `indexer/.ponder` and `keeper/data` first.

## Deploy to Robinhood Chain

**Testnet (46630).** Uniswap v4 is not deployed there, so the script deploys its own PoolManager. Put your own
funded key in `contracts/.env` (never commit it):

```bash
cd contracts && source .env && MOCK_QUOTES=true MOCK_ETH_LIQUIDITY=500000000000000000 forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_TESTNET_RPC --broadcast
```

**Mainnet (4663).** Use Uniswap's official PoolManager (`POOL_MANAGER=0x8366a39cc670b4001a1121b8f6a443a643e40951`,
check it against Uniswap's deployments page first), set `KEEPER` to your keeper bot, leave `MOCK_QUOTES` unset, and
approve real quote assets afterwards with `Launchpad.setQuote(quote, {enabled, startFdv, graduationThreshold}, route)`.
Each route must end in native ETH. Then run `pnpm gen`, point the indexer/keeper/web at the chain
(`CHAIN_ID`, `RPC_URL`, `NEXT_PUBLIC_CHAIN_ID`, `KEEPER_PRIVATE_KEY`) and run them as services.

## Known limits

- **Unaudited.** Get the contracts audited before mainnet.
- **Trusted keeper.** Airdrop recipients and protection claims are computed off-chain from public data. The contracts
  cap what the keeper can do (budgets, epoch spacing, each airdrop batch only once). Epoch files are published for anyone to verify.
- **Protection farming.** Colluding wallets can try to farm losses. Hold-time tiers, the 5×-tax cap, epoch budgets
  and creator exclusion limit the damage but do not eliminate it.
- **Quote allowlist.** "Any quote" means any quote the owner approves with an ETH route. Fee-on-transfer or rebasing
  tokens must not be approved.
- **Other pools.** Anyone can open a separate, hook-less pool for a coin elsewhere; trades there pay no tax (same as Pons).
- Not affiliated with Robinhood Markets, Inc.
