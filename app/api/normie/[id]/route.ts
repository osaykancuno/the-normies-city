import { NextResponse } from "next/server";
import { fetchNormieMetadata } from "@/lib/normies-api";

export const revalidate = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const meta = await fetchNormieMetadata(numId);
    return NextResponse.json(meta);
  } catch {
    // Don't 502 — return a placeholder so SWR keeps polling at its normal
    // refreshInterval (and resumes live data the moment upstream is back),
    // and so the panel doesn't enter SWR error backoff.
    return NextResponse.json({
      name: `Normie #${numId}`,
      description: "Live metadata unavailable — atlas baseline rendering only.",
      image: `/atlas.png#cell-${numId}`,
      attributes: [],
      stale: true,
    });
  }
}
