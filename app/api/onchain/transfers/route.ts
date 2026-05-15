import { NextResponse } from "next/server";
import { ethClient, NORMIES_CONTRACT, transferEvent } from "@/lib/onchain";

export const revalidate = 30;
export const runtime = "nodejs";
// Don't prerender at build time — depends on a live RPC.
export const dynamic = "force-dynamic";

// 24 h @ 12 s/block. The Normies ERC-721 contract sees roughly ~150–200
// transfers per day, so 24 h is the right window for the "new holders today"
// banner without dragging in stale events.
const LOOKBACK_BLOCKS = 7200n;

// IMPORTANT: Alchemy's Free tier caps `eth_getLogs` to a 10-block range. The
// only practical way to fetch a multi-day window on Free is the
// Alchemy-specific `alchemy_getAssetTransfers` RPC, which has no block-range
// limit. Without an Alchemy key we fall back to the public RPC and chunk
// `getLogs` into ~800-block windows.

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_URL = ALCHEMY_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : null;
const CONTRACT_LC = NORMIES_CONTRACT.toLowerCase();

type Transfer = {
  tokenId: number;
  from: string;
  to: string;
  txHash: string;
  blockNumber: number;
};

async function fetchViaAlchemy(from: bigint, to: bigint): Promise<Transfer[]> {
  if (!ALCHEMY_URL) throw new Error("no alchemy key");
  const collected: Transfer[] = [];
  let pageKey: string | undefined;
  for (let i = 0; i < 20; i++) {
    const params: Record<string, unknown> = {
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + to.toString(16),
      contractAddresses: [CONTRACT_LC],
      category: ["erc721"],
      withMetadata: false,
      maxCount: "0x3e8", // 1000
      order: "asc",
    };
    if (pageKey) params.pageKey = pageKey;
    const res = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [params],
      }),
      // Avoid Next data-cache: this route is already revalidated upstream.
      cache: "no-store",
    });
    const json = (await res.json()) as {
      result?: {
        transfers?: Array<{
          blockNum: string;
          from: string;
          to: string;
          hash: string;
          tokenId?: string;
        }>;
        pageKey?: string;
      };
      error?: { message: string };
    };
    if (json.error) throw new Error("alchemy: " + json.error.message);
    const transfers = json.result?.transfers ?? [];
    for (const t of transfers) {
      const tidStr = t.tokenId;
      if (!tidStr) continue;
      const tokenId = Number(BigInt(tidStr));
      collected.push({
        tokenId,
        from: t.from,
        to: t.to,
        txHash: t.hash,
        blockNumber: Number(BigInt(t.blockNum)),
      });
    }
    pageKey = json.result?.pageKey;
    if (!pageKey) break;
  }
  return collected;
}

async function fetchViaPublicRpc(from: bigint, latest: bigint): Promise<Transfer[]> {
  const CHUNK = 800n;
  const collected: Transfer[] = [];
  for (let start = from; start <= latest; start += CHUNK + 1n) {
    const end = start + CHUNK > latest ? latest : start + CHUNK;
    const chunkLogs = await ethClient.getLogs({
      address: NORMIES_CONTRACT,
      event: transferEvent,
      fromBlock: start,
      toBlock: end,
    });
    for (const log of chunkLogs) {
      collected.push({
        tokenId: Number(log.args.tokenId),
        from: log.args.from as string,
        to: log.args.to as string,
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
      });
    }
  }
  return collected;
}

export async function GET() {
  try {
    const latest = await ethClient.getBlockNumber();
    const from = latest - LOOKBACK_BLOCKS;
    const raw = ALCHEMY_URL
      ? await fetchViaAlchemy(from, latest)
      : await fetchViaPublicRpc(from, latest);

    const transfers = raw
      // Only Normies (token ids 0..9999).
      .filter((t) => Number.isFinite(t.tokenId) && t.tokenId >= 0 && t.tokenId <= 9999)
      .sort((a, b) => a.blockNumber - b.blockNumber);

    return NextResponse.json(transfers);
  } catch (err) {
    // Fail soft: return empty list so the UI doesn't error out when the RPC is down.
    console.error("transfers route failed:", err);
    return NextResponse.json([]);
  }
}
