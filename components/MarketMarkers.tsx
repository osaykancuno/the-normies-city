"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useCity } from "@/lib/store";

// Market District: a floating diamond "for sale" pin hovers over every building
// that holds at least one Normie currently listed on OpenSea. One InstancedMesh
// (one draw call) for the whole live market. Click a pin to open that holder.
// Purely additive — renders nothing when no listings are loaded.

const tmp = new THREE.Object3D();

export default function MarketMarkers() {
  const buildings = useCity((s) => s.buildings);
  const buildingsByAddress = useCity((s) => s.buildingsByAddress);
  const holders = useCity((s) => s.holders);
  const listedSet = useCity((s) => s.listedSet);
  const marketVersion = useCity((s) => s.marketVersion);
  const setSelection = useCity((s) => s.setSelection);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Buildings that hold ≥1 listed Normie (deduped), with their roof height.
  const pins = useMemo(() => {
    if (!holders || listedSet.size === 0) return [] as { x: number; z: number; y: number; address: string }[];
    const seen = new Set<string>();
    const out: { x: number; z: number; y: number; address: string }[] = [];
    for (const id of listedSet) {
      const owner = holders.byToken[id];
      if (!owner) continue;
      const key = owner.toLowerCase();
      if (seen.has(key)) continue;
      const b = buildingsByAddress.get(key);
      if (!b) continue;
      seen.add(key);
      out.push({ x: b.x, z: b.z, y: b.height + 16, address: b.address });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketVersion, buildings, holders, buildingsByAddress]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e3e5e4",
        emissive: "#e3e5e4",
        emissiveIntensity: 0.55,
        roughness: 0.6,
      }),
    [],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || pins.length === 0) return;
    pins.forEach((p, i) => {
      tmp.position.set(p.x, p.y, p.z);
      tmp.rotation.set(0, Math.PI / 4, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.count = pins.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pins]);

  // Gentle bob + spin so the pins read as live.
  useFrame((s) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(s.clock.elapsedTime * 2) * 2;
      groupRef.current.rotation.y = s.clock.elapsedTime * 0.6;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const p = pins[e.instanceId];
    if (p) setSelection({ kind: "holder", address: p.address });
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "";
  };

  if (pins.length === 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, pins.length]}
        material={material}
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <octahedronGeometry args={[5.5]} />
      </instancedMesh>
    </group>
  );
}
