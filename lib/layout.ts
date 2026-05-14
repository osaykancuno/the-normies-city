// Holder-based city layout. Each building represents one Ethereum address that owns
// at least one un-burned Normie; the building's height + footprint scale with the
// portfolio size. Burned tokens live in a graveyard ring outside the city. Layout is
// recomputed any time the holder state mutates (transfer/burn).

import type { HolderState } from "./types";

export type Building = HolderBuilding | BurnedBuilding;

/** Lifecycle hooks used to animate the rise/collapse of a building. Both timestamps
 *  are in performance-time seconds. `spawnedAt` triggers a rise from scale 0; `dyingAt`
 *  triggers a collapse to scale 0. A dying building stays in the array until its
 *  collapse animation completes (~1.6s) so the user sees the demolition. */
export interface BuildingLifecycle {
  spawnedAt?: number;
  dyingAt?: number;
}

export interface HolderBuilding extends BuildingLifecycle {
  kind: "holder";
  address: string;
  /** Sorted ascending. The smallest tokenId is the facade. */
  tokenIds: number[];
  representativeTokenId: number;
  x: number;
  y: number;
  z: number;
  height: number;
  footprint: number;
  glow: number;
  /** Rank by portfolio size — 0 = top whale. Used for shade subtlety. */
  rank: number;
  /** Architectural tier 0..4 — drives roof shape, window density, proportions. */
  tier: number;
  /** World-space size of each square Normie cell on the front facade. */
  cellSize: number;
}

export interface BurnedBuilding extends BuildingLifecycle {
  kind: "burned";
  tokenId: number;
  x: number;
  y: number;
  z: number;
  height: number;
  footprint: number;
  glow: number;
  cellSize: number;
}

interface LayoutInput {
  holders: HolderState;
  burned: Set<number>;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°
const SPIRAL_BASE_RADIUS = 280;
const SPIRAL_GROWTH = 30;
/** Outer city limit — used to size the ground, fog and horizon. */
export const CITY_OUTER_RADIUS = 2200;

/**
 * Architectural tiers based on portfolio size. Each tier has a distinct silhouette so
 * a whale's HQ reads visually different from a singleton's villa even from afar.
 *
 *   T0 = villa            (1 NFT)         — wide+short, pitched-style top mark
 *   T1 = townhouse        (2-4 NFTs)      — narrow tower
 *   T2 = mid-rise         (5-15 NFTs)     — square apartment block
 *   T3 = office           (16-50 NFTs)    — broader high-rise
 *   T4 = modern tower     (51+ NFTs)      — slim very tall with antenna mark
 */
function tierOf(count: number): number {
  if (count <= 1) return 0;
  if (count <= 4) return 1;
  if (count <= 15) return 2;
  if (count <= 50) return 3;
  return 4;
}
const TIER_FOOTPRINT = [42, 32, 38, 52, 58];
const TIER_BASE_HEIGHT = [34, 70, 130, 230, 380];
/** Per-token height bonus (above tier base) within the tier. */
const TIER_HEIGHT_GROWTH = [0, 12, 8, 5, 3.4];

/**
 * Picks the largest possible square cell size in world units such that the building
 * face can host at least `k` cells. Cells are square and tile the face from the
 * bottom-left, leaving any unused area at the top as wall.
 */
function pickCellSize(footprint: number, height: number, k: number): number {
  if (k <= 1) {
    return Math.min(footprint, height);
  }
  // Size the grid from `k` itself instead of from the building shape: for each
  // candidate N (columns), compute the required rows M = ceil(k / N) and find the
  // largest square cell that fits both dimensions. This produces at most N-1 empty
  // cells (i.e., at most one short row) instead of dozens.
  let bestCell = 0;
  for (let N = 1; N <= 6; N++) {
    const M = Math.ceil(k / N);
    const cell = Math.min(footprint / N, height / M);
    if (cell > bestCell) bestCell = cell;
  }
  return bestCell;
}

export function computeLayout({ holders, burned }: LayoutInput): {
  buildings: Building[];
  buildingsByAddress: Map<string, HolderBuilding>;
  burnedSet: Set<number>;
} {
  const buildingsByAddress = new Map<string, HolderBuilding>();
  const buildings: Building[] = [];

  // Aggregate holders excluding burned tokens.
  const aggregate = new Map<string, number[]>();
  for (const [addr, tokens] of holders.byAddress) {
    const live: number[] = [];
    for (const t of tokens) {
      if (!burned.has(t)) live.push(t);
    }
    if (live.length > 0) {
      live.sort((a, b) => a - b);
      aggregate.set(addr, live);
    }
  }

  // Sort whales-first (descending count, address as deterministic tiebreaker).
  const sortedHolders = [...aggregate.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0] < b[0] ? -1 : 1;
  });

  sortedHolders.forEach(([address, tokenIds], rank) => {
    const count = tokenIds.length;
    const r = SPIRAL_BASE_RADIUS + SPIRAL_GROWTH * Math.sqrt(rank);
    const theta = rank * GOLDEN_ANGLE;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    const tier = tierOf(count);
    const footprint = TIER_FOOTPRINT[tier];
    // Inside a tier the building grows linearly with the extra tokens, but the tier
    // boundary is the dominant silhouette break.
    const tierMin = [1, 2, 5, 16, 51][tier];
    const overTierBase = Math.max(0, count - tierMin);
    const height = TIER_BASE_HEIGHT[tier] + overTierBase * TIER_HEIGHT_GROWTH[tier];

    const glow = rank < 10 ? 0.9 : rank < 50 ? 0.55 : count > 5 ? 0.22 : 0;

    const cellSize = pickCellSize(footprint, height, Math.min(count, 150));
    const b: HolderBuilding = {
      kind: "holder",
      address,
      tokenIds,
      representativeTokenId: tokenIds[0],
      x,
      y: height / 2,
      z,
      height,
      footprint,
      glow,
      rank,
      tier,
      cellSize,
    };
    buildings.push(b);
    buildingsByAddress.set(address, b);
  });

  // Burned tokens used to render as small tombstones in a ring around the city, but
  // they're now omitted entirely — the city only shows living holders. The burned set
  // is still tracked so transfer/burn dynamics keep working (a holder losing their
  // last live token still collapses their building).

  return { buildings, buildingsByAddress, burnedSet: burned };
}
