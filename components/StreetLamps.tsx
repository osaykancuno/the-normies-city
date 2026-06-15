"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lampPositions } from "@/lib/cityprops";
import { currentSkyState } from "@/lib/daynight";
import { useCity } from "@/lib/store";

// Instanced street lamps lining the avenues and rings. Two InstancedMesh draw
// calls total (poles + heads) for several hundred lamps. The heads are
// emissive and brighten at night, driven by the same day/night clock the sky
// uses — so the streets light up after dusk.

const POLE = "#48494b"; // brand-on
const HEAD = "#e3e5e4"; // brand-off
const POLE_H = 52; // tall enough to tower over the ~17u street-level eye
const tmp = new THREE.Object3D();

export default function StreetLamps() {
  const buildings = useCity((s) => s.buildings);
  // Recompute when the layout changes so lamps stay out of buildings.
  const lamps = useMemo(() => lampPositions(buildings), [buildings]);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  const headMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: HEAD,
        emissive: new THREE.Color(HEAD),
        emissiveIntensity: 0.2,
        roughness: 0.6,
      }),
    [],
  );
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: POLE, roughness: 1 }),
    [],
  );

  useEffect(() => {
    const pole = poleRef.current;
    const head = headRef.current;
    if (!pole || !head) return;
    for (let i = 0; i < lamps.length; i++) {
      const { x, z } = lamps[i];
      // Pole.
      tmp.position.set(x, POLE_H / 2, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      pole.setMatrixAt(i, tmp.matrix);
      // Head.
      tmp.position.set(x, POLE_H + 1.8, z);
      tmp.updateMatrix();
      head.setMatrixAt(i, tmp.matrix);
    }
    pole.count = lamps.length;
    head.count = lamps.length;
    pole.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }, [lamps]);

  // Brighten the lamp heads at night. Cheap: one shared material, updated a few
  // times a second is plenty, but per-frame is fine (single uniform write).
  useFrame(() => {
    const b = currentSkyState().brightness; // 0 (night) .. 1 (noon)
    const glow = THREE.MathUtils.clamp(1 - b * 1.5, 0, 1);
    headMat.emissiveIntensity = 0.15 + glow * 1.6;
  });

  return (
    <group>
      <instancedMesh ref={poleRef} args={[undefined, undefined, lamps.length]} material={poleMat} frustumCulled={false}>
        <cylinderGeometry args={[1.0, 1.4, POLE_H, 6]} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, lamps.length]} material={headMat} frustumCulled={false}>
        <boxGeometry args={[5, 3, 5]} />
      </instancedMesh>
    </group>
  );
}
