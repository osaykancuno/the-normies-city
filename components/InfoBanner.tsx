"use client";

import useSWR from "swr";
import { useCity } from "@/lib/store";
import type { ActivityEvent, CanvasStatus, HistoryStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Full-page info modal triggered by clicking the plaza monument. Mirrors the type of
// readouts on https://rarity.normies.art/ — the city's "city hall".

export default function InfoBanner() {
  const open = useCity((s) => s.bannerOpen);
  const setBannerOpen = useCity((s) => s.setBannerOpen);
  const buildings = useCity((s) => s.buildings);
  const holders = useCity((s) => s.holders);
  const burned = useCity((s) => s.burned);
  const activity = useCity((s) => s.activity);
  const setSelection = useCity((s) => s.setSelection);
  const setFlyTo = useCity((s) => s.setFlyTo);

  const { data: stats } = useSWR<HistoryStats>(open ? "/api/stats" : null, fetcher, {
    refreshInterval: 10_000,
  });
  const { data: canvas } = useSWR<CanvasStatus>(open ? "/api/canvas-status" : null, fetcher, {
    refreshInterval: 30_000,
  });

  if (!open) return null;

  const totalHolders = buildings.filter((b) => b.kind === "holder").length;
  const totalKnownTokens = holders ? holders.byToken.filter((a) => a != null).length : 0;
  const totalAccountedTokens = totalKnownTokens + burned.size;
  const syncPct = ((totalKnownTokens / 10000) * 100).toFixed(1);

  const topHolders = buildings
    .filter((b) => b.kind === "holder")
    .slice(0, 10) as Extract<(typeof buildings)[number], { kind: "holder" }>[];

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-ink/85 p-4"
      onClick={() => setBannerOpen(false)}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto bg-on text-off"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-off/15 px-6 py-4">
          <div>
            <div className="text-xs tracking-widest opacity-60">CITY HALL</div>
            <h1 className="text-2xl tracking-widest">THE NORMIES CITY</h1>
          </div>
          <button
            className="bg-off px-3 py-1 text-[10px] tracking-widest text-on hover:bg-off/80"
            onClick={() => setBannerOpen(false)}
          >
            CLOSE ✕
          </button>
        </header>

        <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-[10px] tracking-widest opacity-60">GLOBAL STATS</h2>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="HOLDERS" value={totalHolders} />
              <Stat label="SYNCED" value={`${totalKnownTokens}/10000 (${syncPct}%)`} />
              <Stat label="ACCOUNTED FOR" value={totalAccountedTokens} />
              <Stat label="BURN COMMITS" value={stats?.totalBurnCommitments ?? "—"} />
              <Stat label="TOKENS BURNED" value={stats?.totalBurnedTokens ?? "—"} />
              <Stat label="TRANSFORMS" value={stats?.totalTransforms ?? "—"} />
              <Stat
                label="ACTION POINTS"
                value={stats?.totalActionPointsDistributed ?? "—"}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] tracking-widest opacity-60">CANVAS STATE</h2>
            {canvas ? (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="STATUS" value={canvas.paused ? "PAUSED" : "LIVE"} />
                <Stat label="MAX BURN" value={`${canvas.maxBurnPercent}%`} />
                <Stat
                  label="TIER THRESHOLDS"
                  value={canvas.tierThresholds?.join(" / ") ?? "—"}
                />
                <Stat
                  label="TIER MIN %"
                  value={canvas.tierMinPercents?.join(" / ") ?? "—"}
                />
              </div>
            ) : (
              <div className="bg-ink/40 px-3 py-2 text-[11px] opacity-60">loading…</div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[10px] tracking-widest opacity-60">TOP HOLDERS</h2>
            {topHolders.length === 0 ? (
              <div className="bg-ink/40 px-3 py-2 text-[11px] opacity-60">
                no data yet — waiting for sync
              </div>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {topHolders.map((b) => (
                  <li key={b.address}>
                    <button
                      className="grid w-full grid-cols-[40px_1fr_60px] items-center gap-2 bg-ink/40 px-2 py-1 text-left hover:bg-ink/70"
                      onClick={() => {
                        setSelection({ kind: "holder", address: b.address });
                        setFlyTo({ x: b.x, y: b.y, z: b.z, size: b.height });
                        setBannerOpen(false);
                      }}
                    >
                      <span className="opacity-50">#{b.rank + 1}</span>
                      <span className="truncate">{short(b.address)}</span>
                      <span className="tabular-nums">{b.tokenIds.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[10px] tracking-widest opacity-60">RECENT ACTIVITY</h2>
            {activity.length === 0 ? (
              <div className="bg-ink/40 px-3 py-2 text-[11px] opacity-60">
                no events yet
              </div>
            ) : (
              <ul className="max-h-[280px] space-y-1 overflow-y-auto text-[11px]">
                {activity.slice(0, 30).map((ev, i) => (
                  <ActivityRow
                    key={i}
                    event={ev}
                    onNormie={(id) => {
                      setSelection({ kind: "normie", tokenId: id });
                      setBannerOpen(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="border-t border-off/15 px-6 py-3 text-[10px] tracking-wider opacity-60">
          live from{" "}
          <a className="underline" href="https://api.normies.art/" target="_blank" rel="noreferrer">
            api.normies.art
          </a>
          {" · "}
          <a className="underline" href="https://rarity.normies.art/" target="_blank" rel="noreferrer">
            rarity.normies.art
          </a>
          {" · contract "}
          <a
            className="underline"
            href="https://etherscan.io/address/0x9Eb6E2025B64f340691e424b7fe7022fFDE12438"
            target="_blank"
            rel="noreferrer"
          >
            0x9435…87fd4
          </a>
        </footer>
      </div>
    </div>
  );
}

function ActivityRow({
  event,
  onNormie,
}: {
  event: ActivityEvent;
  onNormie: (id: number) => void;
}) {
  if (event.kind === "burn") {
    const id = Number(event.commit.receiverTokenId);
    return (
      <li className="grid grid-cols-[60px_1fr_60px] items-center gap-2 bg-ink/40 px-2 py-1">
        <span className="opacity-70">[×] BURN</span>
        <button className="text-left underline" onClick={() => onNormie(id)}>
          {event.commit.tokenCount} → #{id}
        </button>
        <span className="opacity-60 tabular-nums">{event.commit.totalActions} AP</span>
      </li>
    );
  }
  if (event.kind === "transform") {
    return (
      <li className="grid grid-cols-[60px_1fr_60px] items-center gap-2 bg-ink/40 px-2 py-1">
        <span className="opacity-70">[▢] XFORM</span>
        <button className="text-left underline" onClick={() => onNormie(event.tokenId)}>
          #{event.tokenId}
        </button>
        <span className="opacity-60 tabular-nums">v?</span>
      </li>
    );
  }
  if (event.kind === "newHolder") {
    return (
      <li className="grid grid-cols-[60px_1fr_60px] items-center gap-2 bg-ink/40 px-2 py-1">
        <span className="opacity-70">[★] JOIN</span>
        <button className="text-left underline" onClick={() => onNormie(event.tokenId)}>
          {short(event.address)} · #{event.tokenId}
        </button>
        <span className="opacity-60">new</span>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[60px_1fr_60px] items-center gap-2 bg-ink/40 px-2 py-1">
      <span className="opacity-70">[→] MOVE</span>
      <button className="text-left underline" onClick={() => onNormie(event.tokenId)}>
        #{event.tokenId} → {short(event.to)}
      </button>
      <span className="opacity-60">tx</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-ink/40 px-3 py-2">
      <div className="text-[9px] tracking-widest opacity-50">{label}</div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  );
}

function short(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
