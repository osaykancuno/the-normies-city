"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useCity } from "@/lib/store";
import { buildRoadNetwork, ROAD_CARRIAGEWAY_WIDTH } from "@/lib/streets";

// Organic street network for the "real city" look. The carriageways are derived
// from the actual building layout (Gabriel graph — see lib/streets.ts), so every
// road threads through the open gap BETWEEN two adjacent buildings and never
// cuts through one. Flanked by the per-building sidewalk aprons (Sidewalks.tsx),
// this reads as proper streets-with-pavements instead of a geometric grid laid
// over the houses. One merged mesh = one draw call.

const ROAD = "#2a2b30"; // carriageway — lighter than the ground, darker than kerbs
const PAINT = "#cfd2d0"; // faint centre line
const Y_ROAD = 0.5;
const Y_PAINT = 0.62;

export default function Streets() {
  const buildings = useCity((s) => s.buildings);

  const { road, paint } = useMemo(() => {
    const segs = buildRoadNetwork(buildings);
    const half = ROAD_CARRIAGEWAY_WIDTH / 2;

    // Carriageway quads.
    const rp: number[] = [];
    const ri: number[] = [];
    let v = 0;
    // Centre-line quads (thin), only on segments long enough to read.
    const pp: number[] = [];
    const pi: number[] = [];
    let pv = 0;
    const LINE = 0.7;

    for (const s of segs) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      rp.push(
        s.ax + nx, Y_ROAD, s.az + nz,
        s.ax - nx, Y_ROAD, s.az - nz,
        s.bx + nx, Y_ROAD, s.bz + nz,
        s.bx - nx, Y_ROAD, s.bz - nz,
      );
      ri.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;

      if (len > 16) {
        const lx = (-dz / len) * LINE;
        const lz = (dx / len) * LINE;
        pp.push(
          s.ax + lx, Y_PAINT, s.az + lz,
          s.ax - lx, Y_PAINT, s.az - lz,
          s.bx + lx, Y_PAINT, s.bz + lz,
          s.bx - lx, Y_PAINT, s.bz - lz,
        );
        pi.push(pv, pv + 1, pv + 2, pv + 1, pv + 3, pv + 2);
        pv += 4;
      }
    }

    const road = new THREE.BufferGeometry();
    road.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    road.setIndex(ri);
    road.computeVertexNormals();

    const paint = new THREE.BufferGeometry();
    paint.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
    paint.setIndex(pi);
    paint.computeVertexNormals();

    return { road, paint };
  }, [buildings]);

  const mats = useMemo(
    () => ({
      road: new THREE.MeshStandardMaterial({ color: ROAD, roughness: 1 }),
      paint: new THREE.MeshBasicMaterial({
        color: PAINT,
        transparent: true,
        opacity: 0.18,
      }),
    }),
    [],
  );

  if (buildings.length === 0) return null;
  return (
    <group>
      <mesh geometry={road} material={mats.road} receiveShadow />
      <mesh geometry={paint} material={mats.paint} />
    </group>
  );
}
