// Lightweight collision for first-person walk mode.
//
// The city has up to 10 000 buildings, so we never brute-force every frame.
// Instead we bucket building footprints into a uniform spatial hash once per
// layout change, then per frame test only the handful of buckets around the
// player. Each building is treated as an axis-aligned box on the XZ plane;
// the player is a small circle. Movement is resolved per-axis so the player
// slides along walls instead of sticking.

import type { Building } from "./layout";
import { CITY_OUTER_RADIUS } from "./layout";

const CELL = 140; // hash cell size in world units (≈ largest footprint + margin)
const PLAYER_RADIUS = 4; // half-width of the walking camera "body"
const BUILDING_MARGIN = 2; // keep a little air between player and wall

export interface CityCollider {
  /** Test a desired XZ position; returns the corrected position after
   *  resolving against any overlapping building boxes and the city edge. */
  resolve(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number };
}

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function keyOf(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

/** Build a spatial-hash collider from the current buildings array. Cheap to
 *  rebuild (called whenever the layout changes). Only holder buildings have a
 *  footprint worth colliding with; burned tokens aren't rendered. */
export function buildCollider(buildings: Building[]): CityCollider {
  const grid = new Map<string, Box[]>();

  for (const b of buildings) {
    if (b.kind !== "holder") continue;
    const half = b.footprint / 2 + BUILDING_MARGIN;
    const box: Box = {
      minX: b.x - half,
      maxX: b.x + half,
      minZ: b.z - half,
      maxZ: b.z + half,
    };
    // Insert into every cell the box touches (footprints are smaller than a
    // cell, so this is 1–4 cells each).
    const cMinX = Math.floor(box.minX / CELL);
    const cMaxX = Math.floor(box.maxX / CELL);
    const cMinZ = Math.floor(box.minZ / CELL);
    const cMaxZ = Math.floor(box.maxZ / CELL);
    for (let cx = cMinX; cx <= cMaxX; cx++) {
      for (let cz = cMinZ; cz <= cMaxZ; cz++) {
        const k = keyOf(cx, cz);
        let arr = grid.get(k);
        if (!arr) {
          arr = [];
          grid.set(k, arr);
        }
        arr.push(box);
      }
    }
  }

  const maxRadius = CITY_OUTER_RADIUS - 8;

  function blocked(x: number, z: number): boolean {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const arr = grid.get(keyOf(i, j));
        if (!arr) continue;
        for (const box of arr) {
          // Circle-vs-AABB: clamp the circle centre to the box, measure gap.
          const nx = Math.max(box.minX, Math.min(x, box.maxX));
          const nz = Math.max(box.minZ, Math.min(z, box.maxZ));
          const dx = x - nx;
          const dz = z - nz;
          if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) return true;
        }
      }
    }
    return false;
  }

  return {
    resolve(fromX, fromZ, toX, toZ) {
      // Per-axis resolution → slide along walls instead of stopping dead.
      let x = fromX;
      let z = fromZ;
      if (!blocked(toX, z)) x = toX;
      if (!blocked(x, toZ)) z = toZ;

      // City-edge clamp: keep the walker inside the world disc.
      const r = Math.hypot(x, z);
      if (r > maxRadius) {
        const s = maxRadius / r;
        x *= s;
        z *= s;
      }
      return { x, z };
    },
  };
}
