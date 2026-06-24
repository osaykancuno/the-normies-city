import { NextResponse } from "next/server";
import { fetchRarityStats, fetchListedNormies } from "@/lib/normies-api";

export const revalidate = 30;

// Live marketplace layer for the Market District: floor price + listed count
// from /rarity/stats, plus the listed token IDs (cheapest first, capped) with
// their OpenSea price/url. Degrades to an empty/stale payload on outage.
const MAX_PAGES = 6; // up to ~600 listings
const LIMIT = 100;

export async function GET() {
  try {
    const stats = await fetchRarityStats();
    const items: { id: number; priceEth: number | null; url: string | null }[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetchListedNormies(page, LIMIT);
      const rows = r?.items ?? [];
      for (const it of rows) {
        if (!Number.isInteger(it.id)) continue;
        items.push({
          id: it.id,
          priceEth: it.listing?.priceEth ?? null,
          url: it.listing?.url ?? null,
        });
      }
      if (rows.length < LIMIT) break;
    }
    return NextResponse.json({
      floorPrice: stats?.floorPrice ?? null,
      listed: stats?.listed ?? items.length,
      openseaConnected: Boolean(stats?.openseaConnected),
      items,
    });
  } catch {
    return NextResponse.json({
      floorPrice: null,
      listed: null,
      openseaConnected: false,
      items: [],
      stale: true,
    });
  }
}
