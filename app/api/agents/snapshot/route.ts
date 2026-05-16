import { NextResponse } from "next/server";
import {
  fetchAgentBindingsBatch,
  fetchAgentMetadata,
} from "@/lib/normies-api";
import type { AgentMetadata, AwakenedRow } from "@/lib/types";

export const revalidate = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Awakening snapshot: returns the compact list of awakened Normies plus their
// persona name and tagline. Powers the city-wide visual layer (halos, antennas,
// counter pill, persona name search) and the activity-feed diff loop.
//
// Two upstream calls per cold miss:
//   1) POST /agents/binding/batch with all 10 k token IDs → only awakened
//      tokens are returned, so the response is tiny (~18 KB for 52 awakened).
//   2) Parallel GET /agents/metadata/:id for every awakened token, then parse
//      `name` (`"Normie #N - DisplayName"` → `DisplayName`) and tagline (first
//      sentence of `description`).
// At ~720 ms for the batch and ~790 B / call for metadata, the cold path is
// well under 2 s for the current scale. Edge cache at 60 s keeps the upstream
// pressure ≤ 53 hits / minute even if every visitor cold-misses.

const TOTAL = 10_000;

function parseDisplayName(metaName: string): string | null {
  // Upstream format: "Normie #4354 - Zori".  Split on " - " and take the tail.
  const idx = metaName.indexOf(" - ");
  if (idx < 0) return null;
  const tail = metaName.slice(idx + 3).trim();
  return tail.length > 0 ? tail : null;
}

function parseTagline(description: string): string {
  // Tagline is the first sentence — slice up to the first ". " or full stop.
  const first = description.split(/\.(\s|$)/, 1)[0] ?? "";
  return first.trim();
}

export async function GET() {
  try {
    const allIds = Array.from({ length: TOTAL }, (_, i) => i);
    const bindings = await fetchAgentBindingsBatch(allIds);

    const awakenedIds: number[] = [];
    for (const key of Object.keys(bindings)) {
      const n = Number(key);
      if (Number.isInteger(n) && n >= 0 && n < TOTAL) awakenedIds.push(n);
    }
    awakenedIds.sort((a, b) => a - b);

    // Fan out metadata in parallel. Failures are tolerated per-token: we'd
    // rather render a partial snapshot than 502 the whole list.
    const metaResults = await Promise.allSettled(
      awakenedIds.map((id) => fetchAgentMetadata(id)),
    );

    const rows: AwakenedRow[] = [];
    for (let i = 0; i < awakenedIds.length; i++) {
      const id = awakenedIds[i];
      const r = metaResults[i];
      const binding = bindings[String(id)];
      if (!binding) continue;
      let name = `#${id}`;
      let tagline = "";
      if (r.status === "fulfilled") {
        const md = r.value as AgentMetadata;
        const parsedName = parseDisplayName(md.name ?? "");
        if (parsedName) name = parsedName;
        tagline = parseTagline(md.description ?? "");
      }
      rows.push({ tokenId: id, agentId: binding.agentId, name, tagline });
    }

    return NextResponse.json({
      awakened: rows,
      asOf: new Date().toISOString(),
      total: rows.length,
    });
  } catch (err) {
    console.error("agents snapshot route failed:", err);
    return NextResponse.json(
      { awakened: [], asOf: new Date().toISOString(), total: 0, error: String(err) },
      { status: 502 },
    );
  }
}
