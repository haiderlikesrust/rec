import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { one, run } from "./db";

/**
 * Only one server runs background work: indexing, the fee router (burns), airdrops, protection epochs and the
 * demo market. During a zero-downtime update the new container starts while the old one is still running. It
 * serves the API at once (both read and write the same SQLite file), but stays on standby until the old one
 * releases this lease on shutdown, or the lease lapses because the old one died.
 */
export type LeaseState = "starting" | "standby" | "leader" | "stopping";

const ID = randomUUID();
const TTL_SECONDS = 15;

export const lease = { state: "starting" as LeaseState, id: ID };

/** Takes or renews the lease; one atomic statement, so two servers can't both win. */
export function renewLease(): boolean {
  if (lease.state === "stopping") return false;
  const now = Math.floor(Date.now() / 1000);
  run(
    `INSERT INTO kv (k, v) VALUES ('leader', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v
     WHERE json_extract(kv.v, '$.id') = ? OR json_extract(kv.v, '$.until') < ?`,
    JSON.stringify({ id: ID, until: now + TTL_SECONDS, host: hostname() }),
    ID,
    now,
  );
  const holder = one<{ v: string }>("SELECT v FROM kv WHERE k = 'leader'");
  const mine = !!holder && (JSON.parse(holder.v) as { id: string }).id === ID;
  lease.state = mine ? "leader" : "standby";
  return mine;
}

export function releaseLease() {
  run("DELETE FROM kv WHERE k = 'leader' AND json_extract(v, '$.id') = ?", ID);
}
