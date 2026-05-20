import { NextResponse } from "next/server";
import { fetchVersions } from "@/lib/normies-api";

export const revalidate = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  // We return 200 + [] on upstream failure rather than 502. SWR clients
  // would otherwise enter exponential-backoff retry mode and slow down
  // recovery — with 200 + empty array, the normal refreshInterval keeps
  // polling at a steady cadence and picks up real data the moment the
  // Ponder backend returns.
  try {
    const versions = await fetchVersions(numId);
    return NextResponse.json(versions);
  } catch {
    return NextResponse.json([]);
  }
}
