// Deterministic placement helpers for city props (street lamps, trees,
// plaza furniture). All seeded so the city looks identical every load and
// every client — no per-frame work, computed once. Props never move buildings
// and are walk-through (no collision) for now.

import type { Building } from "./layout";
import { INNER_RADIUS, OUTER_RADIUS, AVENUE_COUNT, RING_STEP, AVENUE_WIDTH } from "./streets";

export interface PropXZ {
  x: number;
  z: number;
}
export interface ScatterItem extends PropXZ {
  scale: number;
  rot: number;
}

/** Tiny seeded PRNG (mulberry32) for reproducible scatter. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a fast point-vs-building rejector from the buildings array. Returns a
 *  predicate that is true when (x,z) lands within `extra` units of any building
 *  footprint — used to keep props (lamps, trees) out of the houses. */
function buildingRejector(buildings: Building[], extra: number) {
  const CELL = 120;
  const grid = new Map<string, { x: number; z: number; r: number }[]>();
  for (const b of buildings) {
    if (b.kind !== "holder") continue;
    const r = b.footprint / 2 + extra;
    const cx = Math.floor(b.x / CELL);
    const cz = Math.floor(b.z / CELL);
    const key = `${cx}:${cz}`;
    let arr = grid.get(key);
    if (!arr) {
      arr = [];
      grid.set(key, arr);
    }
    arr.push({ x: b.x, z: b.z, r });
  }
  return (x: number, z: number): boolean => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const arr = grid.get(`${i}:${j}`);
        if (!arr) continue;
        for (const b of arr) {
          const dx = x - b.x;
          const dz = z - b.z;
          if (dx * dx + dz * dz < b.r * b.r) return true;
        }
      }
    }
    return false;
  };
}

/** Street lamps along both sides of every avenue + spaced around each ring.
 *  Candidates that would land inside (or right up against) a building are
 *  dropped — the spiral building layout isn't aligned to the avenues, so a raw
 *  geometric placement otherwise pokes lamps through houses. */
export function lampPositions(buildings: Building[]): PropXZ[] {
  const reject = buildingRejector(buildings, 6);
  const out: PropXZ[] = [];
  const SIDE = AVENUE_WIDTH / 2 + 6;
  const STEP = 95;
  for (let i = 0; i < AVENUE_COUNT; i++) {
    const theta = (i / AVENUE_COUNT) * Math.PI * 2;
    const dx = Math.cos(theta);
    const dz = Math.sin(theta);
    const px = -Math.sin(theta);
    const pz = Math.cos(theta);
    for (let r = INNER_RADIUS + 40; r <= OUTER_RADIUS - 40; r += STEP) {
      const bx = dx * r;
      const bz = dz * r;
      const a = { x: bx + px * SIDE, z: bz + pz * SIDE };
      const b = { x: bx - px * SIDE, z: bz - pz * SIDE };
      if (!reject(a.x, a.z)) out.push(a);
      if (!reject(b.x, b.z)) out.push(b);
    }
  }
  // Ring lamps — spaced angularly.
  for (let r = INNER_RADIUS; r <= OUTER_RADIUS; r += RING_STEP) {
    const circumference = 2 * Math.PI * r;
    const n = Math.max(8, Math.round(circumference / 140));
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + 0.2;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!reject(x, z)) out.push({ x, z });
    }
  }
  return out;
}

/** Scatter trees/planters in the gaps between buildings. Rejects any candidate
 *  overlapping a building footprint (cheap grid hash) so greenery only fills
 *  the open ground. */
export function scatterTrees(buildings: Building[], target = 650): ScatterItem[] {
  // Grid hash of building centres for fast rejection.
  const CELL = 120;
  const grid = new Map<string, { x: number; z: number; r: number }[]>();
  for (const b of buildings) {
    if (b.kind !== "holder") continue;
    const r = b.footprint / 2 + 28; // keep the (now larger) canopies clear of walls
    const cx = Math.floor(b.x / CELL);
    const cz = Math.floor(b.z / CELL);
    const key = `${cx}:${cz}`;
    let arr = grid.get(key);
    if (!arr) {
      arr = [];
      grid.set(key, arr);
    }
    arr.push({ x: b.x, z: b.z, r });
  }

  const tooClose = (x: number, z: number): boolean => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const arr = grid.get(`${i}:${j}`);
        if (!arr) continue;
        for (const b of arr) {
          const dx = x - b.x;
          const dz = z - b.z;
          if (dx * dx + dz * dz < b.r * b.r) return true;
        }
      }
    }
    return false;
  };

  const rng = mulberry32(0xa11ce);
  const items: ScatterItem[] = [];
  let attempts = 0;
  while (items.length < target && attempts < target * 12) {
    attempts++;
    const a = rng() * Math.PI * 2;
    const r = INNER_RADIUS + 20 + rng() * (OUTER_RADIUS - INNER_RADIUS - 40);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (tooClose(x, z)) continue;
    items.push({ x, z, scale: 0.8 + rng() * 0.7, rot: rng() * Math.PI * 2 });
  }
  return items;
}

/** Benches + planters ringing the plaza, just outside its edge. */
export function plazaFurniture(): ScatterItem[] {
  const out: ScatterItem[] = [];
  const R = 430;
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    out.push({
      x: Math.cos(a) * R,
      z: Math.sin(a) * R,
      scale: 1,
      rot: -a, // face the plaza centre
    });
  }
  return out;
}
