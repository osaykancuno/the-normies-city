// Resilience layer for upstream api.normies.art calls.
//
// Why this exists: the upstream Ponder indexer that powers /history/*,
// /normie/{id}/*, /holders/*, and /agents/* periodically returns 502
// "request aborted due to timeout" — sometimes for minutes at a stretch.
// Without protection every page in the app degrades to empty stats, missing
// holders, blank burn history, and a snapshot route that returns 502.
//
// With this wrapper, every upstream call passes through a server-side
// in-memory cache:
//   - On 2xx: we store the parsed JSON body + timestamp keyed by URL, and
//     return it as "fresh".
//   - On error / non-2xx / network failure: we serve the last-known-good
//     entry as "stale" instead of bubbling the failure up. The route stays
//     200 to the client; the badge layer can surface staleness if needed.
//   - After STALE_MAX_AGE_MS the cached entry is considered too old to
//     trust and we re-throw the original failure.
//
// In Vercel, each serverless container has its own in-memory cache. A cold
// start with the upstream already down has no fallback for THAT container —
// but every subsequent request to the same container is protected, and
// long-cache TTLs (60–300 s on edges) absorb most cold-misses anyway.

const FRESH_LOG = process.env.NODE_ENV !== "production";

// Stale entries older than this are treated as missing. 7 days lets the app
// stay alive through extended Ponder outages without serving truly ancient
// data.
const STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Total in-memory cache cap. With ~30 distinct upstream paths used today and
// per-token variants (10 000 token IDs), most paths hit a small subset, so a
// few thousand entries comfortably covers a busy session.
const MAX_ENTRIES = 5000;

type Entry<T = unknown> = {
  data: T;
  ts: number; // ms epoch of the last successful fetch
};

const cache = new Map<string, Entry>();

/** Drop the oldest entry when we exceed the cap. Keeps memory bounded
 *  without needing a real LRU implementation — the Map iteration order is
 *  insertion order, so the first key is effectively the oldest insert. */
function trim() {
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export interface CachedResult<T> {
  data: T;
  /** True when the upstream call failed and we served the in-memory cache. */
  stale: boolean;
  /** Epoch ms of the last successful upstream fetch for this URL.
   *  null if we have never seen a 2xx for it. */
  lastFetched: number | null;
}

interface CachedGetOptions {
  /** Forwarded to Next.js fetch — controls edge cache TTL. */
  revalidate?: number;
  /** Bypass the next-fetch edge cache entirely (always hits upstream). */
  noStore?: boolean;
  /** Custom fetch init (method, body, headers). */
  init?: RequestInit;
}

/** Fetch a JSON resource with stale-while-error semantics. The caller still
 *  gets the parsed JSON as `T`; the `stale` flag is metadata for
 *  observability. Throws only when the upstream fails AND we have no
 *  recoverable cached copy. */
export async function cachedFetchJson<T>(
  url: string,
  options: CachedGetOptions = {},
): Promise<CachedResult<T>> {
  const key = options.init?.method
    ? `${options.init.method.toUpperCase()} ${url}${
        options.init.body ? `:${hashBody(options.init.body)}` : ""
      }`
    : url;

  const init: RequestInit = { ...(options.init ?? {}) };
  if (options.noStore) {
    init.cache = "no-store";
  } else if (options.revalidate != null) {
    // The `next` field is a Next.js extension to RequestInit; the public
    // type allows revalidate: number | false. We always pass a number here.
    (init as RequestInit & { next?: { revalidate: number } }).next = {
      revalidate: options.revalidate,
    };
  }

  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`upstream ${res.status} ${res.statusText}`);
    const data = (await res.json()) as T;
    const ts = Date.now();
    cache.set(key, { data, ts });
    trim();
    return { data, stale: false, lastFetched: ts };
  } catch (err) {
    const cached = cache.get(key) as Entry<T> | undefined;
    if (cached && Date.now() - cached.ts < STALE_MAX_AGE_MS) {
      if (FRESH_LOG) {
        console.warn(
          `[api-cache] serving stale for ${key} (age ${Math.round(
            (Date.now() - cached.ts) / 1000,
          )}s): ${(err as Error).message}`,
        );
      }
      return { data: cached.data, stale: true, lastFetched: cached.ts };
    }
    throw err;
  }
}

/** Convenience: same as cachedFetchJson but unwraps to just the data. The
 *  caller loses the stale/lastFetched metadata; useful when retrofitting
 *  existing call sites that expect a plain Promise<T>. */
export async function cachedGetJson<T>(
  url: string,
  options: CachedGetOptions = {},
): Promise<T> {
  const { data } = await cachedFetchJson<T>(url, options);
  return data;
}

/** Introspection: latest cache state for a URL, without triggering a fetch.
 *  Used by /api/health to expose data freshness diagnostics. */
export function getCacheStatus(url: string):
  | { hit: false }
  | { hit: true; lastFetched: number; ageMs: number } {
  const e = cache.get(url);
  if (!e) return { hit: false };
  return { hit: true, lastFetched: e.ts, ageMs: Date.now() - e.ts };
}

/** Total number of cached entries; for health diagnostics. */
export function getCacheSize(): number {
  return cache.size;
}

function hashBody(body: BodyInit): string {
  if (typeof body === "string") {
    // FNV-1a-ish 32-bit hash — good enough to distinguish batch payloads.
    let h = 2166136261;
    for (let i = 0; i < body.length; i++) {
      h ^= body.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }
  return "body";
}
