// Global client state. The city is derived from the holders map; every transfer/burn
// event mutates that map and triggers a layout recompute. Newly-born and recently-
// departed holders carry timestamps so the InstancedNormies shader can animate the
// rise / collapse of their building.

import { create } from "zustand";
import type { ActivityEvent, AwakenedRow, HolderState, NormieCompact } from "./types";
import type { Building, HolderBuilding } from "./layout";
import { computeLayout } from "./layout";

export type Selection =
  | { kind: "holder"; address: string }
  | { kind: "normie"; tokenId: number }
  | { kind: "burned"; tokenId: number }
  | null;

export interface FlyTarget {
  x: number;
  y: number;
  z: number;
  size: number;
  id: number;
}

const LIFECYCLE_S = 1.6; // duration of rise / collapse animations.

// ---------- localStorage persistence for the awakened set ----------
// Keeps the agent layer visible across page reloads, even when the upstream
// /api/agents/snapshot route is down (cold Vercel container + Ponder
// outage). The payload is small (~50 bytes/row × ~500 awakened today ≈ 25
// KB) so we can safely round-trip the entire set through JSON every time
// it changes. Bumped via the `v` field whenever the schema evolves.

const AWAKENED_STORAGE_KEY = "normie-city.awakened.v1";

interface PersistedAwakened {
  v: 1;
  ts: number;
  rows: AwakenedRow[];
}

function loadAwakenedFromStorage(): PersistedAwakened | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AWAKENED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAwakened;
    if (parsed.v !== 1 || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAwakenedToStorage(rows: AwakenedRow[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedAwakened = { v: 1, ts: Date.now(), rows };
    window.localStorage.setItem(AWAKENED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be disabled (private browsing, quota exceeded) —
    // we silently degrade to in-memory only.
  }
}

const AVATAR_STORAGE_KEY = "normie-city.avatar";

function loadAvatarId(): number {
  if (typeof window === "undefined") return randomNormieId();
  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    const n = raw == null ? NaN : Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 9999) return n;
  } catch {
    // ignore
  }
  return randomNormieId();
}

function saveAvatarId(id: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AVATAR_STORAGE_KEY, String(id));
  } catch {
    // ignore
  }
}

function randomNormieId(): number {
  return Math.floor(Math.random() * 10000);
}

function awakenedAgentsToRows(
  agents: Map<number, { agentId: string; name: string; tagline: string }>,
): AwakenedRow[] {
  const rows: AwakenedRow[] = [];
  for (const [tokenId, meta] of agents) {
    rows.push({
      tokenId,
      agentId: meta.agentId,
      name: meta.name,
      tagline: meta.tagline,
    });
  }
  return rows;
}

interface CityState {
  traits: (NormieCompact | null)[] | null;
  holders: HolderState | null;
  burned: Set<number>;
  buildings: Building[];
  buildingsByAddress: Map<string, HolderBuilding>;
  /** Address → time (seconds, Date.now() basis) when the holder became a holder. */
  pendingBirths: Map<string, number>;
  /** Address → snapshot of the holder's last building + collapse time. */
  pendingDeaths: Map<string, { building: HolderBuilding; dyingAt: number }>;
  selection: Selection;
  activity: ActivityEvent[];
  flyTo: FlyTarget | null;
  hoveredIndex: number | null;
  bannerOpen: boolean;
  arenaOpen: boolean;
  /** Monotonic counter — bumping it tells LiveDataLoader to refetch immediately
   *  instead of waiting for the next scheduled poll. */
  refreshNonce: number;
  /** Last time a refresh was triggered (epoch ms). Used by the header button to
   *  show "Xs ago" so the user knows the data is fresh. */
  lastRefreshedAt: number;

  // ---------- ERC-8004 agent layer ----------
  /** Token IDs that have been bound to an ERC-8004 agent identity. */
  awakenedSet: Set<number>;
  /** TokenId → {agentId, name, tagline} for awakened Normies (from snapshot). */
  awakenedAgents: Map<number, { agentId: string; name: string; tagline: string }>;
  /** Lowercased persona name → tokenId, for SearchBar name lookup. */
  nameIndex: Map<string, number>;
  /** When true, dormant towers are dithered and awakened ones intensified. */
  agentMode: boolean;
  /** Bumped on every awakened-set change — used as a primitive dep in
   *  InstancedNormies/AwakenedAntennas so they rebuild instance buffers
   *  without having to subscribe to the Set/Map references. */
  awakenedVersion: number;

  setAwakenedSnapshot: (rows: AwakenedRow[]) => void;
  markAwakened: (row: AwakenedRow) => void;
  setAgentMode: (on: boolean) => void;
  /** Rehydrate the awakened slices from localStorage. Called from
   *  LiveDataLoader before the first /api/agents/snapshot poll so the city
   *  shows last-known-good data even when upstream Ponder is down and the
   *  Vercel container is cold (no server-side cache). */
  hydrateAwakenedFromStorage: () => void;

  // ---------- camera / exploration ----------
  /** Active camera scheme. "orbit" (default) and "fly" are the original
   *  third-person diorama views; "walk" is the first-person street-level
   *  explorer. Promoted from local CameraControls state so the toggle pill,
   *  the HUD, and the controls all read one source of truth. */
  viewMode: "orbit" | "fly" | "walk";
  setViewMode: (mode: "orbit" | "fly" | "walk") => void;
  /** Normie ID the visitor "wears" as their avatar in walk mode (phase 2
   *  presence). Persisted to localStorage; defaults to a random id. */
  avatarNormieId: number;
  setAvatarNormieId: (id: number) => void;

  setTraits: (traits: (NormieCompact | null)[]) => void;
  setHolders: (byToken: (string | null)[]) => void;
  setBurned: (burned: Set<number>) => void;
  applyTransfer: (tokenId: number, from: string, to: string) => void;
  applyBurns: (tokenIds: number[]) => void;
  /** Reconcile a holder's portfolio against authoritative data fetched live from
   *  api.normies.art. Catches drift between the static snapshot and the chain
   *  state (e.g. transfers that happened before the page opened). */
  reconcileHolder: (address: string, apiTokenIds: number[]) => void;
  setSelection: (sel: Selection) => void;
  pushActivity: (event: ActivityEvent) => void;
  setFlyTo: (target: Omit<FlyTarget, "id"> | null) => void;
  setHovered: (index: number | null) => void;
  setBannerOpen: (open: boolean) => void;
  setArenaOpen: (open: boolean) => void;
  /** Force the live data layer (polls + SWR) to refetch right now. */
  bumpRefresh: () => void;
  /** Prune expired lifecycle entries — invoked on a recurring tick from the city. */
  tickLifecycle: () => void;
}

function indexByAddress(byToken: (string | null)[]): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (let id = 0; id < byToken.length; id++) {
    const addr = byToken[id];
    if (!addr) continue;
    const a = addr.toLowerCase();
    let s = idx.get(a);
    if (!s) {
      s = new Set();
      idx.set(a, s);
    }
    s.add(id);
  }
  return idx;
}

function recompute(
  holders: HolderState,
  burned: Set<number>,
  pendingBirths: Map<string, number>,
  pendingDeaths: Map<string, { building: HolderBuilding; dyingAt: number }>
) {
  const fresh = computeLayout({ holders, burned });

  // Stamp spawnedAt on newly-born holders so the shader animates their rise.
  for (const b of fresh.buildings) {
    if (b.kind === "holder") {
      const t = pendingBirths.get(b.address);
      if (t != null) b.spawnedAt = t;
    }
  }

  // Append still-collapsing buildings (addresses that have left the holders map but
  // whose collapse animation hasn't finished yet).
  for (const [addr, info] of pendingDeaths) {
    if (!fresh.buildingsByAddress.has(addr)) {
      fresh.buildings.push({ ...info.building, dyingAt: info.dyingAt });
    }
  }

  return {
    buildings: fresh.buildings,
    buildingsByAddress: fresh.buildingsByAddress,
  };
}

export const useCity = create<CityState>((set, get) => ({
  traits: null,
  holders: null,
  burned: new Set(),
  buildings: [],
  buildingsByAddress: new Map(),
  pendingBirths: new Map(),
  pendingDeaths: new Map(),
  selection: null,
  activity: [],
  flyTo: null,
  hoveredIndex: null,
  bannerOpen: false,
  arenaOpen: false,
  refreshNonce: 0,
  lastRefreshedAt: Date.now(),

  awakenedSet: new Set(),
  awakenedAgents: new Map(),
  nameIndex: new Map(),
  agentMode: false,
  awakenedVersion: 0,

  viewMode: "orbit",
  setViewMode: (mode) => set({ viewMode: mode }),
  avatarNormieId: loadAvatarId(),
  setAvatarNormieId: (id) => {
    const clamped = Number.isInteger(id) && id >= 0 && id <= 9999 ? id : 0;
    saveAvatarId(clamped);
    set({ avatarNormieId: clamped });
  },

  setAwakenedSnapshot: (rows) => {
    const set_ = new Set<number>();
    const agents = new Map<number, { agentId: string; name: string; tagline: string }>();
    const names = new Map<string, number>();
    for (const r of rows) {
      set_.add(r.tokenId);
      agents.set(r.tokenId, { agentId: r.agentId, name: r.name, tagline: r.tagline });
      if (r.name) names.set(r.name.toLowerCase(), r.tokenId);
    }
    set((s) => ({
      awakenedSet: set_,
      awakenedAgents: agents,
      nameIndex: names,
      awakenedVersion: s.awakenedVersion + 1,
    }));
    // Write-through to localStorage so a future cold-start reload survives
    // a Ponder outage with the same data the user just saw.
    saveAwakenedToStorage(rows);
  },

  markAwakened: (row) => {
    set((s) => {
      const prior = s.awakenedAgents.get(row.tokenId);
      const isNew = !s.awakenedSet.has(row.tokenId);
      // Skip the update only if both the token is already known AND the
      // existing entry already carries a name (re-hydration would be a no-op).
      // This lets late name resolution from /api/agents/[id] flow through
      // for tokens originally added without a name from /agents/list.
      if (!isNew && prior?.name) return {};
      const set_ = new Set(s.awakenedSet);
      set_.add(row.tokenId);
      const agents = new Map(s.awakenedAgents);
      agents.set(row.tokenId, {
        agentId: row.agentId || prior?.agentId || "",
        name: row.name,
        tagline: row.tagline,
      });
      const names = new Map(s.nameIndex);
      if (row.name) names.set(row.name.toLowerCase(), row.tokenId);
      return {
        awakenedSet: set_,
        awakenedAgents: agents,
        nameIndex: names,
        // Only bump the version (which triggers shader/antenna rebuild) when
        // the awakening is genuinely new — a late name hydration shouldn't
        // force a full instance buffer re-upload.
        awakenedVersion: isNew ? s.awakenedVersion + 1 : s.awakenedVersion,
      };
    });
    // Persist the updated set — single-row write-through. We serialise the
    // current map after the set call rather than re-reading state inside
    // the writer (avoids races) by recomputing from the inputs.
    const refreshed = get();
    saveAwakenedToStorage(awakenedAgentsToRows(refreshed.awakenedAgents));
  },

  setAgentMode: (on) => set({ agentMode: on }),

  hydrateAwakenedFromStorage: () => {
    const stored = loadAwakenedFromStorage();
    if (!stored || stored.rows.length === 0) return;
    const { awakenedSet } = get();
    // Skip if the live state is already richer than what we have on disk —
    // we don't want to overwrite a freshly-fetched snapshot with a stale
    // localStorage copy after a successful poll.
    if (awakenedSet.size >= stored.rows.length) return;
    const set_ = new Set<number>();
    const agents = new Map<number, { agentId: string; name: string; tagline: string }>();
    const names = new Map<string, number>();
    for (const r of stored.rows) {
      set_.add(r.tokenId);
      agents.set(r.tokenId, { agentId: r.agentId, name: r.name, tagline: r.tagline });
      if (r.name) names.set(r.name.toLowerCase(), r.tokenId);
    }
    set((s) => ({
      awakenedSet: set_,
      awakenedAgents: agents,
      nameIndex: names,
      awakenedVersion: s.awakenedVersion + 1,
    }));
  },

  setTraits: (traits) => set({ traits }),

  setHolders: (byToken) => {
    const holders: HolderState = { byToken, byAddress: indexByAddress(byToken) };
    const { burned, pendingBirths, pendingDeaths } = get();
    set({ holders, ...recompute(holders, burned, pendingBirths, pendingDeaths) });
  },

  setBurned: (burned) => {
    const { holders, pendingBirths, pendingDeaths } = get();
    if (!holders) {
      set({ burned });
      return;
    }
    set({ burned, ...recompute(holders, burned, pendingBirths, pendingDeaths) });
  },

  applyTransfer: (tokenId, from, to) => {
    const state = get();
    const { holders, burned, pendingBirths, pendingDeaths, buildingsByAddress } = state;
    if (!holders) return;
    const fromLc = from.toLowerCase();
    const toLc = to.toLowerCase();
    if (fromLc === toLc) return;
    const isMint = fromLc === "0x0000000000000000000000000000000000000000";
    const isBurn = toLc === "0x0000000000000000000000000000000000000000";
    const now = Date.now() / 1000;

    const senderHadBefore = !isMint && holders.byAddress.has(fromLc);
    const receiverHadBefore = !isBurn && holders.byAddress.has(toLc);

    // Snapshot the sender's current building before mutation, in case they vanish.
    const senderSnapshot = senderHadBefore ? buildingsByAddress.get(fromLc) : null;

    // Mutate the holders map.
    holders.byToken[tokenId] = isBurn ? null : toLc;
    if (!isMint) {
      const fromSet = holders.byAddress.get(fromLc);
      if (fromSet) {
        fromSet.delete(tokenId);
        if (fromSet.size === 0) holders.byAddress.delete(fromLc);
      }
    }
    if (!isBurn) {
      let toSet = holders.byAddress.get(toLc);
      if (!toSet) {
        toSet = new Set();
        holders.byAddress.set(toLc, toSet);
      }
      toSet.add(tokenId);
    }

    // Lifecycle bookkeeping.
    if (senderHadBefore && !holders.byAddress.has(fromLc) && senderSnapshot) {
      pendingDeaths.set(fromLc, { building: senderSnapshot, dyingAt: now });
    }
    let newHolderJoined = false;
    if (!isBurn && !receiverHadBefore && holders.byAddress.has(toLc)) {
      pendingBirths.set(toLc, now);
      newHolderJoined = true;
    }

    set({
      holders: { ...holders },
      ...recompute(holders, burned, pendingBirths, pendingDeaths),
    });

    // Surface the welcome event AFTER the layout recompute so ActivityEffects can
    // find the new building when it processes the event next frame.
    if (newHolderJoined) {
      const ev: ActivityEvent = {
        kind: "newHolder",
        address: toLc,
        tokenId,
        receivedAt: Date.now(),
      };
      set((s) => ({ activity: [ev, ...s.activity].slice(0, 80) }));
    }
  },

  applyBurns: (tokenIds) => {
    const state = get();
    const { holders, burned, pendingBirths, pendingDeaths, buildingsByAddress } = state;
    const newBurned = new Set(burned);
    for (const id of tokenIds) newBurned.add(id);
    if (!holders) {
      set({ burned: newBurned });
      return;
    }
    const now = Date.now() / 1000;
    for (const id of tokenIds) {
      const cur = holders.byToken[id];
      if (cur) {
        const lc = cur.toLowerCase();
        const s = holders.byAddress.get(lc);
        if (s) {
          const beforeSize = s.size;
          s.delete(id);
          if (s.size === 0) {
            holders.byAddress.delete(lc);
            // Holder just lost their last NFT — collapse their building.
            const snapshot = buildingsByAddress.get(lc);
            if (snapshot && beforeSize > 0) {
              pendingDeaths.set(lc, { building: snapshot, dyingAt: now });
            }
          }
        }
      }
      holders.byToken[id] = null;
    }
    set({
      holders: { ...holders },
      burned: newBurned,
      ...recompute(holders, newBurned, pendingBirths, pendingDeaths),
    });
  },

  reconcileHolder: (address, apiTokenIds) => {
    const state = get();
    const { holders, burned, pendingBirths, pendingDeaths } = state;
    if (!holders) return;
    const lc = address.toLowerCase();
    const current = holders.byAddress.get(lc) ?? new Set<number>();
    const apiSet = new Set<number>(apiTokenIds);

    // Drift detection: any token id we list under this address that isn't in the
    // live response → the holder no longer owns it. Conversely any id in the API
    // that isn't in our state → assign it to this wallet.
    const remove: number[] = [];
    for (const id of current) if (!apiSet.has(id)) remove.push(id);
    const add: number[] = [];
    for (const id of apiTokenIds) {
      if (!current.has(id) && id >= 0 && id < holders.byToken.length) add.push(id);
    }
    if (remove.length === 0 && add.length === 0) return;

    // Apply removals — we don't know the new owner; the next /api/holder of *that*
    // wallet (or the next transfer poll) will rehome the token. For now strip it.
    for (const id of remove) {
      current.delete(id);
      if (holders.byToken[id] === lc) holders.byToken[id] = null;
    }
    if (current.size === 0) holders.byAddress.delete(lc);

    // Apply additions — claim them under this wallet, removing them from any prior
    // owner we had on record.
    if (add.length > 0) {
      let bucket = holders.byAddress.get(lc);
      if (!bucket) {
        bucket = new Set();
        holders.byAddress.set(lc, bucket);
      }
      for (const id of add) {
        const prior = holders.byToken[id];
        if (prior && prior !== lc) {
          const priorSet = holders.byAddress.get(prior);
          if (priorSet) {
            priorSet.delete(id);
            if (priorSet.size === 0) holders.byAddress.delete(prior);
          }
        }
        holders.byToken[id] = lc;
        bucket.add(id);
      }
    }

    set({
      holders: { ...holders },
      ...recompute(holders, burned, pendingBirths, pendingDeaths),
    });
  },

  setSelection: (sel) => set({ selection: sel }),
  pushActivity: (event) =>
    set((s) => ({ activity: [event, ...s.activity].slice(0, 80) })),
  setFlyTo: (target) =>
    set((s) => ({ flyTo: target ? { ...target, id: (s.flyTo?.id ?? 0) + 1 } : null })),
  setHovered: (index) => set({ hoveredIndex: index }),
  setBannerOpen: (open) => set({ bannerOpen: open }),
  setArenaOpen: (open) => set({ arenaOpen: open }),
  bumpRefresh: () =>
    set((s) => ({ refreshNonce: s.refreshNonce + 1, lastRefreshedAt: Date.now() })),

  tickLifecycle: () => {
    const { pendingBirths, pendingDeaths, holders, burned } = get();
    const now = Date.now() / 1000;
    let mutated = false;
    for (const [k, t] of pendingBirths) {
      if (now - t > LIFECYCLE_S + 0.1) {
        pendingBirths.delete(k);
        mutated = true;
      }
    }
    for (const [k, info] of pendingDeaths) {
      if (now - info.dyingAt > LIFECYCLE_S + 0.1) {
        pendingDeaths.delete(k);
        mutated = true;
      }
    }
    if (mutated && holders) {
      set(recompute(holders, burned, pendingBirths, pendingDeaths));
    }
  },
}));
