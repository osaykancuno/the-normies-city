"use client";

import { useCity } from "@/lib/store";

// Sync stats pill, rendered as part of the unified top bar. Pure data from store.
export default function SyncBadge() {
  const holders = useCity((s) => s.holders);
  const burned = useCity((s) => s.burned);
  const buildings = useCity((s) => s.buildings);

  if (!holders) {
    return (
      <div className="bg-on px-2.5 py-1.5 text-[10px] tracking-widest text-off/70">
        SYNC · WAITING…
      </div>
    );
  }
  const total = holders.byToken.length;
  const knownHeld = holders.byToken.filter((a) => a != null).length;
  const burnedCount = burned.size;
  const accounted = Math.min(total, knownHeld + burnedCount);
  const pct = ((accounted / total) * 100).toFixed(1);
  const holderCount = buildings.filter((b) => b.kind === "holder").length;

  return (
    <div className="bg-on px-2.5 py-1.5 text-[10px] tracking-widest text-off/85">
      <span className="opacity-50">SYNC </span>
      <span>{accounted}/{total}</span>
      <span className="opacity-50"> · </span>
      <span>{knownHeld} LIVE</span>
      <span className="opacity-50"> · </span>
      <span>{holderCount} HOLDERS</span>
      <span className="opacity-50"> · </span>
      <span>{burnedCount} BURNED</span>
      <span className="opacity-50"> ({pct}%)</span>
    </div>
  );
}
