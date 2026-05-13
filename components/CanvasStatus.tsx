"use client";

import useSWR from "swr";
import type { CanvasStatus } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Canvas state pill rendered inline in the unified top bar.
export default function CanvasStatusBanner() {
  const { data } = useSWR<CanvasStatus>("/api/canvas-status", fetcher, {
    refreshInterval: 30_000,
  });

  if (!data) {
    return (
      <div className="bg-on px-2.5 py-1.5 text-[10px] tracking-widest text-off/60">
        CANVAS · …
      </div>
    );
  }
  const tiers = data.tierThresholds?.join("/") || "—";
  return (
    <div className="bg-on px-2.5 py-1.5 text-[10px] tracking-widest text-off/85">
      <span className="opacity-50">CANVAS · </span>
      <span>{data.paused ? "PAUSED" : "LIVE"}</span>
      <span className="opacity-50"> · MAX </span>
      <span>{data.maxBurnPercent}%</span>
      <span className="opacity-50"> · TIERS </span>
      <span>{tiers}</span>
    </div>
  );
}
