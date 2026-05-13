"use client";

import useSWR from "swr";
import type { CanvasStatus } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CanvasStatusBanner() {
  const { data } = useSWR<CanvasStatus>("/api/canvas-status", fetcher, {
    refreshInterval: 30_000,
  });

  if (!data) {
    return (
      <div className="bg-on/85 text-off px-2 py-1 text-[10px] tracking-widest opacity-60">
        CANVAS · …
      </div>
    );
  }
  const tiers = data.tierThresholds?.join(" / ") || "—";
  return (
    <div className="bg-on text-off px-2 py-1 text-[10px] tracking-widest">
      <span className="opacity-50">CANVAS · </span>
      <span>{data.paused ? "PAUSED" : "LIVE"}</span>
      <span className="opacity-50"> · MAX </span>
      <span>{data.maxBurnPercent}%</span>
      <span className="opacity-50"> · TIERS </span>
      <span>{tiers}</span>
    </div>
  );
}
