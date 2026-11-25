import Link from "next/link";
import { brand, PROTECTION_CAP_X_TAX, PROTECTION_MIN_PAYOUT_SOL, PROTECTION_PAYOUT_BPS, protectionTiers } from "@gantry/shared";
import { bps, sol } from "@/lib/format";
import { DataTable, Panel, PanelHeader, Td, Th } from "@/components/ui";

/** Hold time → the share of a loss the fund covers, straight from `protectionTiers`, then the three limits in plain words. */
export function Coverage({ payoutBps = PROTECTION_PAYOUT_BPS }: { payoutBps?: number }) {
  return (
    <Panel as="section">
      <PanelHeader as="h2" label="What you get back" />
      <DataTable caption="Share of a loss covered, by how long the coin was held">
        <thead>
          <tr>
            <Th>You held it for</Th>
            <Th num>Loss covered</Th>
          </tr>
        </thead>
        <tbody>
          {protectionTiers.map((t) => (
            <tr key={t.label}>
              <Td className="font-medium">{t.label}</Td>
              <Td num className={t.coverageBps > 0 ? "font-medium text-ink" : "text-ink-3"}>
                {t.coverageBps > 0 ? `Up to ${bps(t.coverageBps)}` : "Nothing"}
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <div className="space-y-2 px-[var(--card-pad)] pt-4 pb-[var(--card-pad)] text-[15px] leading-relaxed text-ink-2">
        <p>You never get back more than {PROTECTION_CAP_X_TAX}× the trading fees you paid on that coin.</p>
        <p>Each coin pays from its own pot of fees, and one payout can take up to {bps(payoutBps)} of what is left in it.</p>
        <p>Payouts are sent once you are owed at least {sol(PROTECTION_MIN_PAYOUT_SOL)}; smaller amounts add up until then.</p>
        <p className="pt-1 text-[14px] text-ink-3">
          This is not insurance, and a coin&apos;s creator is not covered.{" "}
          <Link href={`${brand.docsPath}#protection`} className="link">
            Full rules
          </Link>
        </p>
      </div>
    </Panel>
  );
}
