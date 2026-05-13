"use client";

import useSWR from "swr";
import type { HistoryStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function StatsTicker() {
  const { data } = useSWR<HistoryStats>("/api/stats", fetcher, {
    refreshInterval: 15_000,
  });

  return (
    <div className="pointer-events-auto flex gap-1 text-[10px] tracking-wide">
      <Stat label="BURN COMMITS" value={data?.totalBurnCommitments} />
      <Stat label="TOKENS BURNED" value={data?.totalBurnedTokens} />
      <Stat label="TRANSFORMS" value={data?.totalTransforms} />
      <Stat label="ACTION POINTS" value={data?.totalActionPointsDistributed} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="bg-on text-off min-w-[108px] px-2.5 py-1.5">
      <div className="opacity-50">{label}</div>
      <div className="text-sm tabular-nums">{value != null ? String(value) : "—"}</div>
    </div>
  );
}
