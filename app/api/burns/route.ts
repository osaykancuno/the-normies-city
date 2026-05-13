import { NextResponse } from "next/server";
import { fetchRecentBurns } from "@/lib/normies-api";

export const revalidate = 10;

export async function GET() {
  try {
    const burns = await fetchRecentBurns(20);
    return NextResponse.json(burns);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
