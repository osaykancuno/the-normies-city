import { NextResponse } from "next/server";
import { fetchBurnedTokens } from "@/lib/normies-api";

export const revalidate = 300;

export async function GET() {
  try {
    // Pull a generous page; the API supports pagination but for the MVP graveyard a
    // single fetch is enough.
    const list = await fetchBurnedTokens(2000, 0);
    const ids = list.map((t) => Number(t.tokenId)).filter((n) => Number.isFinite(n));
    return NextResponse.json(ids);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
