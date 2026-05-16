import { NextResponse } from "next/server";
import { fetchAgentBindingsBatch } from "@/lib/normies-api";
import type { AwakenedRow } from "@/lib/types";

export const revalidate = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Awakening snapshot: returns the compact list of awakened Normies with their
// persona name + tagline when available. Powers the city-wide visual layer
// (halos, antennas, counter pill, persona name search) and the activity-feed
// diff loop.
//
// IMPORTANT: the upstream POST /agents/binding/batch endpoint silently caps
// its response when called with the full 10 k token-id payload — sending all
// 10 k returns ~52 entries even though the real awakened total is 400+. The
// fix is to CHUNK the batch into ~1 k slices and run them in parallel; each
// slice returns its full subset of awakened tokens. Total wall time is ~700
// ms (limited by the slowest chunk).
//
// We do NOT fan out /agents/metadata/:id from this route. With 400+ awakened
// growing fast, that fan-out can push past Vercel's 10 s budget. Instead the
// route harvests recent names from the public /agents/list endpoint (100 most
// recent agents per call, names included) and merges them onto the binding
// set. Older awakenings have name = "" until their AwakenedPanel opens and
// the lazy /api/agents/[id] fetch lands.

const TOTAL = 10_000;
const BATCH_CHUNK = 1_000;
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
    // limit=100 is the max the upstream returns; this gives us the freshest
    // awakened batch with names for the activity feed + name search.
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

function parseTagline(input: string | undefined | null): string {
  if (!input) return "";
  const first = input.split(/\.(\s|$)/, 1)[0] ?? "";
  return first.trim();
}

export async function GET() {
  try {
    // Parallel chunk-batch over the full collection.
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

    // Merge all chunks into one binding map.
    const bindings: Record<string, { agentId: string }> = {};
    for (const chunk of chunkResults) {
      for (const [k, v] of Object.entries(chunk)) bindings[k] = v;
    }

    // Build a name lookup from the recent-list payload.
    const namesById = new Map<string, { name: string; tagline: string }>();
    for (const item of listItems) {
      const tid = String(item.tokenId);
      const name = (item.name ?? "").trim();
      if (!name) continue;
      // Tagline isn't carried by /agents/list — synthesise a placeholder from
      // the type so the activity feed has something to show ("Human agent").
      const tagline = item.type ? `${item.type} agent` : "";
      namesById.set(tid, { name, tagline });
    }

    // Compose the awakened rows.
    const rows: AwakenedRow[] = [];
    for (const key of Object.keys(bindings)) {
      const tid = Number(key);
      if (!Number.isInteger(tid) || tid < 0 || tid >= TOTAL) continue;
      const named = namesById.get(key);
      rows.push({
        tokenId: tid,
        agentId: bindings[key].agentId,
        name: named?.name ?? "",
        tagline: named?.tagline ?? "",
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
