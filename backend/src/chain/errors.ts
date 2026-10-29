// Telling apart why a backend transaction failed, from the message web3.js throws (it carries the simulation logs).

/** DBC errors that mean the quote mint itself is unsupported, by name or as Anchor's hex code (6008, 6028, 6080, 6081). */
export const QUOTE_REJECTED =
  /\b(InvalidQuoteMint|UnsupportNativeMintToken2022|InvalidTokenBadge|QuoteMintHasNonZeroTransferFee)\b|custom program error: 0x(1778|178c|17c0|17c1)\b/i;

/** The paying wallet ran out of SOL: for the fee itself, or for rent inside a System Program transfer. */
export const LOW_SOL = /insufficient lamports|insufficient funds|no record of a prior credit/i;
