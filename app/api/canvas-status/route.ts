import { NextResponse } from "next/server";
import { fetchCanvasStatus } from "@/lib/normies-api";

export const revalidate = 30;

export async function GET() {
  try {
    const status = await fetchCanvasStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
