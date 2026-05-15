"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BurnCommit } from "@/lib/types";

// PORTFOLIO HERITAGE — client-side progressive fetcher.
//
// Why client-side: a holder with 100+ Normies, each with 10–50 burns received,
// is a chain of API calls far longer than Vercel's 10 s serverless budget. By
// running in the browser we get:
//   1. No request-time budget cap — the browser can take a minute if it must.
//   2. Per-endpoint Vercel edge cache (60 s) absorbs concurrent hits across
//      visitors so api.normies.art's 60-req/min rate limit is respected.
//   3. Progressive disclosure — counts and sample list update as each token
//      resolves, so the page never feels stuck.
//
// Concurrency: browsers cap simultaneous fetches to ~6 per origin. We send 6
// at a time; with edge cache warm this resolves at roughly the speed of HTTP
// round-trips (a few seconds for 100 tokens).

const CONCURRENCY = 6;

type HeritageBurn = BurnCommit & { receivedBy: number };

export default function PortfolioHeritage({ tokens }: { tokens: number[] }) {
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [burns, setBurns] = useState<HeritageBurn[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tokens.length === 0) {
      setDone(true);
      return;
    }
    let cancelled = false;
    const queue = [...tokens];
    const collected: HeritageBurn[] = [];

    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        if (id === undefined) return;
        try {
          const res = await fetch(`/api/normie/${id}/burns-received`);
          if (res.ok) {
            const list = (await res.json()) as BurnCommit[];
            for (const b of list) collected.push({ ...b, receivedBy: id });
          } else {
            if (!cancelled) setFailed((f) => f + 1);
          }
        } catch {
          if (!cancelled) setFailed((f) => f + 1);
        }
        if (cancelled) return;
        setCompleted((n) => n + 1);
        // Periodic flush so the UI ticks forward as burns accumulate.
        setBurns([...collected]);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker);
    Promise.all(workers).then(() => {
      if (cancelled) return;
      setBurns([...collected]);
      setDone(true);
    });

    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const inheritedBurns = burns.length;
  const inheritedSacrificed = burns.reduce((s, b) => s + (b.tokenCount || 0), 0);
  const inheritedAp = burns.reduce((s, b) => s + Number(b.totalActions || 0), 0);
  const sample = [...burns]
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 20);

  const progress =
    tokens.length === 0
      ? "no tokens"
      : done
        ? `${completed}/${tokens.length} tokens scanned${failed ? ` · ${failed} failed` : ""}`
        : `scanning ${completed}/${tokens.length}…`;

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-[10px] tracking-widest opacity-60">
        PORTFOLIO HERITAGE
        <span className="ml-2 opacity-70">· {progress}</span>
      </h2>
      <p className="mb-3 text-[10px] opacity-60">
        Burns that were committed by other wallets but whose action points now
        live in this portfolio (because the wallet later acquired the receiver
        Normie). All {tokens.length} owned Normies are scanned — no sampling.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="INHERITED BURNS" value={inheritedBurns} />
        <Stat label="NORMIES SACRIFICED" value={inheritedSacrificed} />
        <Stat label="INHERITED AP" value={inheritedAp} />
      </div>
      {sample.length === 0 ? (
        <div className="bg-on/60 px-3 py-2 text-[11px] opacity-60">
          {done
            ? "none of the owned Normies have received any burns"
            : "fetching heritage data…"}
        </div>
      ) : (
        <ul className="space-y-1 text-[11px]">
          {sample.map((b) => (
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
