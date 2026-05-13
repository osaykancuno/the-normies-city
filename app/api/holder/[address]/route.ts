import { NextResponse } from "next/server";
import { fetchHolder, fetchBurnsForAddress } from "@/lib/normies-api";

export const revalidate = 60;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const [holderSettled, burnsSettled] = await Promise.allSettled([
    fetchHolder(address),
    fetchBurnsForAddress(address, 25),
  ]);
  return NextResponse.json({
    holder: holderSettled.status === "fulfilled" ? holderSettled.value : null,
    burns: burnsSettled.status === "fulfilled" ? burnsSettled.value : [],
  });
}
