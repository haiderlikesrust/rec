import { brand, type Payout } from "@gantry/shared";
import { bps, duration, sol } from "@/lib/format";

/*
 * The words of a payout, shared by its page, its link preview and the post it can be shared with, so the three
 * always say the same thing. Plain module: the server (metadata, preview image) and the browser both use it.
 */

/** The line a payout carries wherever it is shown. */
export const PAYOUT_CAVEAT = "Payouts are capped. Not insurance.";

/** A payout's public page. Ids can hold a colon (`<signature>:<n>`), so the id is encoded. */
export const payoutPath = (id: string) => `/payout/${encodeURIComponent(id)}`;

const ticker = (symbol: string) => `$${symbol.replace(/^\$/, "")}`;

/** The payout has reached the wallet. Until then the wording is "getting", not "got". */
export const payoutSent = (p: Payout) => p.status === "sent";

/** The share of the loss that came back, as a whole percentage ("25%"); below 1% it keeps its decimals. */
export const payoutCoverage = (p: Payout) => (p.coverageBps >= 100 ? `${Math.round(p.coverageBps / 100)}%` : bps(p.coverageBps));

/** How long the coin was held before the losing sale: "1d 12h", and "3h" rather than "3h 0m". */
export const payoutHold = (p: Payout) => duration(p.holdSeconds).replace(/ 0[hms]$/, "");

/** What happened, as two short sentences: "Lost 2 SOL on $COIN." and "Got 0.9 SOL back." */
export function payoutLines(p: Payout): [string, string] {
  return [`Lost ${sol(p.lossSol)} on ${ticker(p.coin.symbol)}.`, `${payoutSent(p) ? "Got" : "Getting"} ${sol(p.payoutSol)} back.`];
}

/** One sentence for a description: who paid, how much, on what loss. */
export function payoutSummary(p: Payout) {
  return `${brand.shield}, the protection fund on ${brand.name}, ${payoutSent(p) ? "sent" : "is sending"} ${sol(p.payoutSol)} back after a ${sol(p.lossSol)} loss on ${ticker(p.coin.symbol)}.`;
}

/** The text a post on X starts with. It is in the first person only for the wallet that was paid. */
export function payoutPost(p: Payout, own: boolean) {
  return `${own ? "I" : "A trader"} lost ${sol(p.lossSol)} on ${ticker(p.coin.symbol)} and ${brand.shield} on ${brand.name} ${payoutSent(p) ? "sent" : "is sending"} ${sol(p.payoutSol)} back.`;
}
