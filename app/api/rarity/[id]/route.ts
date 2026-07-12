import { NextResponse } from "next/server";
import { fetchRarityNormie } from "@/lib/normies-api";

export const revalidate = 30;

// Live rarity detail passthrough for the profile panel — rank + score (+ fair
// value / underpriced flag). Degrades to { stale:true } on outage or when the
// token is burned (upstream 410) so the panel just hides the rarity row.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const d = await fetchRarityNormie(n);
    return NextResponse.json({
      rank: d.rank ?? null,
      score: d.rarityScore ?? null,
      fairValue: d.fairValue ?? null,
      underpriced: d.underpriced ?? null,
    });
  } catch {
    return NextResponse.json({ stale: true });
  }
}
