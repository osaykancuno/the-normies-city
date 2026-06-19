"use client";

import { useEffect, useMemo, useRef } from "react";
import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import { useCity } from "@/lib/store";
import { buildCollider, type CityCollider } from "@/lib/collision";
import { localWalker } from "@/lib/presence";
import { touchInput, isTouchDevice } from "@/lib/touchinput";

const LOOK_SENS = 0.0042; // radians of look per pixel of touch drag
const PITCH_LIMIT = 1.35; // clamp up/down look

// First-person street-level explorer. Mounted by CameraControls only when
// viewMode === "walk". Uses drei PointerLockControls for mouse-look and a
// manual WASD handler for movement, with spatial-hash collision against the
// city's buildings. Additive: orbit/fly are untouched.

// Tunables — all the "feel" of the mode lives here.
const EYE_HEIGHT = 9; // camera eye level — kept well below the roof of a 1-NFT
                      // house (15 u tall) so even the smallest buildings tower
const WALK_SPEED = 55; // world units / second
const SPRINT_MULT = 1.8; // hold Shift to sprint
// Spawn inside the open plaza, just past the central obelisk's base (radius
// ≈108), facing the BURN MEMORIAL to the south (z=+430). The obelisk stays
// behind you so the view is unobstructed, and the memorial is framed by the
// skyline rising beyond the plaza — the civic "entry vista" of the city.
const SPAWN = new THREE.Vector3(0, EYE_HEIGHT, 140);
// Look target: the memorial wall, lifted ~70u so the camera tilts gently up to
// take in the full monument and the towers behind it.
const SPAWN_LOOK = new THREE.Vector3(0, 72, 430);

const TALK_RADIUS = 70; // how close you must be to an awakened building to talk

export default function WalkControls() {
  const { camera, gl } = useThree();
  const buildings = useCity((s) => s.buildings);
  const awakenedSet = useCity((s) => s.awakenedSet);
  const setViewMode = useCity((s) => s.setViewMode);
  const setNearbyAgentId = useCity((s) => s.setNearbyAgentId);
  const setWalkLocked = useCity((s) => s.setWalkLocked);
  const chatTokenId = useCity((s) => s.chatTokenId);
  const lockRef = useRef<PointerLockControlsImpl>(null);
  const wasLocked = useRef(false);

  // On touch devices there's no pointer lock: we drive a manual yaw/pitch FPS
  // camera from the on-screen look pad + joystick instead.
  const isTouch = useMemo(() => isTouchDevice(), []);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const prevFov = useRef<number | null>(null);

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

  // Position the camera at street level on enter. Pointer lock is acquired by
  // CLICKING the scene (a real user gesture — programmatic lock() right after a
  // React state-driven mount is rejected by Chrome). drei locks on canvas click
  // by default, and we add an explicit handler too for reliability. WASD works
  // regardless of lock; the mouse looks once locked.
  useEffect(() => {
    camera.position.copy(SPAWN);
    camera.lookAt(SPAWN_LOOK);
    localWalker.active = true;

    // Touch: no pointer lock — seed yaw/pitch from the spawn look and mark the
    // view "locked" so the HUD/voice/proximity behave as in the desktop path.
    if (isTouch) {
      const e = euler.current.setFromQuaternion(camera.quaternion, "YXZ");
      yaw.current = e.y;
      pitch.current = e.x;
      touchInput.mx = 0;
      touchInput.mz = 0;
      touchInput.lookDX = 0;
      touchInput.lookDY = 0;
      // Widen the FOV on phones: at the default 55° vertical, a tall portrait
      // viewport ends up with a very narrow HORIZONTAL FOV (tunnel vision), so
      // everything feels right in your face. ~82° vertical opens it up.
      const cam = camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        prevFov.current = cam.fov;
        cam.fov = 82;
        cam.updateProjectionMatrix();
      }
      setWalkLocked(true);
      return () => {
        if (prevFov.current != null && cam.isPerspectiveCamera) {
          cam.fov = prevFov.current;
          cam.updateProjectionMatrix();
          prevFov.current = null;
        }
        localWalker.active = false;
        useCity.getState().setNearbyAgentId(null);
        useCity.getState().setWalkLocked(false);
      };
    }

    const dom = gl.domElement;
    const tryLock = () => {
      if (useCity.getState().chatTokenId != null) return; // don't grab lock under the chat
      try {
        lockRef.current?.lock();
      } catch {
        /* browser may reject; the next click retries */
      }
    };
    // Auto-lock on enter (transient user activation from the ENTER ON FOOT
    // click is still valid for a few seconds) so the mouse looks immediately —
    // no extra click needed. A canvas click is kept as a silent fallback in
    // case the browser rejects the programmatic lock.
    const auto = setTimeout(tryLock, 60);
    dom.addEventListener("click", tryLock);

    return () => {
      clearTimeout(auto);
      dom.removeEventListener("click", tryLock);
      localWalker.active = false;
      useCity.getState().setNearbyAgentId(null);
      useCity.getState().setWalkLocked(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track lock state. ESC (real unlock after having been locked) exits to orbit;
  // the initial unlocked state and chat-driven unlocks do NOT exit.
  const onLock = () => {
    wasLocked.current = true;
    setWalkLocked(true);
  };
  const onUnlock = () => {
    setWalkLocked(false);
    if (useCity.getState().chatTokenId != null) return; // unlock to type — stay
    if (!wasLocked.current) return; // initial unlocked state — ignore
    wasLocked.current = false;
    setViewMode("orbit");
  };

  // Opening a chat frees the cursor to type.
  useEffect(() => {
    if (chatTokenId != null) {
      try { lockRef.current?.unlock(); } catch {}
    }
  }, [chatTokenId]);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const proxAccum = useRef(0);

  useFrame((_, delta) => {
   try {
    const k = keys.current;
    const dt = Math.min(delta, 0.05); // clamp huge frames (tab refocus)

    // Touch look: apply accumulated drag to yaw/pitch and orient the camera
    // (the desktop path lets PointerLockControls own the orientation instead).
    if (isTouch) {
      if (touchInput.lookDX !== 0 || touchInput.lookDY !== 0) {
        yaw.current -= touchInput.lookDX * LOOK_SENS;
        pitch.current -= touchInput.lookDY * LOOK_SENS;
        pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current));
        touchInput.lookDX = 0;
        touchInput.lookDY = 0;
      }
      camera.quaternion.setFromEuler(
        euler.current.set(pitch.current, yaw.current, 0, "YXZ"),
      );
    }

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
    if (isTouch) {
      // Left joystick vector (mz>0 forward, mx>0 strafe right).
      mx = touchInput.mx;
      mz = touchInput.mz;
    } else {
      if (k.w) mz += 1;
      if (k.s) mz -= 1;
      if (k.d) mx += 1;
      if (k.a) mx -= 1;
    }

    if (Math.abs(mx) < 0.001 && Math.abs(mz) < 0.001) return;

    // Camera-forward projected onto the ground plane.
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    // Right = forward × up.
    right.current.crossVectors(forward.current, camera.up).normalize();

    const speed = WALK_SPEED * (!isTouch && k.shift ? SPRINT_MULT : 1) * dt;
    const dx = (forward.current.x * mz + right.current.x * mx) * speed;
    const dz = (forward.current.z * mz + right.current.z * mx) * speed;

    const fromX = camera.position.x;
    const fromZ = camera.position.z;
    const next = collider.resolve(fromX, fromZ, fromX + dx, fromZ + dz);
    camera.position.x = next.x;
    camera.position.z = next.z;
   } catch {
    // Never let a stray per-frame error halt the render loop (which would
    // freeze the whole scene — no movement, no mouse-look).
   }
  });

  // Touch has no pointer lock — the on-screen WalkTouchControls drive look/move.
  if (isTouch) return null;
  return <PointerLockControls ref={lockRef} onLock={onLock} onUnlock={onUnlock} />;
}
