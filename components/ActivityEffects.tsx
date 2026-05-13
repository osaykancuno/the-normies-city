"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useCity } from "@/lib/store";
import type { ActivityEvent } from "@/lib/types";

// In-world event visualisation. Strictly brand-monochrome: every effect uses
// BRAND_OFF against the dark scene so each new event reads clearly from any orbit
// distance. Differentiation comes from SHAPE and MOTION:
//
//   burn      → expanding wireframe spheres + ground ring + tall beacon
//   transform → counter-rotating wireframe cubes + tall beacon
//   transfer  → curved arc from sender's building to receiver's building +
//               a beacon over each endpoint

interface BurnEffect {
  kind: "burn";
  x: number;
  y: number;
  z: number;
  bornAt: number;
}
interface XformEffect {
  kind: "transform";
  x: number;
  y: number;
  z: number;
  bornAt: number;
}
interface TransferEffect {
  kind: "transfer";
  from: THREE.Vector3;
  to: THREE.Vector3;
  bornAt: number;
}

type Effect = BurnEffect | XformEffect | TransferEffect;

const LIFETIME = 5.0;
const BEACON_HEIGHT = 460;
const BRAND_OFF = new THREE.Color("#e3e5e4");

interface EffectGeometry {
  sphere: THREE.SphereGeometry;
  cube: THREE.BoxGeometry;
  beacon: THREE.CylinderGeometry;
  ring: THREE.TorusGeometry;
  arc: THREE.TubeGeometry;
}

export default function ActivityEffects() {
  const activity = useCity((s) => s.activity);
  const buildingsByAddress = useCity((s) => s.buildingsByAddress);
  const buildings = useCity((s) => s.buildings);
  const effectsRef = useRef<Effect[]>([]);
  const seenRef = useRef(new Set<string>());
  const groupRef = useRef<THREE.Group>(null);

  // Lookup: tokenId → its current holder building (via state, not directly in store).
  const buildingForTokenId = (tokenId: number) => {
    // Search holder buildings whose tokenIds include this token.
    for (const b of buildings) {
      if (b.kind === "holder" && b.tokenIds.includes(tokenId)) return b;
    }
    for (const b of buildings) {
      if (b.kind === "burned" && b.tokenId === tokenId) return b;
    }
    return null;
  };

  const geom = useMemo<EffectGeometry>(
    () => ({
      sphere: new THREE.SphereGeometry(20, 16, 16),
      cube: new THREE.BoxGeometry(32, 32, 32),
      beacon: new THREE.CylinderGeometry(4, 4, BEACON_HEIGHT, 8, 1, true),
      ring: new THREE.TorusGeometry(24, 1.6, 6, 32),
      // Unit-length straight tube; arc effects build their own curve at spawn.
      arc: new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)),
        1,
        1
      ),
    }),
    []
  );

  // ── Spawn new effects ──
  // Cap the active set hard at 12 — beyond that the scene is unreadable. Also skip
  // events that are already "old" (>4 s since they landed in the activity feed): when
  // the page first opens we receive a backlog from /api/burns and /api/transfers, and
  // without this guard the entire backlog would explode visually all at once.
  const SPAWN_MAX_AGE_MS = 4_000;
  const MAX_LIVE_EFFECTS = 12;
  const nowMs = Date.now();
  for (const ev of activity) {
    const key = eventKey(ev);
    if (seenRef.current.has(key)) continue;
    seenRef.current.add(key);
    if (nowMs - ev.receivedAt > SPAWN_MAX_AGE_MS) continue;

    if (ev.kind === "transfer") {
      // Movement arc: from sender's holder building → receiver's holder building.
      const fromAddr = ev.from?.toLowerCase();
      const toAddr = ev.to?.toLowerCase();
      const fromB = fromAddr ? buildingsByAddress.get(fromAddr) : null;
      const toB = toAddr ? buildingsByAddress.get(toAddr) : null;
      // Fall back to the building that currently owns the token, if either endpoint
      // isn't a known holder (e.g., brand-new wallet).
      const fallback = buildingForTokenId(ev.tokenId);
      const fromPt = fromB
        ? new THREE.Vector3(fromB.x, fromB.y + fromB.height / 2, fromB.z)
        : fallback
          ? new THREE.Vector3(fallback.x, fallback.y + fallback.height / 2, fallback.z)
          : null;
      const toPt = toB
        ? new THREE.Vector3(toB.x, toB.y + toB.height / 2, toB.z)
        : fallback
          ? new THREE.Vector3(fallback.x, fallback.y + fallback.height / 2, fallback.z)
          : null;
      if (!fromPt || !toPt) continue;
      effectsRef.current.push({
        kind: "transfer",
        from: fromPt,
        to: toPt,
        bornAt: performance.now() / 1000,
      });
    } else {
      const targetId =
        ev.kind === "burn" ? Number(ev.commit.receiverTokenId) : ev.tokenId;
      const b = buildingForTokenId(targetId);
      if (!b) continue;
      effectsRef.current.push({
        kind: ev.kind,
        x: b.x,
        y: b.y + b.height / 2,
        z: b.z,
        bornAt: performance.now() / 1000,
      });
    }
    if (effectsRef.current.length > MAX_LIVE_EFFECTS) effectsRef.current.shift();
  }

  // Stable index so each Effect keeps the same scene-graph child across frames. Without
  // this the previous code popped the LAST child when any (potentially middle) effect
  // expired, leaving the wrong mesh animating for the wrong event and producing
  // stuck wireframe artefacts.
  const meshKeysRef = useRef<symbol[]>([]);
  const effectKeysRef = useRef<symbol[]>([]);

  useFrame(() => {
    // Same monotonic timebase used for `bornAt` (performance.now is consistent across
    // the page lifetime and immune to wall-clock jumps).
    const nowSec = performance.now() / 1000;

    // Drop expired effects (and their stable keys in lockstep).
    const fresh: Effect[] = [];
    const freshKeys: symbol[] = [];
    for (let i = 0; i < effectsRef.current.length; i++) {
      const e = effectsRef.current[i];
      if (nowSec - e.bornAt < LIFETIME) {
        fresh.push(e);
        freshKeys.push(effectKeysRef.current[i] ?? Symbol());
      }
    }
    // Assign keys to any newly-added effects that don't have one yet.
    while (freshKeys.length < fresh.length) freshKeys.push(Symbol());
    effectsRef.current = fresh;
    effectKeysRef.current = freshKeys;

    const group = groupRef.current;
    if (!group) return;

    // Drop scene-graph children whose key no longer appears in the fresh keys.
    const aliveKeySet = new Set(effectKeysRef.current);
    for (let i = group.children.length - 1; i >= 0; i--) {
      if (!aliveKeySet.has(meshKeysRef.current[i])) {
        const sub = group.children[i] as THREE.Group;
        disposeGroup(sub); // removes from parent
        meshKeysRef.current.splice(i, 1);
      }
    }
    // Add children for any effect key that doesn't yet have a mesh.
    const meshKeySet = new Set(meshKeysRef.current);
    for (let i = 0; i < effectsRef.current.length; i++) {
      const k = effectKeysRef.current[i];
      if (meshKeySet.has(k)) continue;
      const sub = buildEffectGroup(effectsRef.current[i], geom);
      group.add(sub);
      meshKeysRef.current.push(k);
    }

    // Animate by lookup: pair each effect with the child that has its key.
    const keyToChild = new Map<symbol, THREE.Group>();
    for (let i = 0; i < group.children.length; i++) {
      keyToChild.set(meshKeysRef.current[i], group.children[i] as THREE.Group);
    }
    effectsRef.current.forEach((e, i) => {
      const sub = keyToChild.get(effectKeysRef.current[i]);
      if (!sub) return;
      const t = (nowSec - e.bornAt) / LIFETIME;
      animateEffect(sub, e, t);
    });
  });

  return <group ref={groupRef} />;
}

function eventKey(ev: ActivityEvent): string {
  if (ev.kind === "burn") return `burn:${ev.commit.commitId}`;
  if (ev.kind === "transform") return `xform:${ev.commitId}:${ev.tokenId}`;
  return `xfer:${ev.txHash}:${ev.tokenId}`;
}

function buildEffectGroup(e: Effect, geom: EffectGeometry): THREE.Group {
  const g = new THREE.Group();

  if (e.kind === "transfer") {
    // Build a tube along a quadratic Bezier curve arcing high between endpoints.
    const apex = e.from.clone().lerp(e.to, 0.5);
    const distance = e.from.distanceTo(e.to);
    apex.y += Math.min(900, 200 + distance * 0.25);
    const curve = new THREE.QuadraticBezierCurve3(e.from, apex, e.to);
    const tubeGeom = new THREE.TubeGeometry(curve, 48, 4, 6, false);
    const tube = new THREE.Mesh(
      tubeGeom,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    tube.name = "arc";
    g.add(tube);
    // Mark each endpoint with a small beacon.
    for (const [name, pt] of [
      ["beaconA", e.from],
      ["beaconB", e.to],
    ] as const) {
      const beacon = new THREE.Mesh(
        geom.beacon,
        new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
      );
      beacon.position.copy(pt);
      beacon.position.y += BEACON_HEIGHT / 2 + 10;
      beacon.name = name;
      g.add(beacon);
    }
    return g;
  }

  // burn / transform — anchored above a single building.
  g.position.set(e.x, e.y, e.z);

  const beacon = new THREE.Mesh(
    geom.beacon,
    new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
  );
  beacon.position.y = BEACON_HEIGHT / 2 + 10;
  beacon.name = "beacon";
  g.add(beacon);

  if (e.kind === "burn") {
    const a = new THREE.Mesh(
      geom.sphere,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true, wireframe: true })
    );
    a.name = "shapeA";
    g.add(a);
    const b = new THREE.Mesh(
      geom.sphere,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true, wireframe: true })
    );
    b.name = "shapeB";
    g.add(b);
    const r = new THREE.Mesh(
      geom.ring,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    r.rotation.x = Math.PI / 2;
    r.position.y = 8;
    r.name = "ring";
    g.add(r);
  } else {
    const c = new THREE.Mesh(
      geom.cube,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true, wireframe: true })
    );
    c.name = "shapeA";
    g.add(c);
    const c2 = new THREE.Mesh(
      geom.cube,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true, wireframe: true })
    );
    c2.name = "shapeB";
    g.add(c2);
  }

  return g;
}

function animateEffect(sub: THREE.Group, e: Effect, t: number) {
  const life = 1 - t;

  if (e.kind === "transfer") {
    const arc = sub.getObjectByName("arc") as THREE.Mesh | undefined;
    if (arc) {
      const mat = arc.material as THREE.MeshBasicMaterial;
      const fadeIn = Math.min(1, t / 0.2);
      const fadeOut = Math.min(1, Math.max(0, 1 - (t - 0.6) / 0.4));
      mat.opacity = fadeIn * fadeOut * 0.95;
    }
    for (const n of ["beaconA", "beaconB"] as const) {
      const beacon = sub.getObjectByName(n) as THREE.Mesh | undefined;
      if (beacon) {
        const mat = beacon.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(1, t / 0.1) * life * 0.9;
        beacon.scale.x = beacon.scale.z = 1 + Math.sin(t * 16) * 0.2;
      }
    }
    return;
  }

  const beacon = sub.getObjectByName("beacon") as THREE.Mesh | undefined;
  if (beacon) {
    const mat = beacon.material as THREE.MeshBasicMaterial;
    const fadeIn = Math.min(1, t / 0.15);
    const fadeOut = Math.min(1, Math.max(0, 1 - (t - 0.6) / 0.4));
    mat.opacity = fadeIn * fadeOut * 0.9;
    beacon.scale.x = beacon.scale.z = 1 + Math.sin(t * 16) * 0.18;
  }

  if (e.kind === "burn") {
    const a = sub.getObjectByName("shapeA") as THREE.Mesh | undefined;
    const b = sub.getObjectByName("shapeB") as THREE.Mesh | undefined;
    const ring = sub.getObjectByName("ring") as THREE.Mesh | undefined;
    if (a) {
      a.position.y = 20 + t * 80;
      a.scale.setScalar(1 + t * 4);
      (a.material as THREE.MeshBasicMaterial).opacity = life * 0.95;
    }
    if (b) {
      b.position.y = 20 + t * 60;
      b.scale.setScalar(0.4 + t * 2.6);
      (b.material as THREE.MeshBasicMaterial).opacity = life * 0.6;
    }
    if (ring) {
      ring.scale.setScalar(1 + t * 6);
      (ring.material as THREE.MeshBasicMaterial).opacity = life * 0.85;
    }
  } else {
    const a = sub.getObjectByName("shapeA") as THREE.Mesh | undefined;
    const b = sub.getObjectByName("shapeB") as THREE.Mesh | undefined;
    if (a) {
      a.position.y = 30 + Math.sin(t * 8) * 6;
      a.rotation.set(t * 1.8, t * 2.4, 0);
      a.scale.setScalar(0.6 + t * 1.4);
      (a.material as THREE.MeshBasicMaterial).opacity = life * 0.95;
    }
    if (b) {
      b.position.y = 30 + Math.sin(t * 8 + Math.PI) * 6;
      b.rotation.set(-t * 1.4, -t * 2.0, 0);
      b.scale.setScalar(0.3 + t * 2.2);
      (b.material as THREE.MeshBasicMaterial).opacity = life * 0.45;
    }
  }
}

function disposeGroup(g: THREE.Group) {
  g.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => mat.dispose());
    }
    // Dispose tube geometries that were created per-effect.
    if ((m.geometry as THREE.BufferGeometry | undefined)?.dispose && m.name === "arc") {
      m.geometry.dispose();
    }
  });
  g.parent?.remove(g);
}
