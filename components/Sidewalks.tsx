"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useCity } from "@/lib/store";

// A raised pavement "apron" around every holder building. The buildings sit on a
// sunflower spiral (not on the avenue grid), so without this the ground between
// them was just empty asphalt. Each apron is a low kerb a few units wider than
// the building footprint; where neighbours are close the aprons nearly meet and
// the darker asphalt between them reads as a street, giving the floor a real
// city feel instead of an abstract grid. One InstancedMesh = one draw call.

const SIDEWALK = "#3a3b40"; // matches the avenue sidewalks in Streets.tsx
const KERB = "#2c2d31"; // thin darker rim around each apron (gutter line)
const MARGIN = 5; // pavement band width around the footprint
const SLAB_H = 1.4; // kerb height above the ground

const tmp = new THREE.Object3D();

export default function Sidewalks() {
  const buildings = useCity((s) => s.buildings);
  const apronRef = useRef<THREE.InstancedMesh>(null);
  const kerbRef = useRef<THREE.InstancedMesh>(null);

  const holders = useMemo(
    () => buildings.filter((b) => b.kind === "holder"),
    [buildings],
  );

  const apronMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SIDEWALK, roughness: 1 }),
    [],
  );
  const kerbMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: KERB, roughness: 1 }),
    [],
  );

  useEffect(() => {
    const apron = apronRef.current;
    const kerb = kerbRef.current;
    if (!apron || !kerb) return;
    holders.forEach((b, i) => {
      const s = b.footprint + MARGIN * 2;
      // Pavement slab.
      tmp.position.set(b.x, SLAB_H / 2, b.z);
      tmp.scale.set(s, SLAB_H, s);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      apron.setMatrixAt(i, tmp.matrix);
      // A slightly larger, flatter darker slab just below it = a gutter rim that
      // separates touching pavements so each block still reads individually.
      tmp.position.set(b.x, SLAB_H * 0.35, b.z);
      tmp.scale.set(s + 3, SLAB_H * 0.7, s + 3);
      tmp.updateMatrix();
      kerb.setMatrixAt(i, tmp.matrix);
    });
    apron.count = holders.length;
    kerb.count = holders.length;
    apron.instanceMatrix.needsUpdate = true;
    kerb.instanceMatrix.needsUpdate = true;
    apron.computeBoundingSphere();
    kerb.computeBoundingSphere();
  }, [holders]);

  if (holders.length === 0) return null;
  const n = Math.max(1, holders.length);
  return (
    <group>
      <instancedMesh
        ref={kerbRef}
        args={[undefined, undefined, n]}
        material={kerbMat}
        frustumCulled={false}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={apronRef}
        args={[undefined, undefined, n]}
        material={apronMat}
        frustumCulled={false}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  );
}
