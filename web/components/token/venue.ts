import { NATIVE_MINT, type Coin, type Venue } from "@gantry/shared";
import { runtime } from "@/lib/explorer";

/** Where a coin trades right now: the LaunchLab curve until it graduates, its Raydium pool after. */
export const venueOf = (coin: Pick<Coin, "graduated">): Venue => (coin.graduated ? "cpmm" : "curve");

export const venueName: Record<Venue, string> = {
  curve: "Raydium LaunchLab curve",
  cpmm: "Raydium pool",
};

const RAYDIUM = "https://raydium.io";
const clusterParam = () => (runtime.cluster === "devnet" ? "&cluster=devnet" : "");

/** The coin's page on Raydium: its LaunchLab curve before graduation, the swap for its pool after. */
export function raydiumUrl(coin: Pick<Coin, "address" | "graduated" | "quote">) {
  if (!coin.graduated) return `${RAYDIUM}/launchpad/token/?mint=${coin.address}${clusterParam()}`;
  const input = coin.quote.address === NATIVE_MINT ? "sol" : coin.quote.address;
  return `${RAYDIUM}/swap/?inputMint=${input}&outputMint=${coin.address}${clusterParam()}`;
}
