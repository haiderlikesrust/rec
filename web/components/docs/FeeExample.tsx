import { brand, splitFees, type Venue } from "@gantry/shared";
import { FigureTable } from "./blocks";
import { dollars, fee } from "./figures";

// a volume at which every line comes out to a whole cent in both phases
const VOLUME = 100_000;

/** One phase's column: the fee on VOLUME of trading and where each part of it ends up, in dollars. */
function column(venue: Venue) {
  const f = fee[venue];
  const of = (bps: number) => (VOLUME * bps) / 10_000;
  const halves = splitFees(of(f.bucketsBps));
  return { paid: of(f.taxBps), raydium: of(f.raydiumBps), burned: of(f.burnedBps), otc: halves.otcReserve, shield: halves.protection };
}

/** The same trading volume put through both phases, line by line, computed from the fee policy the backend runs. */
export function FeeExample() {
  const a = column("curve");
  const b = column("cpmm");
  return (
    <FigureTable
      caption={`Where the fee on ${dollars(VOLUME)} of trading goes, on the curve and after graduation`}
      head={[`On ${dollars(VOLUME)} of trading`, "On the curve", "After graduation"]}
      rows={[
        ["Traders pay in fees", dollars(a.paid), dollars(b.paid)],
        ["Raydium keeps", dollars(a.raydium), dollars(b.raydium)],
        ["The OTC reserve gets", dollars(a.otc), dollars(b.otc)],
        [`${brand.shield} gets`, dollars(a.shield), dollars(b.shield)],
        ["Burned, in the coin", dollars(a.burned), dollars(b.burned)],
      ]}
    />
  );
}
