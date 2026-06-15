"use client";

import { useEffect, useMemo, useRef } from "react";
import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import { useCity } from "@/lib/store";
import { buildCollider, type CityCollider } from "@/lib/collision";
import { localWalker } from "@/lib/presence";

// First-person street-level explorer. Mounted by CameraControls only when
// viewMode === "walk". Uses drei PointerLockControls for mouse-look and a
// manual WASD handler for movement, with spatial-hash collision against the
// city's buildings. Additive: orbit/fly are untouched.

// Tunables — all the "feel" of the mode lives here.
const EYE_HEIGHT = 17; // camera height above ground — standing-person eye level
const WALK_SPEED = 55; // world units / second
const SPRINT_MULT = 1.8; // hold Shift to sprint
const SPAWN = new THREE.Vector3(0, EYE_HEIGHT, 500); // plaza perimeter, looking inward

const TALK_RADIUS = 70; // how close you must be to an awakened building to talk

export default function WalkControls() {
  const { camera } = useThree();
  const buildings = useCity((s) => s.buildings);
  const awakenedSet = useCity((s) => s.awakenedSet);
  const setViewMode = useCity((s) => s.setViewMode);
  const setNearbyAgentId = useCity((s) => s.setNearbyAgentId);
  const chatTokenId = useCity((s) => s.chatTokenId);
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
  // Mark the shared walker pose active so the presence publisher broadcasts it.
  useEffect(() => {
    camera.position.copy(SPAWN);
    camera.lookAt(0, EYE_HEIGHT, 0);
    localWalker.active = true;
    const ctrl = lockRef.current;
    const id = setTimeout(() => {
      try {
        ctrl?.lock();
      } catch {
        // lock() can throw if the gesture chain was broken — the user can
        // click again; harmless.
      }
    }, 0);
    return () => {
      clearTimeout(id);
      localWalker.active = false;
      useCity.getState().setNearbyAgentId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC (pointer-lock release) exits back to orbit — UNLESS a chat is open, in
  // which case the unlock was intentional (free the cursor to type) and we stay
  // in walk mode.
  const onUnlock = () => {
    if (useCity.getState().chatTokenId != null) return;
    setViewMode("orbit");
  };

  // Opening a chat frees the cursor; closing it re-locks so walking resumes.
  useEffect(() => {
    const ctrl = lockRef.current;
    if (!ctrl) return;
    if (chatTokenId != null) {
      try { ctrl.unlock(); } catch {}
    } else {
      // small delay so the click that closed the panel doesn't immediately
      // re-trigger; lock() needs the document focused.
      const id = setTimeout(() => {
        try { ctrl.lock(); } catch {}
      }, 0);
      return () => clearTimeout(id);
    }
  }, [chatTokenId]);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const proxAccum = useRef(0);

  useFrame((_, delta) => {
    const k = keys.current;
    const dt = Math.min(delta, 0.05); // clamp huge frames (tab refocus)

    // Keep the camera pinned to eye height regardless of look pitch.
    camera.position.y = EYE_HEIGHT;

    // Publish the local pose for ghost presence (read on a throttle by Ghosts).
    localWalker.x = camera.position.x;
    localWalker.z = camera.position.z;
    localWalker.heading = Math.atan2(
      camera.getWorldDirection(forward.current).x,
      forward.current.z,
    );

    // Proximity to awakened buildings (~6 Hz). Find the nearest awakened holder
    // within talk range and expose it so the HUD can offer "talk to {name}".
    proxAccum.current += dt;
    if (proxAccum.current >= 0.15) {
      proxAccum.current = 0;
      let bestId: number | null = null;
      let bestD = Infinity;
      for (const b of buildings) {
        if (b.kind !== "holder") continue;
        const dx = camera.position.x - b.x;
        const dz = camera.position.z - b.z;
        const d2 = dx * dx + dz * dz;
        const reach = TALK_RADIUS + b.footprint / 2;
        if (d2 > reach * reach || d2 >= bestD) continue;
        let awakenedTok = -1;
        for (const id of b.tokenIds) {
          if (awakenedSet.has(id)) { awakenedTok = id; break; }
        }
        if (awakenedTok < 0) continue;
        bestD = d2;
        bestId = awakenedTok;
      }
      setNearbyAgentId(bestId);
    }

    // Freeze movement while a chat is open (cursor is freed for typing).
    if (chatTokenId != null) return;

    let mx = 0;
    let mz = 0;
    if (k.w) mz += 1;
    if (k.s) mz -= 1;
    if (k.d) mx += 1;
    if (k.a) mx -= 1;

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
