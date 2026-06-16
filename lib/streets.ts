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

import { CITY_OUTER_RADIUS, type Building } from "./layout";

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

// ---------------------------------------------------------------------------
// Organic road network derived from the actual building layout.
//
// The buildings sit on a sunflower spiral, so any geometric grid of avenues
// inevitably cuts straight through them. Instead we connect each building to
// its true neighbours with the GABRIEL GRAPH (a subgraph of the Delaunay
// triangulation): an edge a–b exists only if no other building falls inside the
// circle that has a–b as its diameter. That condition guarantees the segment
// runs through the open gap *between* two adjacent buildings and never crosses a
// third — exactly how real streets thread between blocks. Each segment is then
// clipped to the gutter just outside both footprints, so the road sits in the
// street, not under the houses.

export interface RoadSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

const ROAD_WIDTH = 9; // carriageway width laid between the sidewalk aprons
const ROAD_GUTTER = 1; // clip the segment this far outside each footprint
const MAX_LINK = 135; // ignore neighbours farther apart than this (centre→centre)

/** Deterministic — depends only on the building positions. Memoise at the call
 *  site (it's recomputed only when the layout changes). */
export function buildRoadNetwork(buildings: Building[]): RoadSeg[] {
  const pts = buildings
    .filter((b) => b.kind === "holder")
    .map((b) => ({ x: b.x, z: b.z, r: b.footprint / 2 }));
  const n = pts.length;
  if (n < 2) return [];

  // Spatial hash for candidate neighbours + Gabriel tests.
  const CELL = MAX_LINK;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number) => cx + ":" + cz;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(pts[i].x / CELL);
    const cz = Math.floor(pts[i].z / CELL);
    const k = key(cx, cz);
    let arr = grid.get(k);
    if (!arr) {
      arr = [];
      grid.set(k, arr);
    }
    arr.push(i);
  }
  const near = (x: number, z: number): number[] => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const out: number[] = [];
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.get(key(cx + a, cz + b));
        if (arr) out.push(...arr);
      }
    }
    return out;
  };

  const segs: RoadSeg[] = [];
  for (let i = 0; i < n; i++) {
    const pi = pts[i];
    for (const j of near(pi.x, pi.z)) {
      if (j <= i) continue;
      const pj = pts[j];
      const dx = pj.x - pi.x;
      const dz = pj.z - pi.z;
      const dist = Math.hypot(dx, dz);
      if (dist > MAX_LINK || dist < 1e-3) continue;

      // Gabriel condition: nobody inside the circle with diameter i–j.
      const mx = (pi.x + pj.x) / 2;
      const mz = (pi.z + pj.z) / 2;
      const rad2 = (dist * dist) / 4;
      let blocked = false;
      for (const k of near(mx, mz)) {
        if (k === i || k === j) continue;
        const ddx = pts[k].x - mx;
        const ddz = pts[k].z - mz;
        if (ddx * ddx + ddz * ddz < rad2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // Clip the road to the gap between the two footprints.
      const ux = dx / dist;
      const uz = dz / dist;
      const s0 = pi.r + ROAD_GUTTER;
      const s1 = dist - (pj.r + ROAD_GUTTER);
      if (s1 <= s0) continue; // footprints touch — no room for a carriageway
      segs.push({
        ax: pi.x + ux * s0,
        az: pi.z + uz * s0,
        bx: pi.x + ux * s1,
        bz: pi.z + uz * s1,
      });
    }
  }
  return segs;
}

export const ROAD_CARRIAGEWAY_WIDTH = ROAD_WIDTH;
