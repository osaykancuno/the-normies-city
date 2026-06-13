"use client";

import { useEffect, useRef } from "react";
import { OrbitControls, FlyControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useCity } from "@/lib/store";
import { CITY_OUTER_RADIUS } from "@/lib/layout";
import WalkControls from "./WalkControls";

// Keep the orbit camera inside the city. The user can roam freely but never
// orbits out past the city limit — gives the feeling of "always inside".
const CAMERA_MIN_DISTANCE = 140;
const CAMERA_MAX_DISTANCE = CITY_OUTER_RADIUS * 1.05;

export default function CameraControls() {
  const viewMode = useCity((s) => s.viewMode);
  const setViewMode = useCity((s) => s.setViewMode);
  const flyTo = useCity((s) => s.flyTo);
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  const fly = viewMode === "fly";
  const walk = viewMode === "walk";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // F toggles fly. Ignored while walking — walk mode owns the keyboard
      // (WASD) and exits via ESC / its own toggle.
      if ((e.key === "f" || e.key === "F") && viewMode !== "walk") {
        setViewMode(viewMode === "fly" ? "orbit" : "fly");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, setViewMode]);

  const animRef = useRef<{
    fromCam: THREE.Vector3;
    toCam: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    started: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (!flyTo) return;
    const controls = orbitRef.current;
    // Distance scaled to the target building size, but capped so we never leave
    // the city limit.
    const desiredOffset = Math.max(220, flyTo.size * 3.0);
    const offset = Math.min(desiredOffset, CAMERA_MAX_DISTANCE * 0.75);
    const target = new THREE.Vector3(flyTo.x, flyTo.y, flyTo.z);
    const camTarget = new THREE.Vector3(
      flyTo.x + offset * 0.7,
      flyTo.y + offset * 0.9,
      flyTo.z + offset * 0.7
    );
    // Clamp the camera target to inside the city sphere.
    const dist = camTarget.length();
    if (dist > CAMERA_MAX_DISTANCE) camTarget.multiplyScalar(CAMERA_MAX_DISTANCE / dist);
    animRef.current = {
      fromCam: camera.position.clone(),
      toCam: camTarget,
      fromTarget: controls?.target.clone() ?? new THREE.Vector3(),
      toTarget: target,
      started: performance.now(),
      duration: 900,
    };
  }, [flyTo, camera]);

  useFrame(() => {
    const anim = animRef.current;
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.started) / anim.duration);
      const e = easeInOut(t);
      camera.position.lerpVectors(anim.fromCam, anim.toCam, e);
      const controls = orbitRef.current;
      if (controls) {
        controls.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
        controls.update();
      }
      if (t >= 1) animRef.current = null;
    }

    // Hard clamp: if the camera somehow drifted outside the city sphere (e.g. via
    // post-fly orbiting), pull it back. This is the camera-based "city limit".
    // Skip in walk mode — a ground-walking camera has its own horizontal-radius
    // clamp (lib/collision) and this spherical clamp would yank it upward.
    if (!walk && camera.position.length() > CAMERA_MAX_DISTANCE) {
      camera.position.setLength(CAMERA_MAX_DISTANCE);
    }
  });

  if (walk) {
    return <WalkControls />;
  }
  if (fly) {
    return <FlyControls movementSpeed={600} rollSpeed={0.6} dragToLook />;
  }
  return (
    <OrbitControls
      ref={orbitRef}
      makeDefault
      enableDamping
      enablePan={false}
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={CAMERA_MIN_DISTANCE}
      maxDistance={CAMERA_MAX_DISTANCE}
    />
  );
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
