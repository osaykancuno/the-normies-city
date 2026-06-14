"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  buildStreetNetwork,
  AVENUE_WIDTH,
  RING_WIDTH,
  SIDEWALK_WIDTH,
} from "@/lib/streets";

// Ground-level street network for the "real city" look — radial avenues, ring
// roads, a spiral boulevard, flanking sidewalks and crosswalks at every
// intersection. Purely cosmetic + orientation: buildings are never moved.
// Brand-monochrome, layered just above the ground plane.

const ASPHALT = "#26272b"; // road surface (slightly above ink)
const SIDEWALK = "#3a3b40"; // raised pavement
const PAINT = "#e3e5e4"; // lane paint / crosswalks (brand-off)

const Y_SPIRAL = 0.45;
const Y_ROAD = 0.5;
const Y_SIDEWALK = 0.8;
const Y_PAINT = 0.72;

const tmp = new THREE.Object3D();

export default function Streets() {
  const net = useMemo(() => buildStreetNetwork(), []);
  const crosswalkRef = useRef<THREE.InstancedMesh>(null);

  // Materials (shared).
  const mats = useMemo(
    () => ({
      asphalt: new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 1 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: SIDEWALK, roughness: 1 }),
      paint: new THREE.MeshBasicMaterial({ color: PAINT, transparent: true, opacity: 0.45 }),
    }),
    [],
  );

  // Spiral boulevard ribbon, built once from the polyline.
  const spiralGeom = useMemo(() => buildRibbon(net.spiral, 22, Y_SPIRAL), [net.spiral]);

  // Crosswalk stripes — one InstancedMesh of thin boxes across each
  // avenue×ring intersection.
  const stripeCount = net.crosswalks.length * 4;
  useEffect(() => {
    const mesh = crosswalkRef.current;
    if (!mesh) return;
    let i = 0;
    const spacing = 5;
    for (const cw of net.crosswalks) {
      const dirX = Math.cos(cw.angle);
      const dirZ = Math.sin(cw.angle);
      for (const k of [-1.5, -0.5, 0.5, 1.5]) {
        tmp.position.set(
          cw.x + dirX * k * spacing,
          Y_PAINT,
          cw.z + dirZ * k * spacing,
        );
        tmp.rotation.set(0, -cw.angle, 0);
        // Box long axis (local X) spans the road width across travel; thin in
        // the travel direction.
        tmp.scale.set(AVENUE_WIDTH, 0.5, 2.2);
        tmp.updateMatrix();
        mesh.setMatrixAt(i++, tmp.matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }, [net.crosswalks]);

  return (
    <group>
      {/* Spiral boulevard (drawn first / lowest). */}
      <mesh geometry={spiralGeom} material={mats.asphalt} />

      {/* Radial avenues — road + two sidewalks. */}
      {net.avenues.map((av, i) => {
        const midR = (av.rInner + av.rOuter) / 2;
        const length = av.rOuter - av.rInner;
        const cx = Math.cos(av.angle) * midR;
        const cz = Math.sin(av.angle) * midR;
        const perpX = -Math.sin(av.angle);
        const perpZ = Math.cos(av.angle);
        const swOff = AVENUE_WIDTH / 2 + SIDEWALK_WIDTH / 2;
        return (
          <group key={`av-${i}`}>
            <mesh
              rotation={[-Math.PI / 2, 0, -av.angle]}
              position={[cx, Y_ROAD, cz]}
              material={mats.asphalt}
            >
              <planeGeometry args={[length, AVENUE_WIDTH]} />
            </mesh>
            {/* dashed centre line */}
            <mesh
              rotation={[-Math.PI / 2, 0, -av.angle]}
              position={[cx, Y_PAINT, cz]}
              material={mats.paint}
            >
              <planeGeometry args={[length, 1.2]} />
            </mesh>
            {/* sidewalks */}
            <mesh
              rotation={[-Math.PI / 2, 0, -av.angle]}
              position={[cx + perpX * swOff, Y_SIDEWALK, cz + perpZ * swOff]}
              material={mats.sidewalk}
            >
              <planeGeometry args={[length, SIDEWALK_WIDTH]} />
            </mesh>
            <mesh
              rotation={[-Math.PI / 2, 0, -av.angle]}
              position={[cx - perpX * swOff, Y_SIDEWALK, cz - perpZ * swOff]}
              material={mats.sidewalk}
            >
              <planeGeometry args={[length, SIDEWALK_WIDTH]} />
            </mesh>
          </group>
        );
      })}

      {/* Ring roads — road ring + inner/outer sidewalk rings. */}
      {net.rings.map((ring, i) => (
        <group key={`ring-${i}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_ROAD, 0]} material={mats.asphalt}>
            <ringGeometry args={[ring.radius - RING_WIDTH / 2, ring.radius + RING_WIDTH / 2, 160]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_SIDEWALK, 0]} material={mats.sidewalk}>
            <ringGeometry
              args={[
                ring.radius - RING_WIDTH / 2 - SIDEWALK_WIDTH,
                ring.radius - RING_WIDTH / 2,
                160,
              ]}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_SIDEWALK, 0]} material={mats.sidewalk}>
            <ringGeometry
              args={[
                ring.radius + RING_WIDTH / 2,
                ring.radius + RING_WIDTH / 2 + SIDEWALK_WIDTH,
                160,
              ]}
            />
          </mesh>
        </group>
      ))}

      {/* Crosswalk stripes (instanced). */}
      <instancedMesh ref={crosswalkRef} args={[undefined, undefined, stripeCount]} material={mats.paint}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  );
}

/** Build a flat ribbon BufferGeometry of constant width along an XZ polyline,
 *  laid at height y. One mesh for the whole spiral boulevard. */
function buildRibbon(points: Array<[number, number]>, width: number, y: number): THREE.BufferGeometry {
  const half = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = points[i];
    // Tangent from neighbouring points.
    const [px, pz] = points[Math.max(0, i - 1)];
    const [nx, nz] = points[Math.min(n - 1, i + 1)];
    let tx = nx - px;
    let tz = nz - pz;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    // Perpendicular in XZ.
    const ox = -tz * half;
    const oz = tx * half;
    positions.push(x + ox, y, z + oz);
    positions.push(x - ox, y, z - oz);
    if (i < n - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}
