"use client";

import { useEffect } from "react";
import { useCity } from "@/lib/store";
import type { AwakenedRow, BurnCommit } from "@/lib/types";

// Tight polling cadences keep the city near real-time without exceeding the
// upstream rate limit (each route handler caches at the edge for ~revalidate seconds).
//
//   burn commits        5s  → emits burn + (when revealed) transform events
//   ERC-1155 transfers  12s → mutates holder map + emits transfer events
//   burned tokens diff  30s → mutates holder map (removes burned tokens from owners)
//   awakening snapshot  45s → mutates awakenedSet + emits awakened events

const BURNS_INTERVAL_MS = 5_000;
const TRANSFERS_INTERVAL_MS = 12_000;
const BURNED_INTERVAL_MS = 30_000;
const AWAKENED_INTERVAL_MS = 45_000;

export default function LiveDataLoader() {
  const pushActivity = useCity((s) => s.pushActivity);
  const applyTransfer = useCity((s) => s.applyTransfer);
  const applyBurns = useCity((s) => s.applyBurns);
  const setAwakenedSnapshot = useCity((s) => s.setAwakenedSnapshot);
  const markAwakened = useCity((s) => s.markAwakened);
  // Bumping this nonce from the header refresh button restarts the polls so the
  // user gets fresh data immediately instead of waiting up to 30 s.
  const refreshNonce = useCity((s) => s.refreshNonce);

  // Burn commits + derived transform events.
  useEffect(() => {
    const seenBurns = new Set<string>();
    const seenTransforms = new Set<string>();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/burns");
        if (res.ok) {
          const burns: BurnCommit[] = await res.json();
          for (const commit of [...burns].reverse()) {
            if (!seenBurns.has(commit.commitId)) {
              seenBurns.add(commit.commitId);
              pushActivity({ kind: "burn", commit, receivedAt: Date.now() });
            }
            if (commit.revealed && !seenTransforms.has(commit.commitId)) {
              seenTransforms.add(commit.commitId);
              pushActivity({
                kind: "transform",
                tokenId: Number(commit.receiverTokenId),
                commitId: commit.commitId,
                receivedAt: Date.now(),
              });
            }
          }
        }
      } catch {}
      if (!stopped) timer = setTimeout(tick, BURNS_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [pushActivity, refreshNonce]);

  // ERC-1155 transfers — mutate holder map + emit transfer events.
  useEffect(() => {
    const seen = new Set<string>();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/onchain/transfers");
        if (res.ok) {
          const list: Array<{
            tokenId: number;
            from: string;
            to: string;
            txHash: string;
          }> = await res.json();
          for (const t of [...list].reverse()) {
            const key = `${t.txHash}:${t.tokenId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            applyTransfer(t.tokenId, t.from, t.to);
            pushActivity({ kind: "transfer", ...t, receivedAt: Date.now() });
          }
        }
      } catch {}
      if (!stopped) timer = setTimeout(tick, TRANSFERS_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyTransfer, pushActivity, refreshNonce]);

  // Burned-tokens diff — authoritative source for which IDs have been destroyed.
  useEffect(() => {
    const seenBurned = new Set<number>();
    let bootstrapped = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/burned-tokens");
        if (res.ok) {
          const ids: number[] = await res.json();
          const fresh: number[] = [];
          for (const id of ids) {
            if (!seenBurned.has(id)) {
              seenBurned.add(id);
              if (bootstrapped) fresh.push(id);
            }
          }
          // First poll bootstraps the "already-burned" baseline without re-running the
          // mutation (that's already handled by setBurned in City.tsx via /api/burned-tokens).
          if (bootstrapped && fresh.length > 0) applyBurns(fresh);
          bootstrapped = true;
        }
      } catch {}
      if (!stopped) timer = setTimeout(tick, BURNED_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyBurns, refreshNonce]);

  // ERC-8004 agent awakening snapshot — full collection scan, but lightweight
  // because the upstream batch endpoint returns only awakened entries. First
  // tick seeds the set silently; subsequent ticks emit one `awakened` event
  // per newly-bound Normie.
  useEffect(() => {
    const seen = new Set<number>();
    let bootstrapped = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/agents/snapshot", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { awakened: AwakenedRow[] };
          const rows = Array.isArray(data.awakened) ? data.awakened : [];
          if (!bootstrapped) {
            setAwakenedSnapshot(rows);
            for (const r of rows) seen.add(r.tokenId);
            bootstrapped = true;
          } else {
            for (const r of rows) {
              if (seen.has(r.tokenId)) continue;
              seen.add(r.tokenId);
              // The snapshot only carries a name for the 100 most-recent
              // awakenings (names harvested from /agents/list). For older
              // ones we'd get the name later via the AwakenedPanel SWR — but
              // a brand-new awakening detected by this diff is, by
              // definition, recent, so a name SHOULD usually already be in
              // r. If it's missing (e.g. between two /agents/list refreshes
              // upstream) we lazily fetch it before pushing the activity
              // event so the feed row shows the persona name instead of
              // just the tokenId.
              const handle = (named: { name: string; tagline: string }) => {
                const final = { ...r, ...named };
                markAwakened(final);
                pushActivity({
                  kind: "awakened",
                  tokenId: final.tokenId,
                  agentId: final.agentId,
                  name: final.name,
                  receivedAt: Date.now(),
                });
              };
              if (r.name) {
                handle({ name: r.name, tagline: r.tagline });
              } else {
                fetch(`/api/agents/${r.tokenId}`)
                  .then((res) => (res.ok ? res.json() : null))
                  .then((info) =>
                    handle({
                      name: info?.name ?? "",
                      tagline: info?.tagline ?? "",
                    }),
                  )
                  .catch(() => handle({ name: "", tagline: "" }));
              }
            }
          }
        }
      } catch {}
      if (!stopped) timer = setTimeout(tick, AWAKENED_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [setAwakenedSnapshot, markAwakened, pushActivity, refreshNonce]);

  return null;
}
