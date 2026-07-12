"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useCity } from "@/lib/store";
import { CITY_OUTER_RADIUS } from "@/lib/layout";

// A ring of animated sea beyond the city limit, dotted with a few yachts. It is
// the gateway to NORMIES YACHT CLUB — clicking the water (or a yacht, or the
// sign) opens that sister project in a new tab. Purely cosmetic + a link; never
// interferes with the city. Renders in every view but ignores clicks in walk
// mode (where the crosshair/joystick own input).

const YACHT_CLUB_URL = "https://normiesyachtclub.com/";

const SEA_INNER = CITY_OUTER_RADIUS * 0.95; // tucks just under the ground edge
const SEA_OUTER = CITY_OUTER_RADIUS * 1.7; // fades out before the horizon wall
const SEA_Y = -1.2;

function openYachtClub() {
  if (useCity.getState().viewMode === "walk") return; // don't hijack walk input
  if (typeof window !== "undefined") window.open(YACHT_CLUB_URL, "_blank", "noopener");
}
const setPointer = (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation();
  if (typeof document !== "undefined") document.body.style.cursor = "pointer";
};
const clearPointer = () => {
  if (typeof document !== "undefined") document.body.style.cursor = "";
};

export default function Sea() {
  return (
    <group>
      <Water />
      <Yachts />
      <YachtSign />
    </group>
  );
}

function Water() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uInner: { value: SEA_INNER },
          uOuter: { value: SEA_OUTER },
          uDeep: { value: new THREE.Color("#0d1218") },
          uCrest: { value: new THREE.Color("#243039") },
        },
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
      }),
    [],
  );

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SEA_Y, 0]}
      material={material}
      onClick={(e) => {
        e.stopPropagation();
        openYachtClub();
      }}
      onPointerOver={setPointer}
      onPointerOut={clearPointer}
    >
      <ringGeometry args={[SEA_INNER, SEA_OUTER, 180, 1]} />
    </mesh>
  );
}

function Yachts() {
  // Deterministic scatter of yachts in the visible sea ring.
  const yachts = useMemo(() => {
    const R = SEA_INNER + 300; // near the coast, clear of the horizon fade
    const N = 7;
    const out: { x: number; z: number; rot: number; phase: number }[] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.6;
      const r = R + (((i * 97) % 40) - 20) * 6; // spread +/- ~120u
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        rot: -a + Math.PI / 2,
        phase: i * 1.7,
      });
    }
    return out;
  }, []);

  return (
    <group>
      {yachts.map((y, i) => (
        <Yacht key={i} {...y} />
      ))}
    </group>
  );
}

function Yacht({ x, z, rot, phase }: { x: number; z: number; rot: number; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    const g = ref.current;
    if (!g) return;
    const t = s.clock.elapsedTime + phase;
    g.position.y = SEA_Y + 2 + Math.sin(t * 1.3) * 1.6;
    g.rotation.z = Math.sin(t * 1.1) * 0.05;
    g.rotation.x = Math.cos(t * 0.9) * 0.03;
  });
  return (
    <group
      ref={ref}
      position={[x, SEA_Y + 2, z]}
      rotation={[0, rot, 0]}
      onClick={(e) => {
        e.stopPropagation();
        openYachtClub();
      }}
      onPointerOver={setPointer}
      onPointerOut={clearPointer}
      scale={2.4}
    >
      {/* hull */}
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[16, 4, 6]} />
        <meshStandardMaterial color="#e3e5e4" roughness={0.7} />
      </mesh>
      {/* bow wedge */}
      <mesh position={[9, 2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[4.2, 4, 4.2]} />
        <meshStandardMaterial color="#e3e5e4" roughness={0.7} />
      </mesh>
      {/* cabin */}
      <mesh position={[-1, 5.4, 0]}>
        <boxGeometry args={[7, 3.4, 4.4]} />
        <meshStandardMaterial color="#48494b" roughness={0.8} />
      </mesh>
      {/* mast */}
      <mesh position={[3, 8, 0]}>
        <boxGeometry args={[0.6, 9, 0.6]} />
        <meshStandardMaterial color="#e3e5e4" />
      </mesh>
    </group>
  );
}

// A billboarded sign floating over the sea so visitors know the water is a door.
function YachtSign() {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const pos = useMemo(() => {
    const R = SEA_INNER + 300;
    const a = 0.6; // over the first yacht cluster
    return new THREE.Vector3(Math.cos(a) * R, SEA_Y + 48, Math.sin(a) * R);
  }, []);
  useFrame(() => {
    if (ref.current) ref.current.lookAt(camera.position.x, ref.current.position.y, camera.position.z);
  });
  return (
    <group ref={ref} position={pos}>
      <Text
        fontSize={22}
        color="#e3e5e4"
        anchorX="center"
        anchorY="middle"
        outlineWidth={1}
        outlineColor="#0d1218"
        onClick={(e) => {
          e.stopPropagation();
          openYachtClub();
        }}
        onPointerOver={setPointer}
        onPointerOut={clearPointer}
      >
        ⛵ NORMIES YACHT CLUB →
      </Text>
    </group>
  );
}

const SEA_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SEA_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uInner;
uniform float uOuter;
uniform vec3 uDeep;
uniform vec3 uCrest;
varying vec3 vW;
void main() {
  float d = length(vW.xz);
  float w1 = sin(vW.x * 0.008 + uTime * 0.9);
  float w2 = sin(vW.z * 0.010 - uTime * 0.7);
  float w3 = sin((vW.x + vW.z) * 0.006 + uTime * 1.3);
  float h = 0.5 + 0.5 * ((w1 * w2 + w3) * 0.5);
  vec3 c = mix(uDeep, uCrest, smoothstep(0.55, 1.0, h));
  // Fade out near the outer edge (blend into horizon/sky) and soften the coast.
  float a = 1.0 - smoothstep(uOuter * 0.7, uOuter, d);
  a *= smoothstep(uInner, uInner + 50.0, d);
  gl_FragColor = vec4(c, a);
}
`;
