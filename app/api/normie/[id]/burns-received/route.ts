import { NextResponse } from "next/server";
import { fetchBurnsForReceiver } from "@/lib/normies-api";

export const revalidate = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const burns = await fetchBurnsForReceiver(numId, 50);
    return NextResponse.json(burns);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
