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
// mini-game. Sits at the SE quadrant of the plaza so it never overlaps with the
// 4 cardinal stat pillars or the central monument.
const POS: [number, number, number] = [165, 0, -165];
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
        <circleGeometry args={[40, 32]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      {/* Outer ring on the pad. */}
      <mesh position={[0, 2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[38, 40, 48]} />
        <meshBasicMaterial color={BRAND_OFF} side={THREE.DoubleSide} />
      </mesh>

      {/* Main billboard slab. */}
      <mesh position={[0, 36, 0]}>
        <boxGeometry args={[78, 64, 6]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      {/* Top crown rail. */}
      <mesh position={[0, 70, 0]}>
        <boxGeometry args={[82, 4, 10]} />
        <meshBasicMaterial color={BRAND_OFF} />
      </mesh>
      {/* Two support posts behind the slab. */}
      <mesh position={[-32, 18, -4]}>
        <boxGeometry args={[5, 36, 5]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      <mesh position={[32, 18, -4]}>
        <boxGeometry args={[5, 36, 5]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>

      {/* Spray-painted plate inset (recessed canvas where the tag lives). */}
      <mesh position={[0, 36, 3.1]}>
        <planeGeometry args={[68, 50]} />
        <meshBasicMaterial color={BRAND_INK} />
      </mesh>
      {/* Animated outer frame around the plate. */}
      <mesh ref={pulseRef} position={[0, 36, 3.05]}>
        <ringGeometry args={[34, 35, 64]} />
        <meshBasicMaterial color={BRAND_OFF} transparent />
      </mesh>

      {/* Title + subtitle + call-to-action. */}
      <Text
        position={[0, 50, 3.2]}
        fontSize={9.5}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.05}
      >
        TAG BATTLE
      </Text>
      <Text
        position={[0, 38, 3.2]}
        fontSize={2.8}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        GRAFFITI · CREWS · TERRITORY
      </Text>
      <Text
        position={[0, 26, 3.2]}
        fontSize={3.6}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
      >
        ▸ CLICK TO PLAY
      </Text>

      {/* Spray-can drips suggesting fresh paint at the bottom of the canvas. */}
      {[0.2, 0.4, 0.55, 0.8].map((u, i) => (
        <mesh key={i} position={[(u - 0.5) * 60, 12, 3.15]}>
          <planeGeometry args={[1.6, 2 + (i % 2) * 1.4]} />
          <meshBasicMaterial color={BRAND_OFF} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}
