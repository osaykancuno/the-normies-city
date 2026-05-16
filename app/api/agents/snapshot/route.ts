import { NextResponse } from "next/server";
import { fetchAgentBindingsBatch, fetchAgentMetadata } from "@/lib/normies-api";
import type { AwakenedRow } from "@/lib/types";

export const revalidate = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Awakening snapshot: returns the compact list of awakened Normies with their
// persona name + tagline. Powers the city-wide visual layer (halos, antennas,
// counter pill, persona name search) and the activity-feed diff loop.
//
// Pipeline (parallelised, edge-cached 60 s):
//   1. POST /agents/binding/batch chunked into 1k-id slices. The upstream
//      silently caps the response when called with 10k ids; chunking by 1k
//      recovers all awakened bindings in ~700 ms wall time.
//   2. GET /agents/list?limit=100 — fast path for the freshest names.
//   3. For every awakened id NOT covered by /agents/list, parallel-fetch
//      /agents/metadata/:id (~790 B each) with a hard concurrency cap.
//      Throttle keeps the function comfortably under Vercel's 10 s budget
//      while still resolving names for the older awakenings — the bit that
//      makes the SearchBar name lookup actually work for every awakened
//      Normie, not just the most recent 100.

const TOTAL = 10_000;
const BATCH_CHUNK = 1_000;
const METADATA_CONCURRENCY = 30; // upstream rate-limit friendly
const METADATA_RETRY_CONCURRENCY = 10;
const BASE = process.env.NORMIES_API_BASE || "https://api.normies.art";

type ListItem = {
  agentId: string;
  tokenId: string;
  name?: string;
  type?: string;
  registeredAt?: string;
};

async function fetchRecentList(): Promise<ListItem[]> {
  try {
    const res = await fetch(`${BASE}/agents/list?limit=100`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: ListItem[] };
    return json.items ?? [];
  } catch {
    return [];
  }
}

function parseDisplayName(metaName: string | null | undefined): string {
  // Upstream metadata.name format: "Normie #4354 - Zori".  Split on " - "
  // and take the tail; if the format ever changes we fall back to the raw
  // string so the row at least carries something searchable.
  if (!metaName) return "";
  const idx = metaName.indexOf(" - ");
  if (idx < 0) return metaName.trim();
  return metaName.slice(idx + 3).trim();
}

function parseTagline(description: string | null | undefined): string {
  if (!description) return "";
  const first = description.split(/\.(\s|$)/, 1)[0] ?? "";
  return first.trim();
}

/** Parallel-fetch with bounded concurrency. Returns one result per input id,
 *  in the same order. Failures slot in as null so the caller can soldier on. */
async function mapWithConcurrency<T>(
  ids: number[],
  limit: number,
  fn: (id: number) => Promise<T | null>,
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(ids.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= ids.length) return;
      try {
        results[i] = await fn(ids[i]);
      } catch {
        results[i] = null;
      }
    }
  };
  const workers = Array.from({ length: Math.min(limit, ids.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function GET() {
  try {
    // Step 1: parallel chunk-batch over the full collection.
    const chunks: number[][] = [];
    for (let off = 0; off < TOTAL; off += BATCH_CHUNK) {
      chunks.push(
        Array.from({ length: Math.min(BATCH_CHUNK, TOTAL - off) }, (_, i) => off + i),
      );
    }
    const [chunkResults, listItems] = await Promise.all([
      Promise.all(chunks.map((ids) => fetchAgentBindingsBatch(ids))),
      fetchRecentList(),
    ]);

    const bindings: Record<string, { agentId: string }> = {};
    for (const chunk of chunkResults) {
      for (const [k, v] of Object.entries(chunk)) bindings[k] = v;
    }

    // Step 2: harvest names from the recent-list fast path.
    const named = new Map<string, { name: string; tagline: string }>();
    for (const item of listItems) {
      const tid = String(item.tokenId);
      const name = (item.name ?? "").trim();
      if (!name) continue;
      const tagline = item.type ? `${item.type} agent` : "";
      named.set(tid, { name, tagline });
    }

    // Step 3: fan out metadata for awakened ids that didn't appear in the
    // recent list. Throttled so the route stays comfortably under 10 s on
    // Vercel even as the awakened set grows past a few thousand.
    const allAwakenedIds = Object.keys(bindings)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL);
    const needsMeta = allAwakenedIds.filter((id) => !named.has(String(id)));

    if (needsMeta.length > 0) {
      const absorb = (ids: number[], results: (Awaited<ReturnType<typeof fetchAgentMetadata>> | null)[]) => {
        for (let i = 0; i < ids.length; i++) {
          const md = results[i];
          if (!md) continue;
          const display = parseDisplayName(md.name);
          if (!display) continue;
          named.set(String(ids[i]), {
            name: display,
            tagline: parseTagline(md.description),
          });
        }
      };

      const meta = await mapWithConcurrency(
        needsMeta,
        METADATA_CONCURRENCY,
        (id) => fetchAgentMetadata(id).catch(() => null),
      );
      absorb(needsMeta, meta);

      // Retry pass for any tokens whose metadata didn't come through (usually
      // upstream 429s during the burst). Lower concurrency + a small backoff
      // gives the rate-limit window time to reopen.
      const stillUnnamed = needsMeta.filter((id) => !named.has(String(id)));
      if (stillUnnamed.length > 0) {
        await new Promise((r) => setTimeout(r, 500));
        const retry = await mapWithConcurrency(
          stillUnnamed,
          METADATA_RETRY_CONCURRENCY,
          (id) => fetchAgentMetadata(id).catch(() => null),
        );
        absorb(stillUnnamed, retry);
      }
    }

    // Step 4: compose the awakened rows.
    const rows: AwakenedRow[] = [];
    for (const tid of allAwakenedIds) {
      const key = String(tid);
      const binding = bindings[key];
      if (!binding) continue;
      const hit = named.get(key);
      rows.push({
        tokenId: tid,
        agentId: binding.agentId,
        name: hit?.name ?? "",
        tagline: hit?.tagline ?? "",
      });
    }
    rows.sort((a, b) => a.tokenId - b.tokenId);

    return NextResponse.json({
      awakened: rows,
      asOf: new Date().toISOString(),
      total: rows.length,
      namedCount: rows.filter((r) => r.name).length,
    });
  } catch (err) {
    console.error("agents snapshot route failed:", err);
    return NextResponse.json(
      { awakened: [], asOf: new Date().toISOString(), total: 0, error: String(err) },
      { status: 502 },
    );
  }
}
