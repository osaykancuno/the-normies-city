import { NextResponse } from "next/server";
import { fetchZombieConversions } from "@/lib/normies-api";

export const revalidate = 30;

// Live zombie roster — token IDs whose conversion was revealed and not
// cancelled. Returns { ids: number[] }; degrades to [] on outage.
export async function GET() {
  try {
    const rows = await fetchZombieConversions();
    const ids = Array.from(
      new Set(
        (Array.isArray(rows) ? rows : [])
          .filter((r) => r.revealed && !r.cancelled)
          .map((r) => Number(r.tokenId))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9999),
      ),
    );
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ ids: [], stale: true });
  }
}
