import { NextResponse } from "next/server";
import { BASE } from "@/lib/normies-api";
import { getCacheSize, getCacheStatus } from "@/lib/api-cache";

export const revalidate = 0;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health endpoint: probes the upstream api.normies.art and reports the state
// of our in-memory stale-while-error cache.
//
// Two probes:
//   - /canvas/status is CDN-served and stays UP even when the Ponder indexer
//     is down. Used as a "DNS/edge reachable" baseline.
//   - /agents/count goes through Ponder, which is the actual data backend
//     that fuels /history/*, /normie/*, /holders/*, /agents/*. If THIS
//     fails, the city is effectively running on cached snapshots even if
//     api.normies.art's host is reachable.
//
// `degraded` becomes true when the Ponder probe fails. The UpstreamBadge
// shows "DATA STALE" in that case so users know live counters are paused.

const PROBE_EDGE = `${BASE}/canvas/status`;
const PROBE_PONDER = `${BASE}/agents/count`;
const PROBE_TIMEOUT_MS = 6000;

type ProbeResult = "ok" | "fail";

async function probe(url: string): Promise<{ result: ProbeResult; ms: number }> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    return { result: res.ok ? "ok" : "fail", ms: Date.now() - t0 };
  } catch {
    return { result: "fail", ms: Date.now() - t0 };
  }
}

export async function GET() {
  const [edge, ponder] = await Promise.all([
    probe(PROBE_EDGE),
    probe(PROBE_PONDER),
  ]);

  // "up" means BOTH layers are healthy. "edge-only" lets the UI distinguish
  // a soft outage (Ponder indexer down) from a hard one (whole host
  // unreachable) — useful when communicating outages to the community.
  let upstream: "up" | "edge-only" | "down";
  if (edge.result === "ok" && ponder.result === "ok") upstream = "up";
  else if (edge.result === "ok") upstream = "edge-only";
  else upstream = "down";

  return NextResponse.json({
    asOf: new Date().toISOString(),
    upstream,
    edge,
    ponder,
    cache: {
      size: getCacheSize(),
      canvasStatus: getCacheStatus(PROBE_EDGE),
    },
    // The city is "degraded" any time the real data backend (Ponder) is
    // unreachable, even if api.normies.art's CDN host is alive.
    degraded: ponder.result !== "ok",
  });
}
