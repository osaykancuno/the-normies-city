"use client";

import { useCity } from "@/lib/store";

// Tiny indicator that summarises the city snapshot health: how many on-chain tokens
// we've hydrated, how many wallets that resolves to, and how many have been burned.
// All numbers are derived from real state — never invented.

export default function SyncBadge() {
  const holders = useCity((s) => s.holders);
  const burned = useCity((s) => s.burned);
  const buildings = useCity((s) => s.buildings);

  if (!holders) {
    return (
      <div className="pointer-events-auto bg-on px-2 py-1 text-[10px] tracking-widest text-off/70">
        SYNC · WAITING FOR DATA
      </div>
    );
  }
  const total = holders.byToken.length;
  // "known" = tokens whose owner we know (post-snapshot, post-burn-filter). Burned
  // tokens are explicitly null in byToken, so they don't double-count.
  const knownHeld = holders.byToken.filter((a) => a != null).length;
  const burnedCount = burned.size;
  const accounted = knownHeld + burnedCount;
  const pct = ((accounted / total) * 100).toFixed(1);
  const holderCount = buildings.filter((b) => b.kind === "holder").length;

  return (
    <div className="pointer-events-auto bg-on px-2 py-1 text-[10px] tracking-widest text-off/85">
      SYNC · {accounted}/{total} ACCOUNTED ({pct}%) · {knownHeld} LIVE · {holderCount} HOLDERS · {burnedCount} BURNED
    </div>
  );
}
