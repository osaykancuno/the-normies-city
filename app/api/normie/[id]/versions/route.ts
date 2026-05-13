import { NextResponse } from "next/server";
import { fetchVersions } from "@/lib/normies-api";

export const revalidate = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const versions = await fetchVersions(numId);
    return NextResponse.json(versions);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
