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

    // City-limit clamps, per mode:
    //  - fly: anchor the free camera to a sphere around origin so it never
    //    leaves the city.
    //  - orbit: with right-drag panning enabled the orbit TARGET can travel,
    //    so we instead clamp the target to within the city disc (and near the
    //    ground). The camera then stays bounded via min/maxDistance. This lets
    //    you pan the centre out to the city edge without the old sphere clamp
    //    fighting the pan.
    //  - walk: skipped entirely (lib/collision owns the bounds).
    if (fly && camera.position.length() > CAMERA_MAX_DISTANCE) {
      camera.position.setLength(CAMERA_MAX_DISTANCE);
    } else if (!fly && !walk) {
      const controls = orbitRef.current;
      if (controls) {
        const t = controls.target;
        const horiz = Math.hypot(t.x, t.z);
        const maxT = CITY_OUTER_RADIUS * 0.92;
        if (horiz > maxT) {
          const s = maxT / horiz;
          t.x *= s;
          t.z *= s;
          controls.update();
        }
        if (t.y < 0 || t.y > 250) {
          t.y = Math.min(250, Math.max(0, t.y));
          controls.update();
        }
      }
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
      // Right-drag pans the camera centre across the city; left-drag orbits,
      // wheel/middle zooms. screenSpacePanning=false glides the pan along the
      // ground plane (map-like) instead of tilting up into the sky.
      enablePan
      screenSpacePanning={false}
      panSpeed={0.9}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
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
