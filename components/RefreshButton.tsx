"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { useCity } from "@/lib/store";

// Force-refresh pill in the top bar. Two side-effects:
//   1. SWR mutate(() => true) invalidates every SWR-keyed fetch in the app
//      (StatsTicker, CanvasStatus, Plaza stats, HolderPanel, NormiePanel, …)
//   2. bumpRefresh() in zustand toggles a nonce that LiveDataLoader watches —
//      restarting the burns / transfers / burned-tokens polls so they refire
//      immediately instead of waiting 5-30 s for their next scheduled tick.

const COOLDOWN_MS = 3_000;

export default function RefreshButton() {
  const { mutate } = useSWRConfig();
  const bumpRefresh = useCity((s) => s.bumpRefresh);
  const lastRefreshedAt = useCity((s) => s.lastRefreshedAt);
  const [spinning, setSpinning] = useState(false);
  const [, force] = useState(0);

  // Re-render every 10 s so the "Xs ago" label stays fresh.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      // Invalidate all SWR keys and force a revalidation.
      await mutate(() => true, undefined, { revalidate: true });
    } catch {}
    bumpRefresh();
    setTimeout(() => setSpinning(false), COOLDOWN_MS);
  };

  const ago = ageLabel(Date.now() - lastRefreshedAt);

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={spinning}
      title="Force refresh every live data source (api.normies.art + on-chain transfers)"
      className={
        "flex items-center bg-on px-2.5 py-1.5 text-[10px] tracking-widest transition" +
        " text-off/85 hover:text-off cursor-pointer" +
        (spinning ? " opacity-70" : "")
      }
    >
      <span className={"inline-block " + (spinning ? "animate-spin" : "")}>↻</span>
      <span className="ml-1.5">REFRESH</span>
      <span className="ml-1 opacity-50">· {ago}</span>
    </button>
  );
}

function ageLabel(ms: number): string {
  if (ms < 5_000) return "now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}
