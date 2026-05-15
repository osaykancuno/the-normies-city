import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchBurnsForAddress,
  fetchBurnsForReceiver,
  fetchHolder,
  normieImageSvgUrl,
} from "@/lib/normies-api";
import type { BurnCommit } from "@/lib/types";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const NORMIES_CONTRACT = "0x9435208ca4a8dfba4bbffc52bd4d65fac3a87fd4";

interface PageProps {
  params: Promise<{ address: string }>;
}

/**
 * Computes the holder's leaderboard rank by reading the committed snapshot at
 * public/holders.json. Server-side only; ~3 ms on a warm cache.
 */
async function computeHolderRank(address: string): Promise<{
  rank: number;
  total: number;
  liveSupply: number;
}> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filepath = path.join(process.cwd(), "public", "holders.json");
    const raw = await fs.readFile(filepath, "utf8");
    const data = JSON.parse(raw) as { byToken: (string | null)[] };
    const counts = new Map<string, number>();
    let liveSupply = 0;
    for (const a of data.byToken) {
      if (!a) continue;
      liveSupply++;
      const lc = a.toLowerCase();
      counts.set(lc, (counts.get(lc) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([a]) => a === address.toLowerCase());
    return {
      rank: idx >= 0 ? idx + 1 : -1,
      total: sorted.length,
      liveSupply,
    };
  } catch {
    return { rank: -1, total: 0, liveSupply: 0 };
  }
}

export default async function HolderPage({ params }: PageProps) {
  const { address } = await params;
  if (!ADDRESS_RE.test(address)) notFound();

  const [holderSettled, burnsSettled, rankInfo] = await Promise.all([
    Promise.allSettled([fetchHolder(address)]).then((r) => r[0]),
    Promise.allSettled([fetchBurnsForAddress(address, 50)]).then((r) => r[0]),
    computeHolderRank(address),
  ]);
  const holder = holderSettled.status === "fulfilled" ? holderSettled.value : null;
  const burns = burnsSettled.status === "fulfilled" ? burnsSettled.value : [];

  // Official API returns `{ address, tokenIds: string[] }`. Earlier code looked at
  // `holder.tokens` which doesn't exist — left the page empty.
  const tokens = (holder?.tokenIds ?? [])
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 9999)
    .sort((a, b) => a - b);

  // Derived metrics from the burn history. We distinguish "haven't fetched" (—)
  // from "fetched, real count is zero" (0): whales who only collect never burn
  // anything, and the previous display made that look like missing data.
  const burnsAvailable = burnsSettled.status === "fulfilled";
  const totalBurned = burns.reduce((s, b) => s + (b.tokenCount || 0), 0);
  const totalAp = burns.reduce((s, b) => s + Number(b.totalActions || 0), 0);
  const firstBurn = burns[burns.length - 1];
  const lastBurn = burns[0];

  // ── PORTFOLIO HERITAGE ──
  // For each Normie currently in the wallet, the on-chain history records every
  // burn that contributed AP to it. Even if THIS wallet never burned a thing,
  // they might own modified Normies whose pixels were paid for by other wallets'
  // sacrifices. We sample the first 30 tokens of the portfolio (sorted ASC) and
  // aggregate the burns they received — capped to keep the request budget sane.
  const HERITAGE_SAMPLE_SIZE = 30;
  const heritageTokens = tokens.slice(0, HERITAGE_SAMPLE_SIZE);
  const heritageResults = await Promise.allSettled(
    heritageTokens.map((id) => fetchBurnsForReceiver(id, 10))
  );
  const heritageBurns: Array<BurnCommit & { receivedBy: number }> = [];
  for (let i = 0; i < heritageResults.length; i++) {
    const r = heritageResults[i];
    if (r.status === "fulfilled") {
      for (const b of r.value) heritageBurns.push({ ...b, receivedBy: heritageTokens[i] });
    }
  }
  const heritageAvailable = heritageResults.some((r) => r.status === "fulfilled");
  const inheritedBurns = heritageBurns.length;
  const inheritedSacrificed = heritageBurns.reduce((s, b) => s + (b.tokenCount || 0), 0);
  const inheritedAp = heritageBurns.reduce((s, b) => s + Number(b.totalActions || 0), 0);
  // Top-most recent heritage events for the UI list.
  const heritageSample = [...heritageBurns]
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 12);

  return (
    <main className="min-h-screen w-screen overflow-y-auto bg-ink text-off">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <Link
          href="/"
          className="mb-4 inline-block bg-on px-2 py-1 text-[10px] tracking-widest hover:bg-off/10"
        >
          ← BACK TO CITY
        </Link>

        <header className="mb-6">
          <div className="text-xs tracking-widest opacity-60">HOLDER</div>
          <h1 className="break-all text-lg tracking-widest">{address}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] opacity-80">
            <a
              className="underline"
              href={`https://etherscan.io/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              etherscan ↗
            </a>
            <a
              className="underline"
              href={`https://opensea.io/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              opensea ↗
            </a>
            <a
              className="underline"
              href={`https://opensea.io/${address}/normies`}
              target="_blank"
              rel="noreferrer"
            >
              opensea · normies ↗
            </a>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="NORMIES HELD" value={tokens.length} />
          <Stat
            label="RANK"
            value={
              rankInfo.rank > 0
                ? `#${rankInfo.rank} / ${rankInfo.total}`
                : "—"
            }
          />
          <Stat label="TOKENS BURNED" value={burnsAvailable ? totalBurned : "—"} />
          <Stat label="AP EARNED" value={burnsAvailable ? totalAp : "—"} />
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-[10px] tracking-widest opacity-60">
            PORTFOLIO · {tokens.length} normies
          </h2>
          {tokens.length === 0 ? (
            <div className="bg-on/60 px-3 py-2 text-[11px] opacity-60">
              no Normies in this wallet
            </div>
          ) : (
            <ul className="grid grid-cols-6 gap-1 sm:grid-cols-10 lg:grid-cols-12">
              {tokens.map((id) => (
                <li key={id}>
                  <Link href={`/normie/${id}`}>
                    <div className="aspect-square w-full bg-off" title={`#${id}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={normieImageSvgUrl(id)}
                        alt={`#${id}`}
                        className="h-full w-full"
                        style={{ imageRendering: "pixelated" }}
                        loading="lazy"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* PORTFOLIO HERITAGE — burns received by the Normies currently owned.
            Distinguishes 'this wallet's actions' from 'what was sacrificed to make
            the assets this wallet now holds'. Always rendered when the portfolio
            has any tokens, even if the heritage sample turns up empty. */}
        {tokens.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-[10px] tracking-widest opacity-60">
              PORTFOLIO HERITAGE
              {tokens.length > HERITAGE_SAMPLE_SIZE && (
                <span className="ml-2 opacity-70">
                  · sampled from first {HERITAGE_SAMPLE_SIZE} of {tokens.length}
                </span>
              )}
            </h2>
            <p className="mb-3 text-[10px] opacity-60">
              Burns that were committed by other wallets but whose action points
              now live in this portfolio (because the wallet later acquired the
              receiver Normie).
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                label="INHERITED BURNS"
                value={heritageAvailable ? inheritedBurns : "—"}
              />
              <Stat
                label="NORMIES SACRIFICED"
                value={heritageAvailable ? inheritedSacrificed : "—"}
              />
              <Stat
                label="INHERITED AP"
                value={heritageAvailable ? inheritedAp : "—"}
              />
            </div>
            {heritageSample.length === 0 ? (
              <div className="bg-on/60 px-3 py-2 text-[11px] opacity-60">
                {heritageAvailable
                  ? "none of the sampled Normies have received any burns"
                  : "could not fetch heritage data from the upstream"}
              </div>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {heritageSample.map((b) => (
                  <li
                    key={`${b.commitId}-${b.receivedBy}`}
                    className="grid grid-cols-[60px_70px_1fr_90px_90px_50px] items-center gap-2 bg-on/70 px-2 py-1"
                  >
                    <span className="opacity-60">#{b.commitId}</span>
                    <Link
                      href={`/holder/${b.owner}`}
                      className="truncate underline opacity-75"
                      title={b.owner}
                    >
                      {b.owner.slice(0, 6)}…{b.owner.slice(-4)}
                    </Link>
                    <Link
                      href={`/normie/${b.receivedBy}`}
                      className="truncate underline"
                    >
                      → #{b.receivedBy} (yours)
                    </Link>
                    <span className="tabular-nums">{b.tokenCount} burned</span>
                    <span className="tabular-nums opacity-60">+{b.totalActions} AP</span>
                    <a
                      className="underline opacity-60 hover:opacity-100"
                      href={`https://etherscan.io/tx/${b.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      tx
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {burns.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-[10px] tracking-widest opacity-60">
              BURN HISTORY · {burns.length} commits · {totalBurned} normies destroyed
            </h2>
            {firstBurn?.timestamp && lastBurn?.timestamp && (
              <div className="mb-2 text-[10px] opacity-60">
                first burn {new Date(Number(firstBurn.timestamp) * 1000).toLocaleDateString()} ·
                latest {new Date(Number(lastBurn.timestamp) * 1000).toLocaleDateString()}
              </div>
            )}
            <ul className="space-y-1 text-[11px]">
              {burns.map((b) => (
                <li
                  key={b.commitId}
                  className="grid grid-cols-[60px_1fr_90px_90px_50px] items-center gap-2 bg-on/70 px-2 py-1"
                >
                  <span className="opacity-60">#{b.commitId}</span>
                  <Link
                    href={`/normie/${b.receiverTokenId}`}
                    className="underline truncate"
                  >
                    → #{b.receiverTokenId}
                  </Link>
                  <span className="tabular-nums">{b.tokenCount} burned</span>
                  <span className="tabular-nums opacity-60">+{b.totalActions} AP</span>
                  <a
                    className="underline opacity-60 hover:opacity-100"
                    href={`https://etherscan.io/tx/${b.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    tx
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-off/15 pt-3 text-[10px] opacity-60">
          data:{" "}
          <a
            className="underline"
            href={`https://api.normies.art/holders/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            /holders/{address.slice(0, 10)}…
          </a>{" "}
          · contract{" "}
          <a
            className="underline"
            href={`https://etherscan.io/address/${NORMIES_CONTRACT}`}
            target="_blank"
            rel="noreferrer"
          >
            {NORMIES_CONTRACT.slice(0, 10)}…
          </a>
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-on px-3 py-2">
      <div className="text-[9px] tracking-widest opacity-50">{label}</div>
      <div className="text-base tabular-nums">{value}</div>
    </div>
  );
}
