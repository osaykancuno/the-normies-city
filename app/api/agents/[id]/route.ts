import { NextResponse } from "next/server";
import { fetchAgentInfo } from "@/lib/normies-api";

export const revalidate = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-token agent passthrough. Called lazily by the AwakenedPanel when the
// user clicks an awakened Normie — the full persona is ~12 KB so it's deferred
// off the snapshot path and edge-cached for 2 min per token.

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const info = await fetchAgentInfo(numId);
    return NextResponse.json(info);
  } catch {
    // Stale-friendly response: SWR clients keep polling at their normal
    // cadence (no exponential backoff) and pick up live data when
    // upstream recovers. The AwakenedPanel already gracefully renders
    // with just the name/tagline it already has from the snapshot.
    return NextResponse.json({ tokenId: String(numId), stale: true });
  }
}
