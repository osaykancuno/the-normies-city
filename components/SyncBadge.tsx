"use client";

import { useCity } from "@/lib/store";

// Tiny indicator that shows how much of the city has been hydrated from the official
// Normies API. Buildings render only for known holders, so partial sync means a
// smaller city — this badge lets the user see how full the snapshot is.

export default function SyncBadge() {
  const holders = useCity((s) => s.holders);
  const buildings = useCity((s) => s.buildings);

  if (!holders) {
    return (
      <div className="pointer-events-auto bg-on px-2 py-1 text-[10px] tracking-widest text-off/70">
        SYNC · WAITING FOR DATA
      </div>
    );
  }
  const total = holders.byToken.length;
  const known = holders.byToken.filter((a) => a != null).length;
  const pct = ((known / total) * 100).toFixed(1);
  const holderCount = buildings.filter((b) => b.kind === "holder").length;
  const tombstones = buildings.filter((b) => b.kind === "burned").length;

  return (
    <div className="pointer-events-auto bg-on px-2 py-1 text-[10px] tracking-widest text-off/85">
      SYNC · {known}/{total} NORMIES ({pct}%) · {holderCount} HOLDERS · {tombstones} BURNED
    </div>
  );
}
