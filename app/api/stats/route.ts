import { NextResponse } from "next/server";
import { fetchStats } from "@/lib/normies-api";

export const revalidate = 15;

export async function GET() {
  try {
    const stats = await fetchStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
