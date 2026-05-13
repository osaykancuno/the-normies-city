import { NextResponse } from "next/server";
import { fetchNormieCanvasDiff, fetchNormieCanvasInfo } from "@/lib/normies-api";

export const revalidate = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const [infoSettled, diffSettled] = await Promise.allSettled([
    fetchNormieCanvasInfo(numId),
    fetchNormieCanvasDiff(numId),
  ]);
  return NextResponse.json({
    info: infoSettled.status === "fulfilled" ? infoSettled.value : null,
    diff: diffSettled.status === "fulfilled" ? diffSettled.value : null,
  });
}
