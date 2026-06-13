// Street network generator.
//
// The holder layout is a golden-angle sunflower spiral (lib/layout.ts) with no
// inherent roads. To give the city walkable "vie" and orientation, we overlay a
// deterministic network of radial avenues (spokes from the plaza outward) and
// concentric ring roads. This is purely a ground-level visual layer — it never
// moves buildings.

import { CITY_OUTER_RADIUS } from "./layout";

// Plaza edge — streets start just outside it so the plaza stays open.
const INNER_RADIUS = 460;
const OUTER_RADIUS = CITY_OUTER_RADIUS - 40;

export const AVENUE_COUNT = 12; // radial spokes
export const RING_STEP = 300; // distance between concentric ring roads

export interface StreetSegment {
  /** Centre of the segment, world XZ. */
  x: number;
  z: number;
  /** Length along the road direction, and width across it. */
  length: number;
  width: number;
  /** Rotation around Y (radians) so the segment's long axis follows the road. */
  rotation: number;
}

export interface StreetNetwork {
  avenues: StreetSegment[];
  rings: StreetSegment[];
}

const AVENUE_WIDTH = 26;
const RING_WIDTH = 20;

/** Deterministic — same network every render, no inputs needed. Memoise at the
 *  call site (useMemo) since the result is constant for the app's lifetime. */
export function buildStreetNetwork(): StreetNetwork {
  const avenues: StreetSegment[] = [];
  for (let i = 0; i < AVENUE_COUNT; i++) {
    const theta = (i / AVENUE_COUNT) * Math.PI * 2;
    const length = OUTER_RADIUS - INNER_RADIUS;
    const midR = (INNER_RADIUS + OUTER_RADIUS) / 2;
    avenues.push({
      x: Math.cos(theta) * midR,
      z: Math.sin(theta) * midR,
      length,
      width: AVENUE_WIDTH,
      // A plane is built along +X; rotate so its long axis points radially.
      // World angle of the radial direction is theta (measured from +X toward +Z).
      rotation: -theta,
    });
  }

  // Concentric ring roads. Each ring is approximated by a thin torus-like band;
  // we render it as a single ring mesh at the call site, so here we only carry
  // the radius via `length` (= radius) and `width`.
  const rings: StreetSegment[] = [];
  for (let r = INNER_RADIUS; r <= OUTER_RADIUS; r += RING_STEP) {
    rings.push({ x: 0, z: 0, length: r, width: RING_WIDTH, rotation: 0 });
  }

  return { avenues, rings };
}
