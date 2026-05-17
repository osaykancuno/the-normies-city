"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import useSWR from "swr";
import { useCity } from "@/lib/store";
import Shops from "./Shops";
import type { ActivityEvent, HistoryStats } from "@/lib/types";

const BRAND_OFF = "#e3e5e4";
const BRAND_ON = "#48494b";
const BRAND_INK = "#1a1b1d";

// Plaza dimensions — wider footprint, taller / chunkier furniture so the centre
// reads clearly from anywhere in the city without the user having to fly close.
// Expanded from 380 → 460 to give the community-shop ring at radius 380 a
// clean perimeter band around the inner stat pillars (260) and event totems.
const PLAZA_RADIUS = 460;
const STAT_RADIUS = 260;
// Monumentation must dominate even the tallest whale skyscraper (~546u).
const MONUMENT_TOTAL_HEIGHT = 820;
const STAT_PILLAR_HEIGHT = 380;
const STAT_PILLAR_WIDTH = 140;
const STAT_PILLAR_DEPTH = 24;
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Compass-aligned positions for the 4 stat pillars. Each rotation makes the pillar's
// +Z face point toward the plaza centre, so the text on the +Z side is readable from
// the central monument.
const COMPASS = [
  { pos: [0, 0, -STAT_RADIUS] as const, rotY: 0 },              // north
  { pos: [STAT_RADIUS, 0, 0] as const, rotY: -Math.PI / 2 },    // east
  { pos: [0, 0, STAT_RADIUS] as const, rotY: Math.PI },         // south
  { pos: [-STAT_RADIUS, 0, 0] as const, rotY: Math.PI / 2 },    // west
];

export default function Plaza() {
  const { data: stats } = useSWR<HistoryStats>("/api/stats", fetcher, {
    refreshInterval: 10_000,
  });

  const statCards = [
    { label: "BURN COMMITS", value: stats?.totalBurnCommitments ?? "—" },
    { label: "TOKENS BURNED", value: stats?.totalBurnedTokens ?? "—" },
    { label: "TRANSFORMS", value: stats?.totalTransforms ?? "—" },
    { label: "ACTION POINTS", value: stats?.totalActionPointsDistributed ?? "—" },
  ];

  return (
    <group>
      <PlazaFloor />
      <CentralMonument />
      {COMPASS.map((slot, i) => (
        <StatPillar
          key={i}
          position={slot.pos}
          rotY={slot.rotY}
          label={statCards[i].label}
          value={String(statCards[i].value)}
        />
      ))}
      <Shops />
      <EventTotems />
    </group>
  );
}

function PlazaFloor() {
  return (
    <group>
      {/* Raised circular pad in brand-on so the plaza reads as a hub. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]} receiveShadow>
        <circleGeometry args={[PLAZA_RADIUS, 96]} />
        <meshStandardMaterial color={BRAND_ON} roughness={1} />
      </mesh>
      {/* Outer ring in brand-off — defines the plaza edge crisply. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.5, 0]}>
        <ringGeometry args={[PLAZA_RADIUS - 6, PLAZA_RADIUS, 96]} />
        <meshBasicMaterial color={BRAND_OFF} side={THREE.DoubleSide} />
      </mesh>
      {/* A subtle mid ring for visual rhythm, halfway between centre and edge. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.55, 0]}>
        <ringGeometry args={[PLAZA_RADIUS * 0.55, PLAZA_RADIUS * 0.55 + 1.5, 96]} />
        <meshBasicMaterial color={BRAND_OFF} side={THREE.DoubleSide} transparent opacity={0.45} />
      </mesh>
      {/* Inner ring around the central monument. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.6, 0]}>
        <ringGeometry args={[105, 110, 64]} />
        <meshBasicMaterial color={BRAND_OFF} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function CentralMonument() {
  const titleRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const setBannerOpen = useCity((s) => s.setBannerOpen);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (titleRef.current) titleRef.current.rotation.y = t * 0.16;
    if (haloRef.current) haloRef.current.rotation.y = -t * 0.4;
    if (beaconRef.current) {
      const mat = beaconRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + 0.4 * Math.sin(t * 1.5);
    }
  });

  const openBanner = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    setBannerOpen(true);
  };
  const showPointer = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  };
  const hidePointer = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "";
  };

  // Layout (heights, additive from the ground):
  //   0..16    base disc
  //   16..36   second base disc
  //   36..40   ring step
  //   40..680  tall shaft
  //   680..720 cap drum
  //   720..780 spire cone + beacon
  // The rotating title plate sits at y=440 so it's readable from camera height.
  return (
    <group
      onClick={openBanner}
      onPointerOver={showPointer}
      onPointerOut={hidePointer}
    >
      {/* Stepped base — three tiers of dark/light slabs, scaled to the new plaza. */}
      <mesh position={[0, 9, 0]}>
        <cylinderGeometry args={[100, 108, 18, 48]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      <mesh position={[0, 26, 0]}>
        <cylinderGeometry args={[82, 90, 16, 48]} />
        <meshStandardMaterial color={BRAND_INK} />
      </mesh>
      <mesh position={[0, 38, 0]}>
        <cylinderGeometry args={[68, 70, 4, 48]} />
        <meshBasicMaterial color={BRAND_OFF} />
      </mesh>

      {/* Tall central shaft — slimmer at the top for a classic obelisk silhouette. */}
      <mesh position={[0, 380, 0]}>
        <cylinderGeometry args={[16, 32, 680, 16]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>

      {/* Vertical accent stripes — three thin glowing bands at intervals. */}
      {[200, 400, 580].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[
            22 - i * 1.5,
            22 - i * 1.5,
            1.8,
            16,
          ]} />
          <meshBasicMaterial color={BRAND_OFF} />
        </mesh>
      ))}

      {/* Cap drum — wider plate just below the spire. */}
      <mesh position={[0, 736, 0]}>
        <cylinderGeometry args={[26, 18, 44, 16]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      {/* Bright crown rim on the cap. */}
      <mesh position={[0, 758, 0]}>
        <cylinderGeometry args={[27, 27, 2.4, 16]} />
        <meshBasicMaterial color={BRAND_OFF} />
      </mesh>

      {/* Spire + beacon at the very top. */}
      <mesh position={[0, 785, 0]}>
        <coneGeometry args={[16, 56, 16]} />
        <meshStandardMaterial color={BRAND_OFF} />
      </mesh>
      <mesh ref={beaconRef} position={[0, MONUMENT_TOTAL_HEIGHT - 6, 0]}>
        <sphereGeometry args={[7, 16, 16]} />
        <meshBasicMaterial color={BRAND_OFF} transparent />
      </mesh>

      {/* Slow-rotating halo ring around the spire — flair from afar. */}
      <mesh ref={haloRef} position={[0, 720, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[78, 2, 6, 96]} />
        <meshBasicMaterial color={BRAND_OFF} transparent opacity={0.85} />
      </mesh>

      {/* Rotating 4-faced title plate at readable camera height — anchored exactly
       *  on x=0 + middle so each face reads centered on the shaft. */}
      <group ref={titleRef} position={[0, 460, 0]}>
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((rot, i) => (
          <Text
            key={i}
            position={[0, 0, 34]}
            rotation={[0, rot, 0]}
            fontSize={18}
            color={BRAND_OFF}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.04}
          >
            THE NORMIES CITY
          </Text>
        ))}
      </group>

      {/* "CLICK" call-to-action at base level, easy to spot from ground. */}
      <Text
        position={[0, 56, 78]}
        rotation={[-0.16, 0, 0]}
        fontSize={6.5}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.1}
      >
        CLICK · OPEN CITY HALL
      </Text>
    </group>
  );
}

function StatPillar({
  position,
  rotY,
  label,
  value,
}: {
  position: readonly [number, number, number];
  rotY: number;
  label: string;
  value: string;
}) {
  // Value font auto-shrinks for long numbers; with the new wider pillar we can
  // start at 30 instead of 22 and let SDF text take care of the rest.
  const valStr = String(value);
  const maxValueWidth = STAT_PILLAR_WIDTH - 22;
  const requestedFontSize = 30;
  const widthAtRequested = valStr.length * requestedFontSize * 0.62;
  const valueFont =
    widthAtRequested > maxValueWidth
      ? Math.max(12, maxValueWidth / (valStr.length * 0.62))
      : requestedFontSize;
  const bodyY = STAT_PILLAR_HEIGHT / 2 + 4;

  return (
    <group position={position as unknown as THREE.Vector3Tuple} rotation={[0, rotY, 0]}>
      {/* Pillar body. */}
      <mesh position={[0, bodyY, 0]}>
        <boxGeometry args={[STAT_PILLAR_WIDTH, STAT_PILLAR_HEIGHT, STAT_PILLAR_DEPTH]} />
        <meshStandardMaterial color={BRAND_ON} roughness={1} />
      </mesh>
      {/* Top accent rail. */}
      <mesh position={[0, STAT_PILLAR_HEIGHT + 8, 0]}>
        <boxGeometry args={[STAT_PILLAR_WIDTH + 6, 8, STAT_PILLAR_DEPTH + 6]} />
        <meshBasicMaterial color={BRAND_OFF} />
      </mesh>
      {/* Base plinth. */}
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[STAT_PILLAR_WIDTH + 12, 10, STAT_PILLAR_DEPTH + 10]} />
        <meshStandardMaterial color={BRAND_INK} />
      </mesh>
      {/* Inset display panel on the inward (+Z) face for contrast. */}
      <mesh position={[0, bodyY, STAT_PILLAR_DEPTH / 2 + 0.05]}>
        <planeGeometry args={[STAT_PILLAR_WIDTH - 18, STAT_PILLAR_HEIGHT - 60]} />
        <meshBasicMaterial color={BRAND_INK} />
      </mesh>
      {/* Label band — upper portion of the inset panel. */}
      <Text
        position={[0, STAT_PILLAR_HEIGHT - 70, STAT_PILLAR_DEPTH / 2 + 0.2]}
        fontSize={11}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.18}
        maxWidth={STAT_PILLAR_WIDTH - 24}
      >
        {label}
      </Text>
      {/* Value — auto-sized so long numbers still fit, centred under the label. */}
      <Text
        position={[0, STAT_PILLAR_HEIGHT - 135, STAT_PILLAR_DEPTH / 2 + 0.2]}
        fontSize={valueFont}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        maxWidth={STAT_PILLAR_WIDTH - 22}
      >
        {valStr}
      </Text>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Event totems: one short pillar per recent activity event, arranged in a ring.
// -----------------------------------------------------------------------------

const TOTEM_RADIUS = 200;
const TOTEM_LIFETIME_S = 25;

function EventTotems() {
  const activity = useCity((s) => s.activity);

  // Pick the most-recent events that are still fresh (within lifetime).
  const fresh = useMemo(() => {
    const now = Date.now();
    return activity
      .filter((e) => (now - e.receivedAt) / 1000 < TOTEM_LIFETIME_S)
      .slice(0, 16);
  }, [activity]);

  return (
    <group>
      {fresh.map((ev, idx) => {
        const angle = (idx / 16) * Math.PI * 2;
        const x = Math.cos(angle) * TOTEM_RADIUS;
        const z = Math.sin(angle) * TOTEM_RADIUS;
        const inwardRotY = Math.atan2(-Math.cos(angle), -Math.sin(angle));
        return (
          <EventTotem
            key={`${ev.kind}:${eventKey(ev)}`}
            x={x}
            z={z}
            rotY={inwardRotY}
            event={ev}
          />
        );
      })}
    </group>
  );
}

function EventTotem({
  x,
  z,
  rotY,
  event,
}: {
  x: number;
  z: number;
  rotY: number;
  event: ActivityEvent;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const bornAt = useMemo(() => event.receivedAt / 1000, [event.receivedAt]);

  useFrame(({ clock }) => {
    const now = Date.now() / 1000;
    const age = now - bornAt;
    const life = Math.max(0, 1 - age / TOTEM_LIFETIME_S);
    // Rise quickly in the first second, then linger and fade.
    const rise = Math.min(1, age / 0.9);
    const targetScale = rise * (0.4 + 0.6 * life);
    if (groupRef.current) {
      groupRef.current.scale.y = targetScale;
      groupRef.current.position.y = targetScale * 30;
    }
    if (meshRef.current) {
      // gentle bob
      meshRef.current.position.y = Math.sin(clock.elapsedTime * 2 + bornAt) * 0.6 + 20;
    }
  });

  const symbol =
    event.kind === "burn"
      ? "[X]"
      : event.kind === "transform"
        ? "[#]"
        : event.kind === "newHolder"
          ? "[*]"
          : event.kind === "awakened"
            ? "[O]"
            : "[->]";
  const label =
    event.kind === "burn"
      ? `BURN #${event.commit.receiverTokenId}`
      : event.kind === "transform"
        ? `XFORM #${event.tokenId}`
        : event.kind === "newHolder"
          ? `JOIN #${event.tokenId}`
          : event.kind === "awakened"
            ? `WAKE ${event.name || "#" + event.tokenId}`
            : `MOVE #${event.tokenId}`;

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 20, 0]} ref={meshRef}>
        <boxGeometry args={[18, 40, 8]} />
        <meshStandardMaterial color={BRAND_ON} />
      </mesh>
      <mesh position={[0, 42, 0]}>
        <boxGeometry args={[20, 2, 10]} />
        <meshBasicMaterial color={BRAND_OFF} />
      </mesh>
      <Text
        position={[0, 26, 5]}
        fontSize={3.5}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
      >
        {symbol}
      </Text>
      <Text
        position={[0, 18, 5]}
        fontSize={2.4}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

function eventKey(ev: ActivityEvent): string {
  if (ev.kind === "burn") return ev.commit.commitId;
  if (ev.kind === "transform") return `${ev.commitId}:${ev.tokenId}`;
  if (ev.kind === "newHolder") return `new:${ev.address}`;
  if (ev.kind === "awakened") return `awake:${ev.tokenId}`;
  return `${ev.txHash}:${ev.tokenId}`;
}
