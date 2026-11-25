import { brand, type PlatformToken } from "@gantry/shared";
import { config } from "./config";
import { getCoin } from "./ledger";
import { jupTokens, type JupToken } from "./prices";
import { coinCandles24h, quotesMap, shapeCoin } from "./services";

/** Jupiter's last record of the platform token, for one that was not launched here. */
let external: JupToken | null = null;

function listedCoin(mint: string) {
  const c = getCoin(mint);
  const q = c && quotesMap().get(c.quote);
  return c && q ? shapeCoin(c, q, coinCandles24h(mint)) : null;
}

/** Asks Jupiter about a platform token this server does not index. A failure keeps the last answer. */
export async function refreshPlatformToken() {
  const mint = config.mainToken;
  if (!mint || config.demo || config.cluster !== "mainnet-beta" || getCoin(mint)) return;
  external = (await jupTokens([mint]))[0] ?? external;
}

/** The platform token as the site shows it: from its coin when it was launched here, else from Jupiter. */
export function platformToken(): PlatformToken | null {
  const mint = config.mainToken;
  if (!mint) return null;
  const c = listedCoin(mint);
  if (c)
    return {
      address: mint,
      symbol: c.symbol,
      name: c.name,
      image: c.image,
      priceUsd: c.priceUsd,
      marketCapUsd: c.marketCapUsd,
      change24h: c.change24h,
      listed: true,
    };
  return {
    address: mint,
    symbol: external?.symbol || brand.mainTicker,
    name: external?.name || brand.name,
    image: external?.icon ?? "",
    priceUsd: external?.usdPrice ?? null,
    marketCapUsd: external?.mcap ?? null,
    change24h: external?.stats24h?.priceChange ?? null,
    listed: false,
  };
}
