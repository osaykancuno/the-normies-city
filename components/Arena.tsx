"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useCity } from "@/lib/store";

const BRAND_OFF = "#e3e5e4";
const BRAND_ON = "#48494b";
const BRAND_INK = "#1a1b1d";

// "Graffiti wall" landmark inside the plaza — entry portal for the TAG BATTLE
// mini-game. Sits on the SE diagonal so it never overlaps with the 4 cardinal
// stat pillars (N/E/S/W) or the central monument. With the wider plaza the arena
// gets pushed slightly outward for breathing room.
const POS: [number, number, number] = [225, 0, -225];
const ROT_Y = -Math.PI / 4; // front (+Z) faces plaza centre

export default function Arena() {
  const setArenaOpen = useCity((s) => s.setArenaOpen);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const mat = pulseRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) {
      mat.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.0));
    }
  });

  const open = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    setArenaOpen(true);
  };
  const showPointer = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  };
  const hidePointer = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "";
  };

  return (
    <group
      position={POS}
      rotation={[0, ROT_Y, 0]}
      onClick={open}
      onPointerOver={showPointer}
      onPointerOut={hidePointer}
    >
      {/* Floor pad. */}
      <mesh position={[0, 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[52, 48]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      {/* Outer ring on the pad. */}
      <mesh position={[0, 2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[50, 52, 64]} />
        <meshBasicMaterial color={BRAND_OFF} side={THREE.DoubleSide} />
      </mesh>

      {/* Main billboard slab — wider + taller to match the new plaza. */}
      <mesh position={[0, 46, 0]}>
        <boxGeometry args={[104, 80, 8]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      {/* Top crown rail. */}
      <mesh position={[0, 90, 0]}>
        <boxGeometry args={[108, 6, 12]} />
        <meshBasicMaterial color={BRAND_OFF} />
      </mesh>
      {/* Two support posts behind the slab. */}
      <mesh position={[-44, 23, -6]}>
        <boxGeometry args={[6, 46, 6]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      <mesh position={[44, 23, -6]}>
        <boxGeometry args={[6, 46, 6]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>

      {/* Spray-painted plate inset (recessed canvas where the tag lives). */}
      <mesh position={[0, 46, 4.1]}>
        <planeGeometry args={[92, 64]} />
        <meshBasicMaterial color={BRAND_INK} />
      </mesh>
      {/* Animated outer frame around the plate. */}
      <mesh ref={pulseRef} position={[0, 46, 4.05]}>
        <ringGeometry args={[44, 45.5, 96]} />
        <meshBasicMaterial color={BRAND_OFF} transparent />
      </mesh>

      {/* Title + subtitle + call-to-action — all centered on x=0. */}
      <Text
        position={[0, 64, 4.2]}
        fontSize={13}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.05}
        maxWidth={88}
      >
        TAG BATTLE
      </Text>
      <Text
        position={[0, 48, 4.2]}
        fontSize={3.6}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.18}
        maxWidth={88}
      >
        GRAFFITI · CREWS · TERRITORY
      </Text>
      <Text
        position={[0, 32, 4.2]}
        fontSize={4.8}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        maxWidth={88}
      >
        ▸ CLICK TO PLAY
      </Text>

      {/* Spray-can drips suggesting fresh paint at the bottom of the canvas. */}
      {[0.2, 0.4, 0.55, 0.8].map((u, i) => (
        <mesh key={i} position={[(u - 0.5) * 80, 14, 4.15]}>
          <planeGeometry args={[2, 2.4 + (i % 2) * 1.8]} />
          <meshBasicMaterial color={BRAND_OFF} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}
