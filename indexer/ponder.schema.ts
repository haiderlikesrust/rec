import { index, onchainTable, primaryKey } from "ponder";

/** Approved quote assets (ETH, USDG, stock tokens...). */
export const quote = onchainTable("quote", (t) => ({
  address: t.hex().primaryKey(),
  symbol: t.text().notNull(),
  decimals: t.integer().notNull(),
  enabled: t.boolean().notNull(),
  startFdv: t.bigint().notNull(),
  graduationThreshold: t.bigint().notNull(),
  ethPerQuoteWad: t.bigint().notNull(), // ETH wei per 1e18 raw quote units
  rateUpdatedAt: t.integer().notNull(),
}));

export const coin = onchainTable(
  "coin",
  (t) => ({
    address: t.hex().primaryKey(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    image: t.text().notNull(),
    description: t.text().notNull(),
    website: t.text().notNull(),
    twitter: t.text().notNull(),
    telegram: t.text().notNull(),
    creator: t.hex().notNull(),
    createdAt: t.integer().notNull(),
    quote: t.hex().notNull(),
    poolId: t.hex().notNull(),
    tokenIsCurrency0: t.boolean().notNull(),
    isMain: t.boolean().notNull(),
    graduationThreshold: t.bigint().notNull(),
    sqrtPriceStart: t.bigint().notNull(),
    liquidity: t.bigint().notNull(),
    // market state
    price: t.doublePrecision().notNull(), // whole quote units per coin
    athPrice: t.doublePrecision().notNull(),
    quoteInPool: t.bigint().notNull(),
    graduated: t.boolean().notNull(),
    graduatedAt: t.integer(),
    totalSupply: t.bigint().notNull(),
    burned: t.bigint().notNull(),
    // activity
    trades: t.integer().notNull(),
    volumeQuote: t.bigint().notNull(),
    volumeEth: t.doublePrecision().notNull(),
    lastTradeAt: t.integer().notNull(),
    holders: t.integer().notNull(),
    // fees + where they went
    feesQuote: t.bigint().notNull(),
    feesEth: t.doublePrecision().notNull(),
    coinBurned: t.bigint().notNull(),
    ethToOtc: t.bigint().notNull(),
    ethToProtection: t.bigint().notNull(),
    ethToMainBuyback: t.bigint().notNull(),
    airdropQuote: t.bigint().notNull(),
    airdropsPaid: t.bigint().notNull(),
    airdropLastEpoch: t.bigint().notNull(),
    airdropLastEpochRecipients: t.integer().notNull(),
    // creator behaviour (rug detection)
    creatorBought: t.bigint().notNull(),
    creatorSold: t.bigint().notNull(),
  }),
  (table) => ({ quoteIdx: index().on(table.quote), createdIdx: index().on(table.createdAt) }),
);

export const trade = onchainTable(
  "trade",
  (t) => ({
    id: t.text().primaryKey(),
    coin: t.hex().notNull(),
    trader: t.hex().notNull(),
    isBuy: t.boolean().notNull(),
    quoteAmount: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    tax: t.bigint().notNull(),
    price: t.doublePrecision().notNull(),
    ethValue: t.doublePrecision().notNull(),
    timestamp: t.integer().notNull(),
    tx: t.hex().notNull(),
    kind: t.text().notNull(), // trade | buyback
  }),
  (table) => ({ coinTimeIdx: index().on(table.coin, table.timestamp), traderIdx: index().on(table.trader) }),
);

/** One-minute OHLCV candles in quote units; the API aggregates larger intervals. */
export const candle = onchainTable(
  "candle",
  (t) => ({
    coin: t.hex().notNull(),
    t: t.integer().notNull(),
    o: t.doublePrecision().notNull(),
    h: t.doublePrecision().notNull(),
    l: t.doublePrecision().notNull(),
    c: t.doublePrecision().notNull(),
    v: t.doublePrecision().notNull(), // whole quote units
  }),
  (table) => ({ pk: primaryKey({ columns: [table.coin, table.t] }) }),
);

/** Per-coin, per-wallet position with average-cost basis (transfers in carry zero basis). */
export const holder = onchainTable(
  "holder",
  (t) => ({
    coin: t.hex().notNull(),
    wallet: t.hex().notNull(),
    balance: t.bigint().notNull(),
    costBasis: t.bigint().notNull(), // raw quote
    firstBuyAt: t.integer().notNull(), // 0 when flat
    realizedQuote: t.bigint().notNull(), // signed realized P/L, raw quote
    taxPaid: t.bigint().notNull(),
    airdropsReceived: t.bigint().notNull(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.coin, table.wallet] }), walletIdx: index().on(table.wallet) }),
);

/** Each sell that realized a loss: input for protection-fund epochs. */
export const loss = onchainTable(
  "loss",
  (t) => ({
    id: t.text().primaryKey(),
    coin: t.hex().notNull(),
    wallet: t.hex().notNull(),
    timestamp: t.integer().notNull(),
    lossQuote: t.bigint().notNull(),
    lossEth: t.doublePrecision().notNull(),
    holdSeconds: t.integer().notNull(),
    taxPaidEth: t.doublePrecision().notNull(), // wallet's lifetime tax on this coin, at the time
  }),
  (table) => ({ timeIdx: index().on(table.timestamp), walletIdx: index().on(table.wallet) }),
);

export const airdrop = onchainTable(
  "airdrop",
  (t) => ({
    id: t.text().primaryKey(),
    coin: t.hex().notNull(),
    epoch: t.bigint().notNull(),
    recipient: t.hex().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (table) => ({ recipientIdx: index().on(table.recipient), coinIdx: index().on(table.coin) }),
);

export const otcTrade = onchainTable("otc_trade", (t) => ({
  id: t.text().primaryKey(),
  coin: t.hex().notNull(),
  wallet: t.hex().notNull(),
  isSellToReserve: t.boolean().notNull(),
  tokenAmount: t.bigint().notNull(),
  ethAmount: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const protectionEpoch = onchainTable("protection_epoch", (t) => ({
  id: t.bigint().primaryKey(),
  root: t.hex().notNull(),
  total: t.bigint().notNull(),
  claimed: t.bigint().notNull(),
  publishedAt: t.integer().notNull(),
  uri: t.text().notNull(),
}));

export const protectionClaim = onchainTable(
  "protection_claim",
  (t) => ({
    epoch: t.bigint().notNull(),
    account: t.hex().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.epoch, table.account] }) }),
);

/** Single row (id = "global") of platform-wide totals. */
export const platform = onchainTable("platform", (t) => ({
  id: t.text().primaryKey(),
  coins: t.integer().notNull(),
  mainBurned: t.bigint().notNull(),
  otcContributed: t.bigint().notNull(),
  otcPaidOut: t.bigint().notNull(),
  otcReceived: t.bigint().notNull(),
  protectionContributed: t.bigint().notNull(),
  protectionPaid: t.bigint().notNull(),
  airdroppedEth: t.doublePrecision().notNull(),
  coinsBurnedEth: t.doublePrecision().notNull(),
  totalFeesEth: t.doublePrecision().notNull(),
}));
