// Shared helpers for build scripts.
// Throttles to ~55 req/min and backs off on 429 / 5xx.

const MIN_INTERVAL_MS = 1100; // ~54 req/min, leaves headroom under the 60/min limit.
let lastRequestAt = 0;

export async function rateLimitedFetch(url, { maxRetries = 6, max5xxRetries = 2 } = {}) {
  let fiveXxAttempts = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let res;
    try {
      res = await fetch(url, { headers: { "user-agent": "normie-city-build/0.1" } });
    } catch (err) {
      const backoff = backoffMs(attempt);
      console.warn(`  network error on ${url}: ${err.message} — retrying in ${backoff}ms`);
      await sleep(backoff);
      continue;
    }

    if (res.status === 429) {
      // Rate limit — honor Retry-After (or back off) and keep trying with full budget.
      const retryAfter = Number(res.headers.get("retry-after")) * 1000 || backoffMs(attempt);
      console.warn(`  429 on ${url} — sleeping ${retryAfter}ms`);
      await sleep(retryAfter);
      continue;
    }
    if (res.status >= 500) {
      // Server-side error — short, capped retries so a few bad endpoints don't tank
      // the whole batch. After max5xxRetries the response is returned as-is so the
      // caller can choose to skip-and-move-on.
      if (fiveXxAttempts >= max5xxRetries) {
        return res;
      }
      const backoff = Math.min(2000 + fiveXxAttempts * 1500, 5000);
      console.warn(`  ${res.status} on ${url} — retrying in ${backoff}ms`);
      await sleep(backoff);
      fiveXxAttempts++;
      continue;
    }
    return res;
  }
  throw new Error(`exhausted retries for ${url}`);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt) {
  return Math.min(60000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
}

export function formatEta(remaining) {
  const seconds = Math.round((remaining * MIN_INTERVAL_MS) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export const NORMIES_API = process.env.NORMIES_API_BASE || "https://api.normies.art";
export const TOTAL_NORMIES = 10000;
