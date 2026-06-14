"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useCity } from "@/lib/store";
import { scatterTrees, plazaFurniture } from "@/lib/cityprops";

// Instanced greenery + plaza furniture that "populates" the city without
// touching buildings. Three InstancedMesh draw calls total (tree trunks, tree
// canopies, benches) for hundreds of props. Brand-monochrome, walk-through.

const TRUNK = "#2e2f33";
const CANOPY = "#595a5e";
const BENCH = "#48494b";

const TRUNK_H = 26; // mature trees that tower over the ~17u street-level eye
const CANOPY_R = 13;
const tmp = new THREE.Object3D();

export default function CityProps() {
  const buildings = useCity((s) => s.buildings);

  // Scatter recomputes only when the layout changes (rare).
  const trees = useMemo(() => scatterTrees(buildings), [buildings]);
  const benches = useMemo(() => plazaFurniture(), []);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const benchRef = useRef<THREE.InstancedMesh>(null);

  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: TRUNK, roughness: 1 }), []);
  const canopyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CANOPY, roughness: 1, flatShading: true }), []);
  const benchMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BENCH, roughness: 1 }), []);

  useEffect(() => {
    const trunk = trunkRef.current;
    const canopy = canopyRef.current;
    if (!trunk || !canopy) return;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const s = t.scale;
      // Trunk.
      tmp.position.set(t.x, (TRUNK_H * s) / 2, t.z);
      tmp.rotation.set(0, t.rot, 0);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      trunk.setMatrixAt(i, tmp.matrix);
      // Canopy sits atop the trunk.
      tmp.position.set(t.x, TRUNK_H * s + CANOPY_R * s * 0.6, t.z);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      canopy.setMatrixAt(i, tmp.matrix);
    }
    trunk.count = trees.length;
    canopy.count = trees.length;
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
  }, [trees]);

  useEffect(() => {
    const bench = benchRef.current;
    if (!bench) return;
    for (let i = 0; i < benches.length; i++) {
      const b = benches[i];
      tmp.position.set(b.x, 4, b.z);
      tmp.rotation.set(0, b.rot, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      bench.setMatrixAt(i, tmp.matrix);
    }
    bench.count = benches.length;
    bench.instanceMatrix.needsUpdate = true;
  }, [benches]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, Math.max(1, trees.length)]} material={trunkMat} frustumCulled={false}>
        <cylinderGeometry args={[2.0, 2.8, TRUNK_H, 5]} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, Math.max(1, trees.length)]} material={canopyMat} frustumCulled={false}>
        <icosahedronGeometry args={[CANOPY_R, 0]} />
      </instancedMesh>
      <instancedMesh ref={benchRef} args={[undefined, undefined, Math.max(1, benches.length)]} material={benchMat} frustumCulled={false}>
        <boxGeometry args={[10, 3, 3.5]} />
      </instancedMesh>
    </group>
  );
}
