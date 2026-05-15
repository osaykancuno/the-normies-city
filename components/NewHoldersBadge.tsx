"use client";

import { useEffect, useMemo, useState } from "react";
import { useCity } from "@/lib/store";

// Counter pill: how many new holder buildings have risen recently.
//
// The /api/onchain/transfers route scans the last ~24 h of ERC-721 Transfer
// logs (7200 blocks on mainnet); each transfer to a previously-unknown
// address is
// emitted as a `newHolder` ActivityEvent by the store. We collect the unique
// set here and display it as "NEW HOLDERS · N · 24H".
//
// Earlier versions filtered events arriving in the first 5 s of the session as
// "backlog", which had the unintended effect of dropping every event from the
// initial poll — and since transfers are batched, that meant the counter
// stayed at 0 forever. We keep all newHolder events; deduping by address makes
// the count idempotent across re-polls.

export default function NewHoldersBadge() {
  const activity = useCity((s) => s.activity);
  const setSelection = useCity((s) => s.setSelection);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const buildingsByAddress = useCity((s) => s.buildingsByAddress);

  const [seenAddresses, setSeenAddresses] = useState<{ address: string; at: number }[]>([]);
  const [latestPulse, setLatestPulse] = useState(0);

  // Collect every newHolder event emitted by the store. Dedupe by address so
  // re-polls (every 30 s from /api/onchain/transfers) don't inflate the count.
  useEffect(() => {
    setSeenAddresses((prev) => {
      const known = new Set(prev.map((p) => p.address));
      const next = [...prev];
      for (const ev of activity) {
        if (ev.kind !== "newHolder") continue;
        if (known.has(ev.address)) continue;
        known.add(ev.address);
        next.unshift({ address: ev.address, at: ev.receivedAt });
      }
      return next.slice(0, 50); // hold a small ring for the "latest" peek
    });
  }, [activity]);

  // Flash the badge briefly each time the count increments.
  const count = seenAddresses.length;
  useEffect(() => {
    if (count === 0) return;
    setLatestPulse(Date.now());
  }, [count]);
  const pulseActive = Date.now() - latestPulse < 2500;

  const latestAddr = seenAddresses[0]?.address;
  const latestBuilding = useMemo(
    () => (latestAddr ? buildingsByAddress.get(latestAddr) : null),
    [latestAddr, buildingsByAddress]
  );

  const handleClick = () => {
    if (!latestBuilding) return;
    setSelection({ kind: "holder", address: latestBuilding.address });
    setFlyTo({
      x: latestBuilding.x,
      y: latestBuilding.y,
      z: latestBuilding.z,
      size: latestBuilding.height,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!latestBuilding}
      className={
        "flex items-center bg-on px-2.5 py-1.5 text-[10px] tracking-widest transition" +
        (pulseActive
          ? " text-on bg-off"
          : " text-off/85 hover:text-off") +
        (latestBuilding ? " cursor-pointer" : " cursor-default opacity-60")
      }
      title={
        latestBuilding
          ? `Latest new holder: ${latestAddr} — click to fly there`
          : "Watching the chain for new holders…"
      }
    >
      <span className="opacity-60">NEW HOLDERS · </span>
      <span className="ml-1 tabular-nums">{count}</span>
      <span className="ml-1 opacity-50">· 24H</span>
      {pulseActive && <span className="ml-1">◉</span>}
    </button>
  );
}
