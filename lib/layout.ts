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
// Holder spiral begins just outside the plaza ring. PLAZA_RADIUS in Plaza.tsx
// was bumped to 460 when the community shop kiosks were added at radius 380
// (max outer extent ~410 incl. plinth + awning), so the spiral now starts at
// 520 to leave a clean 60 u walkway between the plaza edge and the first
// building. Keep this in sync if the plaza grows again.
// Buildings are at most 3 cells wide (≈45 u). The spiral spacing is tuned so the
// TRUE global minimum gap between any two neighbours is ≈13 u — tight enough to
// read as a dense downtown, but always wider than the walking camera's body
// (PLAYER_RADIUS=4, i.e. 8 u) so you can pass between buildings in street view
// and no two buildings ever overlap. With ~1.9k holders the outermost building
// sits at ≈1720; headroom well past the current holder count.
const SPIRAL_BASE_RADIUS = 500;
const SPIRAL_GROWTH = 28;
/** Outer city limit — used to size the ground, fog and horizon. Sits just
 *  beyond the outermost building so the streets/greenery form a thin green belt
 *  and then fade into fog — no empty plain, no buildings off the ground edge. */
export const CITY_OUTER_RADIUS = 1820;

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
// Building size is driven entirely by the NFT count, with a FIXED-size facade
// cell so every Normie face is the same size across the city. The grid is at
// most MAX_COLS wide; the footprint widens with the columns (1→3 cells) and
// then the height grows with the rows. Net effect: more NFTs ALWAYS means a
// bigger building — first wider, then taller — and the facade fills the face
// exactly (no empty black wall). Uniform cells fix the old inversion where a
// 3-NFT building could end up shorter than a 1-NFT one.
const FACE_CELL = 15; // world units per Normie face (constant everywhere)
const MAX_COLS = 3; // facade is at most 3 Normies wide; height carries the rest
const MAX_HEIGHT = 1600; // safety ceiling for hypothetical mega-wallets

interface FaceGrid {
  cols: number;
  rows: number;
  cellSize: number;
  footprint: number;
  height: number;
}
function faceGrid(count: number): FaceGrid {
  const cols = Math.max(1, Math.min(MAX_COLS, count));
  const rows = Math.ceil(count / cols);
  let cellSize = FACE_CELL;
  let footprint = cols * cellSize; // width grows with columns (1..3 cells)
  let height = rows * cellSize; // then height grows with rows
  // Mega-wallet guard: scale the whole grid down if a tower would pierce the
  // sky, keeping the facade gap-free.
  if (height > MAX_HEIGHT) {
    const s = MAX_HEIGHT / height;
    cellSize *= s;
    footprint *= s;
    height = MAX_HEIGHT;
  }
  return { cols, rows, cellSize, footprint, height };
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

    // Tier still drives the architectural styling (roof shape, window density
    // in the shader via vTier); size (footprint + height) comes entirely from
    // the NFT count via the fixed-cell grid so bigger wallets are bigger.
    const tier = tierOf(count);
    const { cellSize, height, footprint } = faceGrid(count);

    const glow = rank < 10 ? 0.9 : rank < 50 ? 0.55 : count > 5 ? 0.22 : 0;
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
