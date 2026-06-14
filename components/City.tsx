"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Grid } from "@react-three/drei";
import { useCity } from "@/lib/store";
import { CITY_OUTER_RADIUS } from "@/lib/layout";
import { currentSkyState, type SkyState } from "@/lib/daynight";
import InstancedNormies from "./InstancedNormies";
import AwakenedAntennas from "./AwakenedAntennas";
import Streets from "./Streets";
import StreetLamps from "./StreetLamps";
import CityProps from "./CityProps";
import Ghosts from "./Ghosts";
import CameraControls from "./CameraControls";
import ActivityEffects from "./ActivityEffects";
import LiveDataLoader from "./LiveDataLoader";
import Plaza from "./Plaza";
import Arena from "./Arena";
import CityLife from "./CityLife";

const BRAND_INK = "#1a1b1d";
const BRAND_OFF = "#e3e5e4";
const BRAND_ON = "#48494b";
const BRAND_GRID = "#2c2d2f";
const GROUND_EXTENT = CITY_OUTER_RADIUS * 2.2;

export default function City() {
  const setTraits = useCity((s) => s.setTraits);
  const setHolders = useCity((s) => s.setHolders);
  const setBurned = useCity((s) => s.setBurned);
  const tickLifecycle = useCity((s) => s.tickLifecycle);
  const buildings = useCity((s) => s.buildings);
  const refreshNonce = useCity((s) => s.refreshNonce);

  // Sky/light state derived from the user's local time. Refresh every minute so the
  // day-night transition feels real but doesn't burn CPU.
  const [sky, setSky] = useState<SkyState>(() => currentSkyState());
  useEffect(() => {
    const id = setInterval(() => setSky(currentSkyState()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tickLifecycle(), 600);
    return () => clearInterval(id);
  }, [tickLifecycle]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadOnce() {
      try {
        const res = await fetch("/normies-traits.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTraits(data);
        }
      } catch {}
      try {
        const res = await fetch("/api/burned-tokens");
        if (res.ok) {
          const ids: number[] = await res.json();
          if (!cancelled) setBurned(new Set(ids));
        }
      } catch {}
      await loadHolders();
    }

    // Live holder snapshot: try the Alchemy-backed /api/holders first (edge
    // cached 5 min, but reflects on-chain reality). Fall back to the static
    // public/holders.json baked at deploy time when the live route is down.
    async function loadHolders() {
      try {
        const res = await fetch("/api/holders", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.byToken)) {
            setHolders(data.byToken);
            return;
          }
        }
      } catch {}
      try {
        const res = await fetch("/holders.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.byToken)) setHolders(data.byToken);
        }
      } catch {}
    }

    loadOnce();
    const tick = async () => {
      await loadHolders();
      if (!cancelled) pollTimer = setTimeout(tick, 60_000);
    };
    pollTimer = setTimeout(tick, 60_000);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
    // Including refreshNonce: clicking the top-bar RefreshButton triggers a
    // re-mount of this effect, so the holders snapshot is re-fetched
    // immediately instead of waiting for the next 60 s tick.
  }, [setTraits, setHolders, setBurned, refreshNonce]);

  // Brand-monochrome sky colour interpolated by brightness.
  const skyColor = useMemo(() => {
    const ink = new THREE.Color(BRAND_INK);
    const on = new THREE.Color(BRAND_ON);
    const off = new THREE.Color(BRAND_OFF);
    // Two-stage mix so dawn rises slowly off ink, then climbs into off-tones at noon.
    const lerpA = Math.min(1, sky.brightness * 1.5);
    const lerpB = Math.max(0, (sky.brightness - 0.55) * 2.2);
    const c = ink.clone().lerp(on, lerpA).lerp(off, lerpB * 0.5);
    return c;
  }, [sky]);

  return (
    <Canvas
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [780, 540, 780], fov: 55, near: 1, far: 14000 }}
    >
      <SkyDriver color={skyColor} sky={sky} />
      <color attach="background" args={[skyColor]} />
      <hemisphereLight
        args={[skyColor, BRAND_ON, sky.hemisphereIntensity]}
      />
      <directionalLight
        position={[sky.sunDir[0] * 1500, Math.max(200, sky.sunDir[1] * 2000), sky.sunDir[2] * 1500]}
        intensity={sky.directionalIntensity}
        color={BRAND_OFF}
      />
      <Ground />
      <Streets />
      {buildings.length > 0 && <StreetLamps />}
      {buildings.length > 0 && <CityProps />}
      <Horizon skyColor={skyColor} />
      <Stars />
      <Suspense fallback={null}>
        {buildings.length > 0 && <InstancedNormies />}
        {buildings.length > 0 && <AwakenedAntennas />}
        <Plaza />
        <Arena />
        <ActivityEffects />
        <CityLife />
        <Ghosts />
      </Suspense>
      <CameraControls />
      <LiveDataLoader />
    </Canvas>
  );
}

/** Updates the scene fog colour and density to match the current sky so the void
 *  outside the city blends seamlessly into the sky tone instead of dropping to black. */
function SkyDriver({ color, sky }: { color: THREE.Color; sky: SkyState }) {
  const { scene } = useThree();
  useEffect(() => {
    if (!scene.fog) {
      scene.fog = new THREE.Fog(color, CITY_OUTER_RADIUS * 0.7, CITY_OUTER_RADIUS * 1.6);
    } else if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(color);
      // Tighter fog at night to hide the void; slightly looser at day.
      scene.fog.near = CITY_OUTER_RADIUS * (0.55 + sky.brightness * 0.25);
      scene.fog.far = CITY_OUTER_RADIUS * (1.3 + sky.brightness * 0.5);
    }
  }, [color, sky, scene]);
  return null;
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <circleGeometry args={[CITY_OUTER_RADIUS, 96]} />
        <meshStandardMaterial color={BRAND_INK} roughness={1} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[GROUND_EXTENT, GROUND_EXTENT]}
        cellSize={70}
        sectionSize={350}
        cellColor={BRAND_GRID}
        sectionColor={BRAND_ON}
        cellThickness={0.6}
        sectionThickness={1.0}
        fadeDistance={CITY_OUTER_RADIUS * 0.95}
        fadeStrength={2.2}
        infiniteGrid={false}
        followCamera={false}
      />
    </>
  );
}

/** Inward-facing cylinder painted with the live sky colour — its base sits at the
 *  city edge, so the horizon visually closes the world without a visible wall. */
function Horizon({ skyColor }: { skyColor: THREE.Color }) {
  const ref = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const mat = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.color.copy(skyColor);
  }, [skyColor]);
  return (
    <mesh ref={ref} position={[0, 380, 0]}>
      <cylinderGeometry args={[CITY_OUTER_RADIUS * 1.4, CITY_OUTER_RADIUS * 1.4, 800, 64, 1, true]} />
      <meshBasicMaterial color={BRAND_INK} side={THREE.BackSide} />
    </mesh>
  );
}

/** A faint scatter of "stars" — really pinpoints rendered on a high dome. Visible only
 *  when the sky is dark; daylight washes them out. */
function Stars() {
  const meshRef = useRef<THREE.Points>(null);
  const geom = useMemo(() => {
    const N = 700;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1) * 0.45; // upper hemisphere
      const r = CITY_OUTER_RADIUS * 1.35;
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 200;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  // Fade stars in/out based on sky brightness via uniform.
  useFrame(() => {
    const mat = meshRef.current?.material as THREE.PointsMaterial | undefined;
    if (mat) {
      const sky = currentSkyState();
      mat.opacity = Math.max(0, 0.85 - sky.brightness * 1.2);
    }
  });

  return (
    <points ref={meshRef} geometry={geom}>
      <pointsMaterial color={BRAND_OFF} size={4} sizeAttenuation transparent />
    </points>
  );
}
