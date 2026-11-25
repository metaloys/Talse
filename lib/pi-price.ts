// Live Pi → USD market price, read from public exchange tickers.
//
// The revenue report's USD columns used to rest on a stored assumption. This
// module pulls the real spot price instead, from several independent markets,
// and takes the median so a single bad ticker (or one exchange halting PI)
// cannot distort the figure. Everything degrades gracefully: if every market is
// unreachable it returns the last good quote, and if there has never been one
// it returns null and callers fall back to their own assumption.
//
// Server-only: called from an admin route, never bundled into the client.

export type PiPriceSource = { name: string; usd: number };

export type PiPriceQuote = {
  /** USD per 1 Pi — the median across the sources that answered. */
  usd: number;
  /** Human label for where `usd` came from. */
  source: string;
  /** Every market that answered this round, for transparency. */
  sources: PiPriceSource[];
  /** ISO timestamp of when this quote was fetched. */
  fetchedAt: string;
};

const CACHE_TTL_MS = 60_000;
let cache: { at: number; quote: PiPriceQuote } | null = null;

function toPositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getJson(url: string, timeoutMs = 4000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Source = { name: string; url: string; pick: (json: any) => number | null };

// Order does not imply preference — all are fetched in parallel and combined.
const SOURCES: Source[] = [
  {
    name: "OKX",
    url: "https://www.okx.com/api/v5/market/ticker?instId=PI-USDT",
    pick: (j) => toPositive(j?.data?.[0]?.last),
  },
  {
    name: "Bitget",
    url: "https://api.bitget.com/api/v2/spot/market/tickers?symbol=PIUSDT",
    pick: (j) => toPositive(j?.data?.[0]?.lastPr),
  },
  {
    name: "MEXC",
    url: "https://api.mexc.com/api/v3/ticker/price?symbol=PIUSDT",
    pick: (j) => toPositive(j?.price),
  },
  {
    name: "CoinGecko",
    url: "https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=usd",
    pick: (j) => toPositive(j?.["pi-network"]?.usd),
  },
];

/** Current quote, or null when no market ever answered. Cached for 60s. */
export async function getPiUsdQuote(force = false): Promise<PiPriceQuote | null> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.quote;

  const settled = await Promise.allSettled(
    SOURCES.map(async (s): Promise<PiPriceSource> => {
      const json = await getJson(s.url);
      const usd = json ? s.pick(json) : null;
      if (usd === null) throw new Error(`${s.name} unavailable`);
      return { name: s.name, usd };
    }),
  );

  const sources = settled
    .filter((r): r is PromiseFulfilledResult<PiPriceSource> => r.status === "fulfilled")
    .map((r) => r.value);

  if (sources.length === 0) return cache?.quote ?? null;

  const sorted = [...sources].sort((a, b) => a.usd - b.usd);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid].usd : (sorted[mid - 1].usd + sorted[mid].usd) / 2;

  const quote: PiPriceQuote = {
    usd: Number(median.toFixed(6)),
    source: sources.length > 1 ? `median of ${sources.length} markets` : sources[0].name,
    sources,
    fetchedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), quote };
  return quote;
}
