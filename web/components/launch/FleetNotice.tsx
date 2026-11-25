import { brand, type FleetCheck } from "@gantry/shared";
import { usd } from "@/lib/format";
import { Notice } from "@/components/ui";

/**
 * Shown only when the ticker or name reads like a coin that already exists: which coin, what joining its family
 * means for fees, and the entry a copy pays while that family is active. The existing coins are called by their
 * names, because the new coin may carry the very same ticker.
 */
export function FleetNotice({
  check,
  entryCost,
  entryRent,
}: {
  check: FleetCheck;
  /** the entry in what it will be paid with, e.g. "≈ 7.41 SOL" */
  entryCost: string;
  /** rent for the accounts the entry's coins are sent to, e.g. "≈ 0.102 SOL" */
  entryRent: string;
}) {
  const f = check.family;
  if (!f) return null;
  const e = check.entry;
  return (
    <Notice tone="fleet">
      <span className="text-ink">
        {f.og.name} (<span className="num">${f.og.symbol}</span>) already exists.
      </span>{" "}
      Your coin joins its {brand.fleet}, so the fees it earns go to {f.leader.name}.{" "}
      {e ? (
        <>
          Launching also costs a <span className="num text-ink">{usd(e.usd)}</span> entry (<span className="num">{entryCost}</span> plus{" "}
          <span className="num">{entryRent}</span> rent), handed out to {e.to.name} holders.
        </>
      ) : (
        "There is no entry to pay right now."
      )}
    </Notice>
  );
}
