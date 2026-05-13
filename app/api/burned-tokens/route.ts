import { NextResponse } from "next/server";
import { fetchAllBurnedTokens } from "@/lib/normies-api";

export const revalidate = 300;

export async function GET() {
  try {
    // Paginated walk — the upstream caps each page at 100 ids, and at ~1.8k burned
    // tokens we need ~18 round-trips. Result is cached for 5 minutes at the edge so
    // the cost is amortised across all visitors.
    const list = await fetchAllBurnedTokens();
    const ids = list
      .map((t) => Number(t.tokenId))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 9999);
    return NextResponse.json(ids);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
