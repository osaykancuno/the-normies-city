"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Text } from "@react-three/drei";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useCity } from "@/lib/store";

// Data-as-place landmarks: two gallery walls tiled with the real Normie faces.
//   - BURN MEMORIAL — every burned token, rendered dim/sepulchral (south edge).
//   - HALL OF THE AWAKENED — every awakened agent, glowing (north edge).
// Faces come from the shipped atlas (no upstream dependency). Each wall is one
// InstancedMesh (one draw call) of unit planes; a per-instance atlas-cell
// attribute selects the face. Click a face to open that Normie.

const CELL_UV = 40 / 4000;
const TILE = 3.2;
const TARGET_WIDTH = 220;
const COLS = Math.max(1, Math.floor(TARGET_WIDTH / TILE));
const BRAND_OFF = "#e3e5e4";

export default function Monuments() {
  const burned = useCity((s) => s.burned);
  const awakenedSet = useCity((s) => s.awakenedSet);
  const awakenedVersion = useCity((s) => s.awakenedVersion);
  const zombieSet = useCity((s) => s.zombieSet);
  const zombieVersion = useCity((s) => s.zombieVersion);
  const legendary = useCity((s) => s.legendary);
  const setSelection = useCity((s) => s.setSelection);
  const openChat = useCity((s) => s.openChat);

  const burnedIds = useMemo(
    () => Array.from(burned).sort((a, b) => a - b),
    [burned],
  );
  const awakenedIds = useMemo(
    () => Array.from(awakenedSet).sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awakenedVersion],
  );
  const zombieIds = useMemo(
    () => Array.from(zombieSet).sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zombieVersion],
  );
  const legendaryIds = useMemo(() => legendary.map((l) => l.tokenId), [legendary]);
  const artistList = useMemo(() => {
    const names = Array.from(new Set(legendary.map((l) => l.artist).filter(Boolean)));
    return names.slice(0, 4).join(" · ");
  }, [legendary]);

  const atlas = useAtlas();

  return (
    <group>
      <FaceWall
        ids={burnedIds}
        atlas={atlas}
        position={[0, 0, 430]}
        rotationY={Math.PI}
        dim={0.5}
        glow={0}
        title="BURN MEMORIAL"
        subtitle={`${burnedIds.length.toLocaleString()} fallen`}
        onPick={(id) => setSelection({ kind: "burned", tokenId: id })}
      />
      <FaceWall
        ids={awakenedIds}
        atlas={atlas}
        position={[0, 0, -430]}
        rotationY={0}
        dim={1.0}
        glow={0.1}
        title="HALL OF THE AWAKENED"
        subtitle={`${awakenedIds.length.toLocaleString()} agents`}
        onPick={(id) => openChat(id)}
      />
      {/* Legendary Canvas gallery — east edge, facing the plaza centre. */}
      <FaceWall
        ids={legendaryIds}
        atlas={atlas}
        position={[430, 0, 0]}
        rotationY={-Math.PI / 2}
        dim={1.0}
        glow={0.22}
        title="LEGENDARY CANVAS"
        subtitle={
          legendaryIds.length
            ? `${legendaryIds.length} by ${artistList}`
            : "—"
        }
        onPick={(id) => setSelection({ kind: "normie", tokenId: id })}
      />
      {/* Zombie Lot — west edge, dim/eerie. */}
      <FaceWall
        ids={zombieIds}
        atlas={atlas}
        position={[-430, 0, 0]}
        rotationY={Math.PI / 2}
        dim={0.62}
        glow={0}
        title="ZOMBIE LOT"
        subtitle={`${zombieIds.length.toLocaleString()} turned`}
        onPick={(id) => setSelection({ kind: "normie", tokenId: id })}
      />
    </group>
  );
}

function useAtlas() {
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
  return atlas;
}

function FaceWall({
  ids,
  atlas,
  position,
  rotationY,
  dim,
  glow,
  title,
  subtitle,
  onPick,
}: {
  ids: number[];
  atlas: THREE.Texture | null;
  position: [number, number, number];
  rotationY: number;
  dim: number;
  glow: number;
  title: string;
  subtitle: string;
  onPick: (tokenId: number) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const rows = Math.max(1, Math.ceil(ids.length / COLS));
  const wallH = rows * TILE;

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uCellUv: { value: CELL_UV },
        uDim: { value: dim },
        uGlow: { value: glow },
        uHasAtlas: { value: atlas ? 1 : 0 },
      },
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
    });
  }, [atlas, dim, glow]);

  // Lay the tiles + per-instance atlas cell.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || ids.length === 0) return;
    const tmp = new THREE.Object3D();
    const cells = new Float32Array(ids.length * 2);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = (col - (COLS - 1) / 2) * TILE;
      const y = (rows - 1 - row) * TILE + TILE / 2; // first id top-left
      tmp.position.set(x, y, 0);
      tmp.scale.set(TILE * 0.96, TILE * 0.96, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      cells[i * 2] = (id % 100) * CELL_UV;
      cells[i * 2 + 1] = Math.floor(id / 100) * CELL_UV;
    }
    mesh.count = ids.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute(
      "aCell",
      new THREE.InstancedBufferAttribute(cells, 2),
    );
    mesh.computeBoundingSphere();
  }, [ids, rows]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const id = ids[e.instanceId];
    if (id != null) onPick(id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    if (typeof document !== "undefined") document.body.style.cursor = "";
  };

  if (ids.length === 0) return null;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Backing slab behind the faces. */}
      <mesh position={[0, wallH / 2, -1.2]}>
        <boxGeometry args={[COLS * TILE + 10, wallH + 14, 2]} />
        <meshStandardMaterial color="#1a1b1d" roughness={1} />
      </mesh>

      {/* Face mosaic. */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, ids.length]}
        material={material}
        position={[0, 0, 0]}
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      {/* Title + live count, floating above the wall. */}
      <Text
        position={[0, wallH + 16, 0.5]}
        fontSize={11}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
        outlineWidth={0.5}
        outlineColor="#1a1b1d"
      >
        {title}
      </Text>
      <Text
        position={[0, wallH + 7, 0.5]}
        fontSize={5}
        color={BRAND_OFF}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.2}
        fillOpacity={0.7}
      >
        {subtitle}
      </Text>
    </group>
  );
}

const WALL_VERT = /* glsl */ `
attribute vec2 aCell;
varying vec2 vUv;
varying vec2 vCell;
void main() {
  vUv = uv;
  vCell = aCell;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const WALL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform float uCellUv;
uniform float uDim;
uniform float uGlow;
uniform float uHasAtlas;
varying vec2 vUv;
varying vec2 vCell;
const vec3 ON  = vec3(0.282, 0.286, 0.294);
const vec3 OFF = vec3(0.890, 0.898, 0.894);
void main() {
  vec2 fUv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 c = OFF;
  if (uHasAtlas > 0.5) {
    vec4 px = texture2D(uAtlas, vCell + fUv * uCellUv);
    float on = step(0.5, 1.0 - px.r);
    c = mix(OFF, ON, on);
  }
  c *= uDim;
  c += vec3(uGlow);
  // faint cell separation
  float edge = step(0.97, max(vUv.x, vUv.y));
  c = mix(c, ON, edge * 0.25);
  gl_FragColor = vec4(c, 1.0);
}
`;
