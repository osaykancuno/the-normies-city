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
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
