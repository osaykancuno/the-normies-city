import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchBurnsForAddress,
  fetchHolder,
  normieImageSvgUrl,
} from "@/lib/normies-api";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

interface PageProps {
  params: Promise<{ address: string }>;
}

export default async function HolderPage({ params }: PageProps) {
  const { address } = await params;
  if (!ADDRESS_RE.test(address)) notFound();

  const [holderSettled, burnsSettled] = await Promise.allSettled([
    fetchHolder(address),
    fetchBurnsForAddress(address, 50),
  ]);
  const holder = holderSettled.status === "fulfilled" ? holderSettled.value : null;
  const burns = burnsSettled.status === "fulfilled" ? burnsSettled.value : [];

  const tokens = (holder?.tokens ?? [])
    .map((t) => Number(t.tokenId))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 9999);

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
          <h1 className="text-sm tracking-widest opacity-60">HOLDER</h1>
          <div className="break-all text-lg tracking-widest">{address}</div>
          <div className="mt-1 flex gap-3 text-[10px] opacity-70">
            <a
              className="underline"
              href={`https://etherscan.io/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              etherscan
            </a>
            <a
              className="underline"
              href={`https://opensea.io/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              opensea
            </a>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="mb-2 text-[10px] tracking-widest opacity-60">
            NORMIES HELD · {tokens.length}
          </h2>
          {tokens.length === 0 ? (
            <div className="bg-on/60 px-3 py-2 text-[11px] opacity-60">no Normies in this wallet</div>
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
          <section>
            <h2 className="mb-2 text-[10px] tracking-widest opacity-60">
              BURN HISTORY · {burns.length}
            </h2>
            <ul className="space-y-1 text-[11px]">
              {burns.map((b) => (
                <li
                  key={b.commitId}
                  className="grid grid-cols-[60px_1fr_80px_80px_40px] items-center gap-2 bg-on/70 px-2 py-1"
                >
                  <span className="opacity-60">#{b.commitId}</span>
                  <Link href={`/normie/${b.receiverTokenId}`} className="underline">
                    → #{b.receiverTokenId}
                  </Link>
                  <span className="tabular-nums">{b.tokenCount} burned</span>
                  <span className="tabular-nums opacity-60">{b.totalActions} AP</span>
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
      </div>
    </main>
  );
}
