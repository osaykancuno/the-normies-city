// Global client state. The city is derived from the holders map; every transfer/burn
// event mutates that map and triggers a layout recompute. Newly-born and recently-
// departed holders carry timestamps so the InstancedNormies shader can animate the
// rise / collapse of their building.

import { create } from "zustand";
import type { ActivityEvent, HolderState, NormieCompact } from "./types";
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
    if (!isBurn && !receiverHadBefore && holders.byAddress.has(toLc)) {
      pendingBirths.set(toLc, now);
    }

    set({
      holders: { ...holders },
      ...recompute(holders, burned, pendingBirths, pendingDeaths),
    });
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
