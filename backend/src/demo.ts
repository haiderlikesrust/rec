// `pnpm demo`: the whole platform with simulated chain state (no wallets to fund, no RPC).
process.env.DEMO ??= "1";
await import("./index");

export {};
