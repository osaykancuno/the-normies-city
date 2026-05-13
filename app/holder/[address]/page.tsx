import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchBurnsForAddress,
  fetchHolder,
  normieImageSvgUrl,
} from "@/lib/normies-api";

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

  // Derived metrics from the burn history.
  const totalBurned = burns.reduce((s, b) => s + (b.tokenCount || 0), 0);
  const totalAp = burns.reduce((s, b) => s + Number(b.totalActions || 0), 0);
  const firstBurn = burns[burns.length - 1];
  const lastBurn = burns[0];

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
          <Stat label="TOKENS BURNED" value={totalBurned || "—"} />
          <Stat label="AP EARNED" value={totalAp || "—"} />
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
