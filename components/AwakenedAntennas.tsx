"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { useCity } from "@/lib/store";

// Tiny dish-on-a-mast that sits on top of every awakened Normie building.
//
// A SECOND InstancedMesh sibling of <InstancedNormies>. We keep it separate
// because (a) the per-instance attribute on the building mesh already says
// awakened-or-not for shader purposes, and (b) the antenna is a different
// geometry that wouldn't share a draw call with the building cubes anyway.
//
// Non-interactive: no raycasting, no hover handlers. Pure visual marker.

const BRAND_OFF = "#e3e5e4";
const MAX_AWAKENED = 1000; // 52 today, plenty of headroom.

export default function AwakenedAntennas() {
  const buildings = useCity((s) => s.buildings);
  const awakenedSet = useCity((s) => s.awakenedSet);
  const awakenedVersion = useCity((s) => s.awakenedVersion);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Mast + dish merged once. Material is a plain Lambert so we get a tiny
  // amount of shading from the scene lights without needing a custom shader.
  const geom = useMemo(() => {
    const mast = new THREE.CylinderGeometry(0.4, 0.4, 4.5, 6);
    mast.translate(0, 2.25, 0);
    const dish = new THREE.ConeGeometry(2.2, 1.1, 10, 1, true);
    dish.rotateX(Math.PI); // open side facing up
    dish.translate(0, 5.2, 0);
    const merged = mergeGeometries([mast, dish]);
    return merged ?? mast;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: BRAND_OFF,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );

  // Rebuild instance matrices whenever the building list or awakened set
  // changes. awakenedVersion gives us a primitive dep so React doesn't have to
  // diff the Set reference each render.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const tmp = new THREE.Object3D();
    let count = 0;
    for (const b of buildings) {
      if (count >= MAX_AWAKENED) break;
      if (b.kind !== "holder") continue;
      let hit = false;
      for (const id of b.tokenIds) {
        if (awakenedSet.has(id)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      tmp.position.set(b.x, b.y + b.height, b.z);
      // Scale a touch with footprint so big-whale buildings get a slightly
      // taller antenna (purely visual rank cue).
      const s = Math.min(1.4, 0.7 + b.footprint * 0.012);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      mesh.setMatrixAt(count, tmp.matrix);
      count++;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
  }, [buildings, awakenedSet, awakenedVersion]);

  // Slow vertical bob so the antennas feel alive — purely cosmetic, applied to
  // the parent mesh transform (cheap; no per-instance matrix updates).
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    meshRef.current.position.y = Math.sin(clock.elapsedTime * 1.3) * 0.4;
  });

  return (
    <instancedMesh ref={meshRef} args={[geom, material, MAX_AWAKENED]} />
  );
}
