import { NextResponse } from "next/server";
import { ethClient, NORMIES_CONTRACT, transferSingleEvent } from "@/lib/onchain";

export const revalidate = 30;
export const runtime = "nodejs";
// Don't prerender at build time — depends on a live public RPC that may be flaky.
export const dynamic = "force-dynamic";

const LOOKBACK_BLOCKS = 200n; // ~40 min on mainnet.

export async function GET() {
  try {
    const latest = await ethClient.getBlockNumber();
    const logs = await ethClient.getLogs({
      address: NORMIES_CONTRACT,
      event: transferSingleEvent,
      fromBlock: latest - LOOKBACK_BLOCKS,
      toBlock: latest,
    });

    const transfers = logs
      .map((log) => ({
        tokenId: Number(log.args.id),
        from: log.args.from as string,
        to: log.args.to as string,
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
      }))
      // Only Normies (token ids 0..9999); the contract also mints "Asset" tokens
      // beyond that range.
      .filter((t) => Number.isFinite(t.tokenId) && t.tokenId >= 0 && t.tokenId <= 9999)
      .sort((a, b) => a.blockNumber - b.blockNumber);

    return NextResponse.json(transfers);
  } catch (err) {
    // Fail soft: return empty list so the UI doesn't error out when the RPC is down.
    console.error("transfers route failed:", err);
    return NextResponse.json([]);
  }
}
