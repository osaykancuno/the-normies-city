import { NextResponse } from "next/server";
import { fetchStats } from "@/lib/normies-api";

export const revalidate = 15;

export async function GET() {
  // The lib/normies-api stale-while-error layer serves last-known values
  // when upstream 502s. If even THAT has nothing (cold container during
  // outage) we degrade to a placeholder object with stale:true rather
  // than a 502 — SWR clients then poll at their normal cadence instead
  // of entering exponential-backoff retry, which means counters resume
  // ticking the moment Ponder recovers.
  try {
    const stats = await fetchStats();
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({
      totalBurnCommitments: 0,
      totalBurnedTokens: 0,
      totalTransforms: 0,
      totalActionPointsDistributed: "0",
      stale: true,
    });
  }
}
