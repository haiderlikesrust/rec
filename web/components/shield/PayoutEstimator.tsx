"use client";

import { useState } from "react";
import { PROTECTION_CAP_X_TAX, protectionPayout, protectionTiers } from "@gantry/shared";
import { bps, sol, usd } from "@/lib/format";
import { Field, Input, Segmented } from "@/components/ui";

/** "30 min – 6 h" → "30m–6h": the tier labels, short enough for a segmented control on a phone. */
const shortLabel = (label: string) =>
  label
    .replace(/\s*min\b/g, "m")
    .replace(/\s*h\b/g, "h")
    .replace(/\s+/g, "");

const tierOptions = protectionTiers.map((t, i) => ({ value: String(i), label: shortLabel(t.label) }));
const minHoldMinutes = (protectionTiers.find((t) => t.coverageBps > 0)?.minHold ?? 0) / 60;

const decimal = (s: string) => s.replace(/[^\d.]/g, "");
const amount = (s: string) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * What one losing sale would pay, worked out by the same `protectionPayout` the fund runs: the loss times the
 * hold-time rate, held to a multiple of the fees paid. It assumes no earlier payouts and a pot that can cover it.
 */
export function PayoutEstimator({ solUsd }: { solUsd: number }) {
  const [loss, setLoss] = useState("1");
  const [fees, setFees] = useState("0.15");
  const [tier, setTier] = useState(String(protectionTiers.length - 1));

  const lossSol = amount(loss);
  const r = protectionPayout({
    lossSol,
    holdSeconds: protectionTiers[Number(tier)]?.minHold ?? 0,
    rugged: false,
    taxPaidSol: amount(fees),
    paidOnCoinSol: 0,
    potSol: Number.POSITIVE_INFINITY,
  });

  const why =
    lossSol === 0
      ? "Enter a loss to see what it would pay."
      : r.tierBps === 0
        ? `Nothing is covered when the coin was held for under ${minHoldMinutes} minutes.`
        : r.limit === "tax"
          ? `Held to ${PROTECTION_CAP_X_TAX}× the fees you paid on the coin.`
          : `${bps(r.tierBps)} of the loss.`;

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Your loss on the sale" hint="SOL">
          <Input className="num" inputMode="decimal" placeholder="0" value={loss} onChange={(e) => setLoss(decimal(e.target.value))} />
        </Field>
        <Field label="Fees you paid on the coin" hint="SOL">
          <Input className="num" inputMode="decimal" placeholder="0" value={fees} onChange={(e) => setFees(decimal(e.target.value))} />
        </Field>
        <Field as="div" label="You held it for" className="sm:col-span-2">
          <Segmented block aria-label="Hold time" value={tier} onChange={setTier} options={tierOptions} />
        </Field>
      </div>

      <div className="mt-5 rounded-lg bg-raise px-4 py-3.5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[14px] text-ink-2">Estimated payout</span>
          <span className={r.payoutSol > 0 ? "num text-[22px] leading-none font-semibold text-ink" : "num text-[22px] leading-none font-semibold text-ink-3"}>
            {sol(r.payoutSol)}
          </span>
        </div>
        {r.payoutSol > 0 && solUsd > 0 && <p className="num mt-1.5 text-right text-[13px] text-ink-3">≈ {usd(r.payoutSol * solUsd)}</p>}
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        {why} {lossSol > 0 && r.payoutSol > 0 && "It can come out lower if the coin's pot is nearly empty."}
      </p>
    </div>
  );
}
