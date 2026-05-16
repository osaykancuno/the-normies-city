"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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
  tokenId: number; // which Normie is travelling — used to sample its atlas slot
  from: THREE.Vector3;
  to: THREE.Vector3;
  bornAt: number;
}
interface NewHolderEffect {
  kind: "newHolder";
  address: string; // resolved at spawn-time to the new building
  x: number;
  y: number; // building centre Y
  z: number;
  footprint: number;
  height: number;
  bornAt: number;
}
interface AwakenedEffect {
  kind: "awakened";
  tokenId: number;
  x: number;
  y: number; // building centre Y
  z: number;
  footprint: number;
  height: number;
  bornAt: number;
}

type Effect = BurnEffect | XformEffect | TransferEffect | NewHolderEffect | AwakenedEffect;

// Burn/transform/transfer flash by quickly (~5 s). A NEW holder is a community
// milestone — give it longer screen time so people see who joined while watching.
const LIFETIME_DEFAULT = 5.0;
const LIFETIME_NEW_HOLDER = 30.0;
const LIFETIME_AWAKENED = 12.0;
const lifetimeOf = (kind: Effect["kind"]) =>
  kind === "newHolder"
    ? LIFETIME_NEW_HOLDER
    : kind === "awakened"
      ? LIFETIME_AWAKENED
      : LIFETIME_DEFAULT;

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
  const { camera } = useThree();

  // Load atlas once — it's the same texture rendered on the building facades. Used
  // by the flying-Normie effect to sample a 40×40 slot of the right tokenId.
  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load("/atlas.png", (tex) => {
      tex.flipY = false;
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      setAtlas(tex);
    });
  }, []);

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

    if (ev.kind === "newHolder") {
      const b = buildingsByAddress.get(ev.address.toLowerCase());
      if (!b) continue;
      effectsRef.current.push({
        kind: "newHolder",
        address: ev.address.toLowerCase(),
        x: b.x,
        y: b.y,
        z: b.z,
        footprint: b.footprint,
        height: b.height,
        bornAt: performance.now() / 1000,
      });
    } else if (ev.kind === "awakened") {
      // Place the effect on the building currently holding the awakened token.
      const b = buildingForTokenId(ev.tokenId);
      if (!b || b.kind !== "holder") continue;
      effectsRef.current.push({
        kind: "awakened",
        tokenId: ev.tokenId,
        x: b.x,
        y: b.y,
        z: b.z,
        footprint: b.footprint,
        height: b.height,
        bornAt: performance.now() / 1000,
      });
    } else if (ev.kind === "transfer") {
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
        tokenId: ev.tokenId,
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
      if (nowSec - e.bornAt < lifetimeOf(e.kind)) {
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
      const sub = buildEffectGroup(effectsRef.current[i], geom, atlas);
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
      const t = (nowSec - e.bornAt) / lifetimeOf(e.kind);
      animateEffect(sub, e, t, camera);
    });
  });

  // Newly-built effect groups need the atlas attached so the flier shader can sample
  // the right Normie. We patch references after the fact via group.userData.
  useEffect(() => {
    if (!atlas) return;
    const group = groupRef.current;
    if (!group) return;
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.ShaderMaterial | undefined;
      if (mat && mesh.name === "flier" && mat.uniforms?.uAtlas) {
        mat.uniforms.uAtlas.value = atlas;
        mat.needsUpdate = true;
      }
    });
  }, [atlas]);

  // Stash atlas on the group so buildEffectGroup can pick it up via closure.
  if (groupRef.current) (groupRef.current as THREE.Group & { __atlas?: THREE.Texture }).__atlas = atlas ?? undefined;

  return <group ref={groupRef} />;
}

function eventKey(ev: ActivityEvent): string {
  if (ev.kind === "burn") return `burn:${ev.commit.commitId}`;
  if (ev.kind === "transform") return `xform:${ev.commitId}:${ev.tokenId}`;
  if (ev.kind === "newHolder") return `new:${ev.address}`;
  if (ev.kind === "awakened") return `awake:${ev.tokenId}`;
  return `xfer:${ev.txHash}:${ev.tokenId}`;
}

// GLSL helpers for the flier — same brand quantisation used by the building shader so
// the travelling Normie reads identical to the pixels it leaves behind on the facade.
const FLIER_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FLIER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uOffset;
uniform float uCellUv;
uniform float uOpacity;
uniform float uHasAtlas;
varying vec2 vUv;
const vec3 BRAND_ON  = vec3(0.282, 0.286, 0.294);
const vec3 BRAND_OFF = vec3(0.890, 0.898, 0.894);
void main() {
  vec2 fUv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 color = BRAND_OFF;
  if (uHasAtlas > 0.5) {
    vec4 px = texture2D(uAtlas, uOffset + fUv * uCellUv);
    float on = step(0.5, 1.0 - px.r);
    color = mix(BRAND_OFF, BRAND_ON, on);
  }
  // Soft circular halo around the pixel art so the flier reads from a distance.
  float r = length(vUv - 0.5);
  float halo = smoothstep(0.55, 0.45, r) * 0.25;
  color = mix(BRAND_OFF, color, smoothstep(0.5, 0.48, r));
  gl_FragColor = vec4(color, uOpacity * smoothstep(0.55, 0.42, r));
}
`;
const FLIER_SIZE = 38;

function buildEffectGroup(
  e: Effect,
  geom: EffectGeometry,
  atlas: THREE.Texture | null
): THREE.Group {
  const g = new THREE.Group();

  if (e.kind === "transfer") {
    // Quadratic Bezier curve from sender to receiver; arc apex scales with distance.
    const apex = e.from.clone().lerp(e.to, 0.5);
    const distance = e.from.distanceTo(e.to);
    apex.y += Math.min(900, 200 + distance * 0.25);
    const curve = new THREE.QuadraticBezierCurve3(e.from, apex, e.to);

    // Faint trail tube (was the main visual; now it's the "track" the Normie follows).
    const tubeGeom = new THREE.TubeGeometry(curve, 48, 2.5, 6, false);
    const tube = new THREE.Mesh(
      tubeGeom,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    tube.name = "arc";
    g.add(tube);

    // ── FLYING NORMIE ──
    // Quad plane sampling the atlas at the right slot for this tokenId, animated
    // along the curve by animateEffect. Anchors the visual identity to a real NFT.
    const col = e.tokenId % 100;
    const row = Math.floor(e.tokenId / 100);
    const cellUv = 40 / 4000;
    const flierMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uOffset: { value: new THREE.Vector2(col * cellUv, row * cellUv) },
        uCellUv: { value: cellUv },
        uOpacity: { value: 1.0 },
        uHasAtlas: { value: atlas ? 1.0 : 0.0 },
      },
      vertexShader: FLIER_VERT,
      fragmentShader: FLIER_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const flier = new THREE.Mesh(new THREE.PlaneGeometry(FLIER_SIZE, FLIER_SIZE), flierMat);
    flier.name = "flier";
    // Stash the curve so the animator can sample positions along it.
    (flier.userData as { curve?: THREE.QuadraticBezierCurve3 }).curve = curve;
    // Start at the sender so first frame doesn't snap from origin.
    flier.position.copy(e.from);
    g.add(flier);

    // Beacons at each endpoint — slightly thinner than before so the flier dominates.
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

  // ── NEW HOLDER ── celebrate a wallet joining the community. Combination of:
  // scaffold wireframe wrapping the building during construction, halo ring
  // spinning above the roof, tall beacon, and a slow pulse ring on the ground.
  if (e.kind === "newHolder") {
    g.position.set(e.x, 0, e.z);
    const fp = e.footprint;
    const h = e.height;

    // Scaffold: thin wireframe box ~footprint+padding wrapping the rising tower.
    const scaffoldGeom = new THREE.BoxGeometry(fp + 22, h + 60, fp + 22);
    const scaffold = new THREE.Mesh(
      scaffoldGeom,
      new THREE.MeshBasicMaterial({
        color: BRAND_OFF,
        transparent: true,
        wireframe: true,
      })
    );
    scaffold.position.y = h / 2 + 4;
    scaffold.name = "scaffold";
    g.add(scaffold);

    // Halo ring rotating at the building top — visible from above too.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(fp * 0.85, 2.2, 8, 64),
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    halo.position.y = h + 18;
    halo.rotation.x = Math.PI / 2;
    halo.name = "halo";
    g.add(halo);

    // Tall beacon so the new building can be spotted from anywhere in the city.
    const beacon = new THREE.Mesh(
      geom.beacon,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    beacon.position.y = h + BEACON_HEIGHT / 2 + 20;
    beacon.name = "beacon";
    g.add(beacon);

    // Ground pulse — outward ring at the building's base.
    const pulse = new THREE.Mesh(
      new THREE.TorusGeometry(fp * 0.6, 1.8, 6, 64),
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    pulse.position.y = 2;
    pulse.rotation.x = Math.PI / 2;
    pulse.name = "pulse";
    g.add(pulse);

    return g;
  }

  // ── AWAKENED ── celebrate a Normie binding to its ERC-8004 agent identity.
  // Visual: rising signal beam from the rooftop + an expanding halo ring that
  // settles at the top of the building. Distinct from newHolder by the
  // single beam (vs scaffold box) and the halo at the roof (vs ground pulse).
  if (e.kind === "awakened") {
    g.position.set(e.x, 0, e.z);
    const h = e.height;
    const fp = e.footprint;

    const beam = new THREE.Mesh(
      geom.beacon,
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    beam.position.y = h + BEACON_HEIGHT / 2 + 10;
    beam.name = "beam";
    g.add(beam);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(fp * 0.7, 1.6, 8, 64),
      new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
    );
    halo.position.y = h + 14;
    halo.rotation.x = Math.PI / 2;
    halo.name = "halo";
    g.add(halo);

    // Top burst — four short orthogonal lines at the roof, signal spreading.
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, fp * 0.45, 4),
        new THREE.MeshBasicMaterial({ color: BRAND_OFF, transparent: true })
      );
      arm.position.y = h + 18;
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = (i / 4) * Math.PI * 2;
      arm.name = `arm${i}`;
      g.add(arm);
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

function animateEffect(sub: THREE.Group, e: Effect, t: number, camera: THREE.Camera) {
  const life = 1 - t;

  if (e.kind === "newHolder") {
    // 30 s lifecycle: 0–0.05 fade-in, 0.05–0.9 hold (with motion), 0.9–1 fade-out.
    const fadeIn = Math.min(1, t / 0.05);
    const fadeOut = Math.min(1, Math.max(0, 1 - (t - 0.9) / 0.1));
    const baseOp = fadeIn * fadeOut;

    const scaffold = sub.getObjectByName("scaffold") as THREE.Mesh | undefined;
    if (scaffold) {
      const mat = scaffold.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * 0.55;
      // gentle vertical pulse so the scaffold feels "live".
      scaffold.scale.y = 1 + Math.sin(t * 18) * 0.01;
    }
    const halo = sub.getObjectByName("halo") as THREE.Mesh | undefined;
    if (halo) {
      halo.rotation.z += 0.04; // approximate per-frame rotation
      const mat = halo.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * (0.7 + 0.3 * Math.sin(t * 18));
    }
    const beacon = sub.getObjectByName("beacon") as THREE.Mesh | undefined;
    if (beacon) {
      const mat = beacon.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * 0.75;
      beacon.scale.x = beacon.scale.z = 1 + Math.sin(t * 24) * 0.18;
    }
    const pulse = sub.getObjectByName("pulse") as THREE.Mesh | undefined;
    if (pulse) {
      // Expand outward and fade — repeats throughout lifetime.
      const phase = (t * 3) % 1; // 3 pulses across 30 s
      pulse.scale.setScalar(1 + phase * 3);
      const mat = pulse.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * (1 - phase) * 0.7;
    }
    return;
  }

  if (e.kind === "awakened") {
    // 12 s lifecycle: 0–0.1 fade-in, 0.1–0.85 hold w/ motion, 0.85–1 fade-out.
    const fadeIn = Math.min(1, t / 0.1);
    const fadeOut = Math.min(1, Math.max(0, 1 - (t - 0.85) / 0.15));
    const baseOp = fadeIn * fadeOut;

    const beam = sub.getObjectByName("beam") as THREE.Mesh | undefined;
    if (beam) {
      const mat = beam.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * 0.85;
      beam.scale.x = beam.scale.z = 1 + Math.sin(t * 18) * 0.18;
    }
    const halo = sub.getObjectByName("halo") as THREE.Mesh | undefined;
    if (halo) {
      // Expand outward then settle.
      const settle = Math.min(1, t / 0.35);
      halo.scale.setScalar(1 + (1 - settle) * 1.6 + 0.05 * Math.sin(t * 12));
      halo.rotation.z += 0.03;
      const mat = halo.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * 0.85;
    }
    for (let i = 0; i < 4; i++) {
      const arm = sub.getObjectByName(`arm${i}`) as THREE.Mesh | undefined;
      if (!arm) continue;
      const mat = arm.material as THREE.MeshBasicMaterial;
      // Stagger four pulses across the lifetime so the burst feels alive.
      const phase = (t * 4 + i * 0.25) % 1;
      arm.scale.x = 1 + phase * 1.5;
      mat.opacity = baseOp * (1 - phase) * 0.9;
    }
    return;
  }

  if (e.kind === "transfer") {
    // Faint trail arc — backdrop for the flying Normie.
    const arc = sub.getObjectByName("arc") as THREE.Mesh | undefined;
    if (arc) {
      const mat = arc.material as THREE.MeshBasicMaterial;
      const fadeIn = Math.min(1, t / 0.15);
      const fadeOut = Math.min(1, Math.max(0, 1 - (t - 0.7) / 0.3));
      mat.opacity = fadeIn * fadeOut * 0.55;
    }
    // Flying Normie — travels along the Bezier curve from sender to receiver,
    // arriving roughly at t=0.8 then fading out at the destination.
    const flier = sub.getObjectByName("flier") as THREE.Mesh | undefined;
    if (flier) {
      const data = flier.userData as { curve?: THREE.QuadraticBezierCurve3 };
      const curve = data.curve;
      if (curve) {
        const travelT = Math.min(1, t / 0.8); // arrival at 80 % of lifetime
        const eased = travelT < 0.5
          ? 2 * travelT * travelT
          : 1 - Math.pow(-2 * travelT + 2, 2) / 2;
        const p = curve.getPoint(eased);
        flier.position.copy(p);
        // Billboard: always face the camera so the bitmap is readable.
        flier.lookAt(camera.position);
        // Subtle pulse on arrival.
        const arriveBoost = 1 + 0.2 * Math.max(0, Math.sin((1 - travelT) * Math.PI * 4));
        flier.scale.setScalar(arriveBoost);
      }
      const mat = flier.material as THREE.ShaderMaterial;
      // Hold full opacity through travel, then fade after arrival.
      const opacity =
        t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
      mat.uniforms.uOpacity.value = opacity;
    }
    for (const n of ["beaconA", "beaconB"] as const) {
      const beacon = sub.getObjectByName(n) as THREE.Mesh | undefined;
      if (beacon) {
        const mat = beacon.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(1, t / 0.1) * life * 0.75;
        beacon.scale.x = beacon.scale.z = 1 + Math.sin(t * 16) * 0.18;
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
