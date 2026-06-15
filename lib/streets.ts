// Street network generator.
//
// The holder layout is a golden-angle sunflower spiral (lib/layout.ts) with no
// inherent roads. To give the city walkable "vie" that read like a real city,
// we overlay a deterministic network — buildings are NEVER moved:
//   - radial avenues: spokes from the plaza edge outward
//   - ring roads: concentric loops
//   - a spiral boulevard: a smooth Fermat spiral "scenic route" echoing the
//     sunflower the buildings sit on
//   - crosswalks at every avenue×ring intersection
// Each road carries flanking sidewalks. All of it is brand-monochrome and
// rendered just above the ground.

import { CITY_OUTER_RADIUS } from "./layout";

// Plaza edge — streets start just outside it so the plaza stays open.
export const INNER_RADIUS = 460;
export const OUTER_RADIUS = CITY_OUTER_RADIUS - 40;

export const AVENUE_COUNT = 16; // radial spokes (denser grid, fills the city)
export const RING_STEP = 220; // distance between concentric ring roads

export const AVENUE_WIDTH = 30;
export const RING_WIDTH = 24;
export const SIDEWALK_WIDTH = 9;

export interface Avenue {
  /** Angle of the spoke (radians, from +X toward +Z). */
  angle: number;
  /** Inner/outer radius the avenue spans. */
  rInner: number;
  rOuter: number;
}

export interface Ring {
  radius: number;
}

export interface Crosswalk {
  x: number;
  z: number;
  /** Orientation of the crossing (radians) — aligned across the avenue. */
  angle: number;
}

export interface StreetNetwork {
  avenues: Avenue[];
  rings: Ring[];
  crosswalks: Crosswalk[];
  /** Smooth spiral boulevard sampled as a polyline of XZ points. */
  spiral: Array<[number, number]>;
}

/** Deterministic — same network every render. Memoise at the call site. */
export function buildStreetNetwork(): StreetNetwork {
  const avenues: Avenue[] = [];
  for (let i = 0; i < AVENUE_COUNT; i++) {
    avenues.push({
      angle: (i / AVENUE_COUNT) * Math.PI * 2,
      rInner: INNER_RADIUS,
      rOuter: OUTER_RADIUS,
    });
  }

  const rings: Ring[] = [];
  for (let r = INNER_RADIUS; r <= OUTER_RADIUS; r += RING_STEP) {
    rings.push({ radius: r });
  }

  // Crosswalks at each avenue × ring intersection.
  const crosswalks: Crosswalk[] = [];
  for (const av of avenues) {
    for (const ring of rings) {
      crosswalks.push({
        x: Math.cos(av.angle) * ring.radius,
        z: Math.sin(av.angle) * ring.radius,
        angle: av.angle,
      });
    }
  }

  // Spiral boulevard — a smooth Archimedean spiral from the plaza outward.
  // r grows linearly with the continuous angle so it never self-intersects and
  // reads as one long scenic road weaving out through the rings.
  const spiral: Array<[number, number]> = [];
  const TURNS = 4.5;
  const maxAngle = TURNS * Math.PI * 2;
  const b = (OUTER_RADIUS - INNER_RADIUS) / maxAngle;
  const STEP = 0.08; // radians between samples
  for (let a = 0; a <= maxAngle; a += STEP) {
    const r = INNER_RADIUS + b * a;
    spiral.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  return { avenues, rings, crosswalks, spiral };
}
