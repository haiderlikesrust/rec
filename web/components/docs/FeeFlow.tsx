import { brand } from "@gantry/shared";
import { Panel } from "@/components/ui";
import { bucketColor } from "@/lib/buckets";
import { fee, pct } from "./figures";

/**
 * Where the fee on a trade goes while a coin is on its curve, as one bar cut to scale and a line per part.
 * Percentages are of the trade and come from the fee policy.
 */
export function FeeFlow() {
  const c = fee.curve;
  const half = c.bucketsBps / 2;
  const parts = [
    { name: "Raydium", note: "Runs the pools every coin trades in", bps: c.raydiumBps, color: "var(--ink-3)" },
    { name: "OTC reserve", note: "Half of the rest: SOL you can sell your coins to", bps: half, color: bucketColor.otcReserve },
    { name: brand.shield, note: "The other half: SOL that pays back part of losses", bps: half, color: bucketColor.protection },
  ];

  return (
    <Panel as="section" aria-label="Where the fee on a trade goes" className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[15px] text-ink-2">Fee on every trade</p>
        <p className="num text-2xl leading-none font-semibold text-ink">{pct(c.taxBps)}</p>
      </div>

      <div
        role="img"
        aria-label={parts.map((p) => `${p.name} ${pct(p.bps, 3)}`).join(", ")}
        className="mt-4 flex h-3 gap-1"
      >
        {parts.map((p) => (
          <span key={p.name} className="h-full min-w-3 rounded-full" style={{ flexGrow: p.bps, flexBasis: 0, background: p.color }} />
        ))}
      </div>

      <ul className="mt-5 space-y-3.5">
        {parts.map((p) => (
          <li key={p.name} className="flex items-baseline gap-3">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ink">{p.name}</p>
              <p className="text-[13px] leading-snug text-ink-2">{p.note}</p>
            </div>
            <p className="num shrink-0 text-[15px] text-ink">{pct(p.bps, 3)}</p>
          </li>
        ))}
        <li className="flex items-baseline gap-3">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink-3" />
          <p className="min-w-0 flex-1 text-[15px] font-medium text-ink">The coin&apos;s creator and the team</p>
          <p className="num shrink-0 text-[15px] text-ink">0%</p>
        </li>
      </ul>
    </Panel>
  );
}
