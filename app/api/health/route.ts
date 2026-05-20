import { NextResponse } from "next/server";
import { BASE } from "@/lib/normies-api";
import { getCacheSize, getCacheStatus } from "@/lib/api-cache";

export const revalidate = 0;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health endpoint: probes the upstream api.normies.art and reports the state
// of our in-memory stale-while-error cache. Used by the top-bar UpstreamBadge
// to surface "DATA STALE — upstream down" without users having to guess why
// stats look frozen.

const PROBE_URL = `${BASE}/canvas/status`; // /canvas/status is the lightest endpoint and the most resilient one we've observed during Ponder outages.
const SNAPSHOT_URL = `${BASE}/agents/binding/batch`;

export async function GET() {
  let upstream: "up" | "down" | "unknown" = "unknown";
  let probeMs = 0;
  const startedAt = Date.now();
  try {
    const t0 = Date.now();
    const res = await fetch(PROBE_URL, { cache: "no-store" });
    probeMs = Date.now() - t0;
    upstream = res.ok ? "up" : "down";
  } catch {
    upstream = "down";
  }

  // Surface a few salient cache entries so we can tell from the outside
  // whether the app will still render correctly if the upstream stays down.
  const snapshotKey = `POST ${SNAPSHOT_URL}`;
  // The snapshot route fans out 10 chunked batches; introspect the first one
  // (token ids 0..999) as a representative sample of the agent cache.
  // The actual key includes the hashed body, so we can only check presence
  // indirectly via cache size + upstream probe.
  return NextResponse.json({
    asOf: new Date().toISOString(),
    upstream,
    probeMs,
    cache: {
      size: getCacheSize(),
      canvasStatus: getCacheStatus(PROBE_URL),
    },
    elapsedMs: Date.now() - startedAt,
    // Use this to detect "running on stale data" in the UI.
    degraded: upstream !== "up",
  });
}
