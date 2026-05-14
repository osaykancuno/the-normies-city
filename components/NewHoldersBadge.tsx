"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCity } from "@/lib/store";

// Counter pill: how many new holder buildings have risen since the page loaded.
//
// Why "since page load" and not "since midnight": the static snapshot of holders
// can't tell us how many holders joined over an arbitrary time window without an
// upstream history endpoint. What we CAN observe authoritatively is every on-chain
// transfer that arrives via /api/onchain/transfers while the app is open — those
// are the events that mint a new building in the city.
//
// To avoid the backlog (the page-load fetch of the last ~200 blocks could produce
// a handful of "new holders" from minutes ago), we drop the first 5 seconds of
// events from the count.

const BACKLOG_GRACE_MS = 5_000;

export default function NewHoldersBadge() {
  const activity = useCity((s) => s.activity);
  const setSelection = useCity((s) => s.setSelection);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const buildingsByAddress = useCity((s) => s.buildingsByAddress);

  const sessionStartRef = useRef<number>(0);
  const [seenAddresses, setSeenAddresses] = useState<{ address: string; at: number }[]>([]);
  const [latestPulse, setLatestPulse] = useState(0);

  // Capture session start once on mount.
  useEffect(() => {
    sessionStartRef.current = Date.now();
  }, []);

  // Collect newHolder events emitted by the store, after the backlog grace window.
  useEffect(() => {
    const threshold = sessionStartRef.current + BACKLOG_GRACE_MS;
    setSeenAddresses((prev) => {
      const known = new Set(prev.map((p) => p.address));
      const next = [...prev];
      for (const ev of activity) {
        if (ev.kind !== "newHolder") continue;
        if (ev.receivedAt < threshold) continue;
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
      {pulseActive && <span className="ml-1">◉</span>}
    </button>
  );
}
