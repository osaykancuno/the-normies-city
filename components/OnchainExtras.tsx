"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useCity } from "@/lib/store";
import type { HistoryStats } from "@/lib/types";

// Loads the "extra" on-chain layers that aren't on the hot path: the Legendary
// Canvas roster, the live zombie set, and the indexer summary stats. Writes them
// into the store so Monuments / MiniMap / HUD / agent answers can read them.
// Renders nothing. Resilient by design — the API routes degrade to empty/stale.

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function OnchainExtras() {
  const setLegendary = useCity((s) => s.setLegendary);
  const setZombies = useCity((s) => s.setZombies);
  const setHistoryStats = useCity((s) => s.setHistoryStats);
  const setMarket = useCity((s) => s.setMarket);

  const { data: legendary } = useSWR<{ items: { tokenId: number; artist: string }[] }>(
    "/api/legendary",
    fetcher,
    { refreshInterval: 120_000 },
  );
  const { data: zombies } = useSWR<{ ids: number[] }>("/api/zombies", fetcher, {
    refreshInterval: 60_000,
  });
  const { data: stats } = useSWR<HistoryStats>("/api/stats", fetcher, {
    refreshInterval: 30_000,
  });
  const { data: market } = useSWR<{
    floorPrice: number | null;
    listed: number | null;
    openseaConnected: boolean;
    items: { id: number; priceEth: number | null }[];
  }>("/api/market", fetcher, { refreshInterval: 60_000 });

  useEffect(() => {
    if (legendary?.items) setLegendary(legendary.items);
  }, [legendary, setLegendary]);
  useEffect(() => {
    if (zombies?.ids) setZombies(zombies.ids);
  }, [zombies, setZombies]);
  useEffect(() => {
    if (stats) setHistoryStats(stats);
  }, [stats, setHistoryStats]);
  useEffect(() => {
    if (market) {
      setMarket(
        {
          floor: market.floorPrice ?? null,
          listed: market.listed ?? null,
          openseaConnected: market.openseaConnected,
        },
        market.items ?? [],
      );
    }
  }, [market, setMarket]);

  return null;
}
