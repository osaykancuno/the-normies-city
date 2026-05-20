import { NextResponse } from "next/server";
import { fetchBurnedToken } from "@/lib/normies-api";

export const revalidate = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const info = await fetchBurnedToken(numId);
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ tokenId: String(numId), stale: true });
  }
}
