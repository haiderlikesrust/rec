import {
  BLOODLINE,
  ENTRY_RENT_LAMPORTS,
  bloodKey,
  type BloodlineCheck,
  type BloodlineInfo,
  type BloodlineMember,
  type BloodlineRef,
  type BloodlineTag,
} from "@cook/shared";
import { log } from "./config";
import { all, big, one, run, tx, type CoinRow } from "./db";
import { UserError, type Engine } from "./engine";
import { SYSTEM, getCoin, ledger, quoteDecimals, recordBurn, recordTransfer } from "./ledger";
import { quoteRow, solPerUnit, solUsd, toUnits } from "./prices";
import { holdersOf, now } from "./services";

/**
 * Bloodline (rules in packages/shared/src/bloodline.ts): look-alike coins form a family, every member that doesn't
 * lead sends its coin-buyback and airdrop shares to the leader (jobs.ts), and a copy launched while the family has an
 * alive leader pays an entry that is airdropped to the leader's holders (runEntries below).
 */

type Ranked = { c: CoinRow; alive: boolean; traders12h: number; volume12hUsd: number; mcapUsd: number; score: number };
export type FamilyState = { og: CoinRow; leader: CoinRow; rule: BloodlineInfo["rule"]; members: Ranked[] };

const ref = (c: CoinRow): BloodlineRef => ({ address: c.mint, symbol: c.symbol, name: c.name, image: c.image });
const mcapUsd = (c: CoinRow) => c.price * toUnits(c.total_supply, c.decimals) * (quoteRow(c.quote)?.usd ?? 0);
const marks = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** Distinct traders and SOL volume per coin since `since`, leaving out the protocol's own wallets. */
function activity(mints: string[], since: number) {
  const sys = [...SYSTEM];
  const rows = all<{ coin: string; traders: number; vol: number }>(
    `SELECT coin, COUNT(DISTINCT trader) AS traders, COALESCE(SUM(sol_value), 0) AS vol FROM trade
     WHERE ts >= ? AND kind = 'trade' AND coin IN (${marks(mints.length)})${sys.length ? ` AND trader NOT IN (${marks(sys.length)})` : ""}
     GROUP BY coin`,
    since,
    ...mints,
    ...sys,
  );
  return new Map(rows.map((r) => [r.coin, r]));
}

/** Each candidate's share of the candidates' total of every metric, summed. */
function score(metrics: number[][]) {
  const totals = metrics[0]!.map((_, i) => metrics.reduce((s, m) => s + m[i]!, 0));
  return metrics.map((m) => m.reduce((s, v, i) => s + (totals[i]! > 0 ? v / totals[i]! : 0), 0));
}

/** Ranks a family: the OG leads while alive, then the best alive member, then the best member overall. */
function rank(rows: CoinRow[], at: number): FamilyState {
  const sUsd = solUsd();
  const recent = activity(
    rows.map((r) => r.mint),
    at - BLOODLINE.aliveHours * 3600,
  );
  const members: Ranked[] = rows.map((c) => {
    const a = recent.get(c.mint);
    const volume12hUsd = (a?.vol ?? 0) * sUsd;
    const traders12h = a?.traders ?? 0;
    return {
      c,
      alive: traders12h >= BLOODLINE.aliveTraders && volume12hUsd >= BLOODLINE.aliveVolumeUsd,
      traders12h,
      volume12hUsd,
      mcapUsd: mcapUsd(c),
      score: 0,
    };
  });
  const og = members[0]!;
  const alive = members.filter((m) => m.alive);
  const rule: FamilyState["rule"] = og.alive ? "og" : alive.length ? "alive" : "best";
  // the alive ranking runs on the last 12 hours; with nobody alive, on each member's whole life
  const pool = rule === "best" ? members : alive.length ? alive : members;
  const lifetime = rule === "best" ? activity(rows.map((r) => r.mint), 0) : null;
  const scores = score(
    pool.map((m) =>
      lifetime ? [m.c.volume_sol * sUsd, lifetime.get(m.c.mint)?.traders ?? 0, m.mcapUsd] : [m.volume12hUsd, m.traders12h, m.mcapUsd],
    ),
  );
  pool.forEach((m, i) => (m.score = scores[i]!));
  // ties go to the older coin
  const best = pool.reduce((b, m) => (m.score > b.score + 1e-9 ? m : b));
  return { og: og.c, leader: rule === "og" ? og.c : best.c, rule, members };
}

/** The family's current state, optionally as if `without` weren't in it (a copy that just launched). */
export function familyState(family: string, at = now(), without?: string): FamilyState | null {
  const rows = all<CoinRow>("SELECT * FROM coin WHERE family = ? ORDER BY created_at, rowid", family).filter((c) => c.mint !== without);
  return rows.length ? rank(rows, at) : null;
}

/** Where a coin's coin-buyback and airdrop shares go: the family leader, or the coin itself when it leads or has no copies. */
export function leaderOf(c: CoinRow, at = now()): CoinRow {
  if (!c.family || !one("SELECT 1 FROM coin WHERE family = ? AND mint != ?", c.family, c.mint)) return c;
  return familyState(c.family, at)?.leader ?? c;
}

/** The family an existing coin with this ticker or name heads, if any. */
function familyOf(symbol: string, name: string) {
  const keys = [bloodKey(symbol), bloodKey(name)].filter(Boolean);
  if (!keys.length) return null;
  return (
    one<{ family: string }>(
      `SELECT family FROM coin WHERE family != '' AND (ticker_key IN (${marks(keys.length)}) OR name_key IN (${marks(keys.length)}))
       ORDER BY created_at, rowid LIMIT 1`,
      ...keys,
      ...keys,
    )?.family ?? null
  );
}

/** What a launch with this ticker and name joins, and the entry it pays on `quote` when it copies an alive family. */
export function checkLaunch(symbol: string, name: string, quote: string, at = now()): BloodlineCheck {
  const family = familyOf(symbol, name);
  const s = family ? familyState(family, at) : null;
  if (!s) return { family: null, entry: null };
  const leaderAlive = s.rule !== "best";
  const out: BloodlineCheck = {
    family: { key: s.og.symbol, og: ref(s.og), leader: ref(s.leader), leaderAlive, members: s.members.length },
    entry: null,
  };
  if (!leaderAlive) return out;
  const q = quoteRow(quote);
  if (!q || !(q.usd > 0)) throw new UserError("No live price for that pair yet. Try again in a minute.");
  out.entry = {
    usd: BLOODLINE.entryUsd,
    quoteRaw: BigInt(Math.ceil((BLOODLINE.entryUsd / q.usd) * 10 ** q.decimals)).toString(),
    rentLamports: String(ENTRY_RENT_LAMPORTS),
    to: ref(s.leader),
  };
  return out;
}

/**
 * Books a new coin's entry once its launch is indexed: `tokens` is what the entry bought (held by the airdrop wallet),
 * `quoteRaw` what it paid. A copy of an alive family that paid none (launched straight on-chain, past the launch form)
 * is marked unpaid and left off the coin lists.
 */
export function recordEntry(mint: string, tokens: bigint, quoteRaw: bigint, to: string | null, viaForm: boolean, at = now()) {
  const c = getCoin(mint);
  if (!c || c.entry_status) return;
  if (tokens > 0n) {
    const leader = to ?? familyState(c.family, at, mint)?.leader.mint ?? null;
    run(
      "UPDATE coin SET entry_status = 'pending', entry_tokens = ?, entry_sol = ?, entry_for = ? WHERE mint = ?",
      tokens.toString(),
      toUnits(quoteRaw, quoteDecimals(c.quote)) * solPerUnit(c.quote),
      leader,
      mint,
    );
    return;
  }
  if (viaForm || c.family === mint) return;
  const s = familyState(c.family, at, mint);
  if (s && s.rule !== "best") run("UPDATE coin SET entry_status = 'unpaid' WHERE mint = ?", mint);
}

// ---------------------------------------------------------------- the entry airdrop

/**
 * The leader's holders who get a copy's entry: wallets that bought in (coins received by transfer carry no cost
 * basis, so they don't count), weighted by what they put in, counted up to 3x for holders whose entry is above the
 * price; the top `recipients`, none above `maxShareBps`. Both coins' creators are left out.
 */
export function entryShares(c: CoinRow, leader: CoinRow, total: bigint) {
  const qDec = quoteDecimals(leader.quote);
  const ranked = holdersOf(leader.mint)
    .filter((h) => h.address !== leader.creator && h.address !== c.creator)
    .map((h) => {
      const boost = leader.price > 0 ? Math.min(BLOODLINE.maxEntryBoost, Math.max(1, h.avgEntry / leader.price)) : 1;
      return { wallet: h.address, weight: toUnits(h.costBasis, qDec) * boost };
    })
    .filter((h) => h.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, BLOODLINE.recipients);
  if (!ranked.length) return [];
  // cap each share and hand the excess to the others, until nobody is over the cap
  const cap = Math.max(BLOODLINE.maxShareBps / 10_000, 1 / ranked.length);
  const shares = new Map(ranked.map((h) => [h.wallet, h.weight]));
  const capped = new Set<string>();
  for (let i = 0; i < ranked.length; i++) {
    const free = [...shares].filter(([w]) => !capped.has(w));
    const freeWeight = free.reduce((s, [, v]) => s + v, 0);
    const room = 1 - capped.size * cap;
    const over = free.filter(([, v]) => (v / freeWeight) * room > cap);
    if (!over.length) {
      for (const [w, v] of free) shares.set(w, (v / freeWeight) * room);
      break;
    }
    for (const [w] of over) {
      capped.add(w);
      shares.set(w, cap);
    }
  }
  const out = ranked.map((h) => ({ wallet: h.wallet, amount: (total * BigInt(Math.floor(shares.get(h.wallet)! * 1e9))) / 1_000_000_000n }));
  // rounding dust goes to the largest holder
  out[0]!.amount += total - out.reduce((s, o) => s + o.amount, 0n);
  return out.filter((o) => o.amount > 0n);
}

/**
 * Shares out every copy's entry. Each recipient's amount is fixed once, then sent in batches; a batch is marked as
 * sending before the transfer, so a crash mid-send leaves it for a look instead of paying it twice.
 */
export async function runEntries(engine: Engine, at = now()) {
  let sent = 0;
  for (const c of all<CoinRow>("SELECT * FROM coin WHERE entry_status = 'pending'")) {
    try {
      sent += await payEntry(engine, c, at);
    } catch (e) {
      log(`bloodline entry ${c.symbol}: ${(e as Error).message}`);
    }
  }
  if (sent) log(`bloodline: sent ${sent} entry airdrop(s)`);
  return sent;
}

async function payEntry(engine: Engine, c: CoinRow, at: number) {
  const total = big(c.entry_tokens);
  if (!one("SELECT 1 FROM entry_drop WHERE coin = ?", c.mint)) {
    const leader = c.entry_for ? getCoin(c.entry_for) : undefined;
    const shares = leader ? entryShares(c, leader, total) : [];
    if (!shares.length) {
      // nobody to give it to: burn it, so the launcher still gets none of it
      const { burned, sig } = await engine.burnHeld("airdrop", c, total);
      tx(() => {
        recordBurn(c.mint, burned, 0, "entry");
        run("UPDATE coin SET entry_status = 'done' WHERE mint = ?", c.mint);
        ledger({ coin: c.mint, kind: "entry-burn", mint: c.mint, amount: burned, tx: sig, note: "no holders to airdrop the entry to" });
      });
      return 0;
    }
    tx(() => {
      for (const s of shares) run("INSERT INTO entry_drop (coin, wallet, amount, ts) VALUES (?, ?, ?, ?)", c.mint, s.wallet, s.amount.toString(), at);
      run("UPDATE coin SET entry_recipients = ? WHERE mint = ?", shares.length, c.mint);
    });
  }

  const owed = all<{ wallet: string; amount: string }>("SELECT wallet, amount FROM entry_drop WHERE coin = ? AND tx IS NULL", c.mint);
  const batch = `sending:${at}`;
  let count = 0;
  if (owed.length) {
    run("UPDATE entry_drop SET tx = ? WHERE coin = ? AND tx IS NULL", batch, c.mint);
    const done = new Map((await engine.sendTokens("airdrop", c.mint, owed.map((o) => ({ to: o.wallet, amount: big(o.amount) })))).map((r) => [r.to, r.sig]));
    tx(() => {
      let paid = 0n;
      for (const o of owed) {
        const sig = done.get(o.wallet);
        if (!sig) {
          run("UPDATE entry_drop SET tx = NULL WHERE coin = ? AND wallet = ? AND tx = ?", c.mint, o.wallet, batch);
          continue;
        }
        run("UPDATE entry_drop SET tx = ?, ts = ? WHERE coin = ? AND wallet = ?", sig, at, c.mint, o.wallet);
        recordTransfer(c.mint, o.wallet, big(o.amount));
        paid += big(o.amount);
        count++;
      }
      run("UPDATE coin SET entry_sent = ? WHERE mint = ?", (big(getCoin(c.mint)!.entry_sent) + paid).toString(), c.mint);
      if (paid > 0n) ledger({ coin: c.mint, kind: "entry-airdrop", mint: c.mint, amount: paid, note: `to ${c.entry_for} holders` });
    });
  }
  if (!one("SELECT 1 FROM entry_drop WHERE coin = ? AND (tx IS NULL OR tx LIKE 'sending:%')", c.mint))
    run("UPDATE coin SET entry_status = 'done' WHERE mint = ?", c.mint);
  return count;
}

// ---------------------------------------------------------------- reads

/** A coin's family tag, or null when it has no copies. */
export function tagOf(c: CoinRow, at = now()): BloodlineTag | null {
  if (!c.family || !one("SELECT 1 FROM coin WHERE family = ? AND mint != ?", c.family, c.mint)) return null;
  const s = familyState(c.family, at)!;
  return { family: c.family, og: ref(s.og), leader: ref(s.leader), members: s.members.length, unpaid: c.entry_status === "unpaid" };
}

/** Every coin's family tag, computed once per family. */
export function bloodlineTags(at = now()): Map<string, BloodlineTag> {
  const families = all<{ family: string }>("SELECT family FROM coin WHERE family != '' GROUP BY family HAVING COUNT(*) > 1");
  const out = new Map<string, BloodlineTag>();
  for (const { family } of families) {
    const s = familyState(family, at);
    if (!s) continue;
    for (const m of s.members)
      out.set(m.c.mint, { family, og: ref(s.og), leader: ref(s.leader), members: s.members.length, unpaid: m.c.entry_status === "unpaid" });
  }
  return out;
}

export function bloodlineInfo(c: CoinRow, at = now()): BloodlineInfo {
  const s = familyState(c.family || c.mint, at) ?? rank([c], at);
  const sUsd = solUsd();
  const quotes = new Map(all<{ mint: string; symbol: string }>("SELECT mint, symbol FROM quote").map((q) => [q.mint, q.symbol]));
  const symbols = new Map(s.members.map((m) => [m.c.mint, m.c.symbol]));
  const members: BloodlineMember[] = s.members.map((m) => ({
    ...ref(m.c),
    quoteSymbol: quotes.get(m.c.quote) ?? "?",
    createdAt: m.c.created_at,
    og: m.c.mint === s.og.mint,
    leads: m.c.mint === s.leader.mint,
    alive: m.alive,
    marketCapUsd: m.mcapUsd,
    volumeUsd: m.c.volume_sol * sUsd,
    volume12hUsd: m.volume12hUsd,
    traders12h: m.traders12h,
    score: m.score,
    sentUsd: m.c.blood_sent_sol * sUsd,
    receivedUsd: m.c.blood_received_sol * sUsd,
    entry:
      m.c.entry_status === "pending" || m.c.entry_status === "done"
        ? {
            usd: m.c.entry_sol * sUsd,
            tokens: m.c.entry_tokens,
            to: m.c.entry_for ?? s.og.mint,
            toSymbol: symbols.get(m.c.entry_for ?? "") ?? getCoin(m.c.entry_for ?? "")?.symbol ?? s.og.symbol,
            recipients: m.c.entry_recipients,
            status: m.c.entry_status,
          }
        : null,
    unpaid: m.c.entry_status === "unpaid",
  }));
  // the leader first, then by score, then oldest first
  members.sort((a, b) => Number(b.leads) - Number(a.leads) || b.score - a.score || a.createdAt - b.createdAt);
  return {
    family: s.og.mint,
    key: s.og.symbol,
    leader: s.leader.mint,
    rule: s.rule,
    members,
    routedUsd: members.reduce((t, m) => t + m.sentUsd, 0),
    entriesUsd: members.reduce((t, m) => t + (m.entry?.usd ?? 0), 0),
    entryRecipients: members.reduce((t, m) => t + (m.entry?.recipients ?? 0), 0),
  };
}
