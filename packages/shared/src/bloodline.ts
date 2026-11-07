/**
 * Copies of a coin are allowed, but they feed the coin they copied. On the site this is the coin's Nest (brand.nest);
 * in code it is still called the bloodline.
 *
 * Coins whose ticker or name is the same once look-alike characters are folded (CAT, C4T, C@T) form one family. The
 * family's leader is the first coin (the OG) while it's alive; once it goes quiet, the alive member with the best
 * volume, traders and market cap; if every member is quiet, the best of them overall. Every other member sends its
 * whole fee split to the leader: its OTC half grows the leader's OTC credit and its protection half the leader's pot.
 *
 * A copy launched while the family has an alive leader also pays an entry: a first buy of BLOODLINE.entryUsd in its
 * own coin, bought before the creator's, which the launcher never receives. Those coins are airdropped to the
 * leader's holders. Normal launches pay nothing extra.
 */

import type { Address } from "./api";

export const BLOODLINE = {
  /** The entry a copy pays at launch, in USD of its pair's token. */
  entryUsd: 500,
  /** A member is alive with at least `aliveTraders` wallets and `aliveVolumeUsd` traded in the last `aliveHours`. */
  aliveHours: 12,
  aliveTraders: 3,
  aliveVolumeUsd: 300,
  /** The entry's coins go to at most this many of the leader's holders... */
  recipients: 50,
  /** ...none of them getting more than this share of it... */
  maxShareBps: 1_000,
  /** ...weighted by what each put in, counted up to this many times over for holders whose entry is above the price. */
  maxEntryBoost: 3,
} as const;

/** Rent of one token account: the entry pays for one per recipient, plus a little for the transfers' network fees. */
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;
export const ENTRY_RENT_LAMPORTS = BLOODLINE.recipients * TOKEN_ACCOUNT_RENT_LAMPORTS + 100_000;

// characters that stand in for a letter: digits and symbols, then Cyrillic and Greek look-alikes
const FOLD: Record<string, string> = {
  "0": "O", "1": "I", "|": "I", "!": "I", L: "I", "2": "Z", "3": "E", "4": "A", "@": "A", "5": "S", $: "S", "6": "G",
  "7": "T", "8": "B", "9": "G",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X", І: "I", Ј: "J", Ѕ: "S",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

/** What a ticker or name reads as: upper case, accents and look-alikes folded, everything but letters dropped. */
export function bloodKey(s: string) {
  let out = "";
  for (const ch of s.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase()) {
    const c = FOLD[ch] ?? ch;
    if (/^[A-Z]$/.test(c)) out += c;
  }
  return out;
}

export type BloodlineRef = { address: Address; symbol: string; name: string; image: string };

/** A coin's place in its family, on coin lists and pages. Null for a coin with no copies. */
export type BloodlineTag = {
  family: Address; // the OG
  og: BloodlineRef;
  leader: BloodlineRef;
  members: number;
  /** a copy that launched without paying the entry while the family had an alive leader; it isn't listed */
  unpaid: boolean;
};

export type BloodlineMember = BloodlineRef & {
  quoteSymbol: string;
  createdAt: number;
  og: boolean;
  leads: boolean;
  alive: boolean;
  marketCapUsd: number;
  volumeUsd: number; // lifetime
  volume12hUsd: number;
  traders12h: number;
  /** the share of the family's volume, traders and market cap the ranking gave it (0..3) */
  score: number;
  /** fees it sent to leaders, and fees it received from the family as leader */
  sentUsd: number;
  receivedUsd: number;
  entry: null | { usd: number; tokens: string; to: Address; toSymbol: string; recipients: number; status: "pending" | "done" };
  unpaid: boolean;
};

export type BloodlineInfo = {
  family: Address;
  key: string; // the family's name: its OG's ticker
  leader: Address;
  /** why the leader leads: the OG is alive, the best alive member, or the best member when none is alive */
  rule: "og" | "alive" | "best";
  members: BloodlineMember[];
  routedUsd: number;
  entriesUsd: number;
  entryRecipients: number;
};

/** What a launch with this ticker and name would join, and the entry it would pay on the given pair. */
export type BloodlineCheck = {
  family: null | { key: string /* the OG's ticker */; og: BloodlineRef; leader: BloodlineRef; leaderAlive: boolean; members: number };
  entry: null | {
    usd: number;
    quoteRaw: string; // in the pair's token
    rentLamports: string;
    to: BloodlineRef; // whose holders get it
  };
};
