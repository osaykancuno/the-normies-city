import { NextResponse } from "next/server";
import { fetchLegendaryCanvas } from "@/lib/normies-api";

export const revalidate = 60;

// Legendary Canvas roster — the handful of Normies elevated to artist canvases.
// Returns a compact [{ tokenId, artist }] list. Degrades to [] on outage so the
// gallery just renders empty instead of erroring.
export async function GET() {
  try {
    const rows = await fetchLegendaryCanvas();
    const items = (Array.isArray(rows) ? rows : [])
      .filter((r) => r.isLegendary)
      .map((r) => ({ tokenId: Number(r.tokenId), artist: r.artistName || "" }))
      .filter((r) => Number.isInteger(r.tokenId) && r.tokenId >= 0 && r.tokenId <= 9999);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [], stale: true });
  }
}
