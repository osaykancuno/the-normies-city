"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useCity } from "@/lib/store";
import {
  joinPresence,
  localWalker,
  type RemotePresence,
} from "@/lib/presence";
import { presenceEnabled } from "@/lib/firebase";

// Ghost presence: render OTHER visitors walking the city. Each remote walker is
// a billboarded plane textured with their chosen Normie face (sampled from the
// shared atlas — no upstream dependency) plus a faint "#id" nameplate. Purely
// visual co-presence: no interaction, no collision.
//
// This component also OWNS the presence channel: it publishes the local
// walker's pose (written each frame into localWalker by WalkControls) on a
// ~7 Hz throttle, and subscribes to everyone else. When presence is disabled
// (no databaseURL configured) it renders nothing and never touches Firebase.

const EYE_HEIGHT = 9; // match WalkControls eye level so ghosts read at your height
const AVATAR_SIZE = 18;
const PUBLISH_MS = 140; // ~7 Hz
const CELL_UV = 40 / 4000;

export default function Ghosts() {
  const avatarNormieId = useCity((s) => s.avatarNormieId);
  const avatarRef = useRef(avatarNormieId);
  avatarRef.current = avatarNormieId;

  const [peers, setPeers] = useState<RemotePresence[]>([]);

  // Join the presence channel once. Publish own pose on a throttle; receive
  // peers. Disabled cleanly when no RTDB URL is set.
  useEffect(() => {
    if (!presenceEnabled()) return;
    const handle = joinPresence(setPeers);
    const timer = setInterval(() => {
      if (!localWalker.active) return;
      handle.publish({
        x: localWalker.x,
        z: localWalker.z,
        heading: localWalker.heading,
        normieId: avatarRef.current,
      });
    }, PUBLISH_MS);
    return () => {
      clearInterval(timer);
      handle.dispose();
    };
  }, []);

  if (!presenceEnabled() || peers.length === 0) return null;

  return (
    <group>
      {peers.map((p) => (
        <Ghost key={p.id} presence={p} />
      ))}
    </group>
  );
}

function Ghost({ presence }: { presence: RemotePresence }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Atlas texture (shared with the building facades).
  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load("/atlas.png", (t) => {
      t.flipY = false;
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      setAtlas(t);
    });
  }, []);

  const material = useMemo(() => {
    const col = presence.normieId % 100;
    const row = Math.floor(presence.normieId / 100);
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uOffset: { value: new THREE.Vector2(col * CELL_UV, row * CELL_UV) },
        uCellUv: { value: CELL_UV },
        uHasAtlas: { value: atlas ? 1 : 0 },
      },
      vertexShader: GHOST_VERT,
      fragmentShader: GHOST_FRAG,
      transparent: true,
      depthWrite: false,
    });
  }, [atlas, presence.normieId]);

  // Target position from the latest presence packet; we lerp toward it so
  // motion reads smooth between ~7 Hz updates.
  const target = useRef(new THREE.Vector3(presence.x, EYE_HEIGHT, presence.z));
  target.current.set(presence.x, EYE_HEIGHT, presence.z);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.lerp(target.current, 0.18);
    // Billboard: face the camera on the horizontal plane.
    g.lookAt(camera.position.x, g.position.y, camera.position.z);
  });

  return (
    <group ref={groupRef} position={[presence.x, EYE_HEIGHT, presence.z]}>
      <mesh material={material}>
        <planeGeometry args={[AVATAR_SIZE, AVATAR_SIZE]} />
      </mesh>
      <Text
        position={[0, AVATAR_SIZE * 0.72, 0]}
        fontSize={3.4}
        color="#e3e5e4"
        outlineWidth={0.3}
        outlineColor="#1a1b1d"
        anchorX="center"
        anchorY="middle"
      >
        {`#${presence.normieId}`}
      </Text>
    </group>
  );
}

const GHOST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Same brand quantisation the building facades use, plus a soft circular mask
// so the avatar reads as a floating token rather than a hard square.
const GHOST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uOffset;
uniform float uCellUv;
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
  float r = length(vUv - 0.5);
  float mask = smoothstep(0.5, 0.46, r);
  // A faint ring outline.
  float ring = smoothstep(0.5, 0.47, r) - smoothstep(0.47, 0.44, r);
  color = mix(color, BRAND_ON, ring * 0.5);
  gl_FragColor = vec4(color, mask);
}
`;
