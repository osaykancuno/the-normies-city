import { NextResponse } from "next/server";
import { ethClient, NORMIES_CONTRACT, transferSingleEvent } from "@/lib/onchain";

export const revalidate = 30;
export const runtime = "nodejs";
// Don't prerender at build time — depends on a live public RPC that may be flaky.
export const dynamic = "force-dynamic";

// ~24 h on mainnet at 12 s/block. Required to surface NEW HOLDERS that joined
// recently — the previous 200-block (~40 min) window meant the banner showed 0
// almost permanently. Alchemy supports up to 10k blocks per getLogs call;
// public RPCs typically cap at 1–2k, so we chunk defensively when no Alchemy
// key is configured.
const LOOKBACK_BLOCKS = 7200n;
const USING_ALCHEMY = Boolean(process.env.ALCHEMY_API_KEY);
const CHUNK = USING_ALCHEMY ? 7200n : 800n;

export async function GET() {
  try {
    const latest = await ethClient.getBlockNumber();
    const from = latest - LOOKBACK_BLOCKS;
    const fetchChunk = (s: bigint, e: bigint) =>
      ethClient.getLogs({
        address: NORMIES_CONTRACT,
        event: transferSingleEvent,
        fromBlock: s,
        toBlock: e,
      });
    type LogChunk = Awaited<ReturnType<typeof fetchChunk>>;
    const logs: LogChunk = [] as unknown as LogChunk;
    for (let start = from; start <= latest; start += CHUNK + 1n) {
      const end = start + CHUNK > latest ? latest : start + CHUNK;
      const chunkLogs = await fetchChunk(start, end);
      logs.push(...chunkLogs);
    }

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
