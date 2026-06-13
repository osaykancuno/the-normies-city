"use client";

import { useMemo } from "react";
import { buildStreetNetwork } from "@/lib/streets";

// Ground-level street network: radial avenues + concentric ring roads.
// Purely cosmetic + for orientation — buildings are never moved. Rendered just
// above the ground plane (y≈0.6) in brand-monochrome so it reads as a faint
// "city plan" from the orbit view and as walkable avenues at street level.

const BRAND_ON = "#48494b";
const BRAND_OFF = "#e3e5e4";
const ROAD_Y = 0.6;
const CENTRELINE_Y = 0.7;

export default function Streets() {
  const net = useMemo(() => buildStreetNetwork(), []);

  return (
    <group>
      {/* Radial avenues — flat planes laid along each spoke. */}
      {net.avenues.map((a, i) => (
        <group key={`av-${i}`}>
          <mesh
            rotation={[-Math.PI / 2, 0, a.rotation]}
            position={[a.x, ROAD_Y, a.z]}
          >
            <planeGeometry args={[a.length, a.width]} />
            <meshStandardMaterial color={BRAND_ON} roughness={1} />
          </mesh>
          {/* Faint dashed centre line. */}
          <mesh
            rotation={[-Math.PI / 2, 0, a.rotation]}
            position={[a.x, CENTRELINE_Y, a.z]}
          >
            <planeGeometry args={[a.length, 1.4]} />
            <meshBasicMaterial color={BRAND_OFF} transparent opacity={0.35} />
          </mesh>
        </group>
      ))}

      {/* Concentric ring roads — thin flat rings. */}
      {net.rings.map((r, i) => (
        <mesh
          key={`ring-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, ROAD_Y, 0]}
        >
          <ringGeometry args={[r.length - r.width / 2, r.length + r.width / 2, 128]} />
          <meshStandardMaterial color={BRAND_ON} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
