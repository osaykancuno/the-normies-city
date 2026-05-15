import { NextResponse } from "next/server";
import { NORMIES_CONTRACT } from "@/lib/onchain";

export const revalidate = 300; // 5 min edge cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live holder map. Returns `{ byToken: (string|null)[], builtAt }` in the
// same shape as the static public/holders.json so the client can swap them
// transparently — but generated FRESH from Alchemy on every cache miss.
//
// The static file under public/ is only refreshed at build time and quickly
// gets stale (new mints, secondary trades). On-chain transfers caught by
// /api/onchain/transfers mutate the in-memory store while the tab is open,
// but a page reload would revert to the stale snapshot. This route fixes
// that: a single `getOwnersForContract` call returns the entire ownership
// map (~10 KB compressed), edge-cached for 5 min.

const TOTAL = 10_000;
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;

type OwnerEntry = {
  ownerAddress: string;
  tokenBalances: Array<{ tokenId: string; balance: string }>;
};

type AlchemyResponse = {
  owners?: OwnerEntry[];
  pageKey?: string;
};

async function fetchAllOwners(): Promise<OwnerEntry[]> {
  if (!ALCHEMY_KEY) throw new Error("no alchemy key");
  const all: OwnerEntry[] = [];
  let pageKey: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getOwnersForContract`,
    );
    url.searchParams.set("contractAddress", NORMIES_CONTRACT);
    url.searchParams.set("withTokenBalances", "true");
    if (pageKey) url.searchParams.set("pageKey", pageKey);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("alchemy " + res.status);
    const json = (await res.json()) as AlchemyResponse;
    if (json.owners) all.push(...json.owners);
    pageKey = json.pageKey;
    if (!pageKey) break;
  }
  return all;
}

export async function GET() {
  try {
    const owners = await fetchAllOwners();
    const byToken: (string | null)[] = new Array(TOTAL).fill(null);
    for (const o of owners) {
      const addrLc = o.ownerAddress.toLowerCase();
      // Filter the zero address — burned/dead supply.
      const isDead = /^0x0+$/.test(addrLc);
      for (const b of o.tokenBalances) {
        const id = Number(b.tokenId);
        if (!Number.isFinite(id) || id < 0 || id >= TOTAL) continue;
        byToken[id] = isDead ? null : addrLc;
      }
    }
    return NextResponse.json({
      byToken,
      builtAt: new Date().toISOString(),
      source: "alchemy",
    });
  } catch (err) {
    console.error("holders route failed:", err);
    // Surface a 502 so the client can fall back to the static snapshot.
    return NextResponse.json(
      { error: String(err) },
      { status: 502 },
    );
  }
}
