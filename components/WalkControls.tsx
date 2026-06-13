"use client";

import { useEffect, useMemo, useRef } from "react";
import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import { useCity } from "@/lib/store";
import { buildCollider, type CityCollider } from "@/lib/collision";

// First-person street-level explorer. Mounted by CameraControls only when
// viewMode === "walk". Uses drei PointerLockControls for mouse-look and a
// manual WASD handler for movement, with spatial-hash collision against the
// city's buildings. Additive: orbit/fly are untouched.

// Tunables — all the "feel" of the mode lives here.
const EYE_HEIGHT = 7; // camera height above ground (ground sits at y≈0)
const WALK_SPEED = 55; // world units / second
const SPRINT_MULT = 1.8; // hold Shift to sprint
const SPAWN = new THREE.Vector3(0, EYE_HEIGHT, 500); // plaza perimeter, looking inward

export default function WalkControls() {
  const { camera } = useThree();
  const buildings = useCity((s) => s.buildings);
  const setViewMode = useCity((s) => s.setViewMode);
  const lockRef = useRef<PointerLockControlsImpl>(null);

  // Rebuild the collider whenever the layout changes (transfer/burn). buildings
  // is a stable reference until a recompute, so this memo is cheap.
  const collider: CityCollider = useMemo(() => buildCollider(buildings), [buildings]);

  // Keyboard state.
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false });
  useEffect(() => {
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    const set = (e: KeyboardEvent, v: boolean) => {
      switch (e.key.toLowerCase()) {
        case "w":
        case "arrowup":
          keys.current.w = v;
          break;
        case "a":
        case "arrowleft":
          keys.current.a = v;
          break;
        case "s":
        case "arrowdown":
          keys.current.s = v;
          break;
        case "d":
        case "arrowright":
          keys.current.d = v;
          break;
        case "shift":
          keys.current.shift = v;
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Position the camera at street level on enter; auto-request pointer lock.
  useEffect(() => {
    camera.position.copy(SPAWN);
    camera.lookAt(0, EYE_HEIGHT, 0);
    const ctrl = lockRef.current;
    const id = setTimeout(() => {
      try {
        ctrl?.lock();
      } catch {
        // lock() can throw if the gesture chain was broken — the user can
        // click again; harmless.
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC (pointer-lock release) exits back to orbit.
  const onUnlock = () => setViewMode("orbit");

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const k = keys.current;
    const dt = Math.min(delta, 0.05); // clamp huge frames (tab refocus)
    let mx = 0;
    let mz = 0;
    if (k.w) mz += 1;
    if (k.s) mz -= 1;
    if (k.d) mx += 1;
    if (k.a) mx -= 1;

    // Keep the camera pinned to eye height regardless of look pitch.
    camera.position.y = EYE_HEIGHT;

    if (mx === 0 && mz === 0) return;

    // Camera-forward projected onto the ground plane.
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    // Right = forward × up.
    right.current.crossVectors(forward.current, camera.up).normalize();

    const speed = WALK_SPEED * (k.shift ? SPRINT_MULT : 1) * dt;
    const dx = (forward.current.x * mz + right.current.x * mx) * speed;
    const dz = (forward.current.z * mz + right.current.z * mx) * speed;

    const fromX = camera.position.x;
    const fromZ = camera.position.z;
    const next = collider.resolve(fromX, fromZ, fromX + dx, fromZ + dz);
    camera.position.x = next.x;
    camera.position.z = next.z;
  });

  return <PointerLockControls ref={lockRef} onUnlock={onUnlock} />;
}
