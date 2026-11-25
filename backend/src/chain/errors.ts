// Telling apart why a transaction failed, from the message web3.js throws (it carries the simulation logs).

/** The paying wallet ran out of SOL: for the fee itself, or for rent inside a System Program transfer. */
export const LOW_SOL = /insufficient lamports|insufficient funds|no record of a prior credit/i;

/** The price moved past the trade's limit: LaunchLab's ExceededSlippage (6004), or the same error by name from CPMM. */
export const SLIPPAGE = /\bExceededSlippage\b|custom program error: 0x1774\b/i;

/**
 * A locked LP position's fees are too small to collect: CPMM refuses a withdrawal that rounds to none of either
 * token (ZeroTradingTokens, 6006).
 */
export const TOO_LITTLE_TO_COLLECT = /\bZeroTradingTokens\b|custom program error: 0x1776\b/i;
