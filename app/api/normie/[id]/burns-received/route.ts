import { NextResponse } from "next/server";
import { fetchAllBurnsForReceiver } from "@/lib/normies-api";

export const revalidate = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const burns = await fetchAllBurnsForReceiver(numId);
    return NextResponse.json(burns);
  } catch {
    // [] keeps PortfolioHeritage in normal polling mode; counts show 0
    // for this token until upstream recovers.
    return NextResponse.json([]);
  }
}
