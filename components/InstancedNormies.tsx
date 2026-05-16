"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useCity } from "@/lib/store";
import { ATLAS_CELL_UV } from "@/lib/atlas";
import type { Building } from "@/lib/layout";

const MAX_BUILDINGS = 10000;
const MAX_FACADE_CELLS = 150; // generous cap so whales fill their facades
const tmpObject = new THREE.Object3D();

function makeFallbackTexture(): THREE.Texture {
  const data = new Uint8Array([227, 229, 228, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

export default function InstancedNormies() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const buildings = useCity((s) => s.buildings);
  const setSelection = useCity((s) => s.setSelection);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const setHovered = useCity((s) => s.setHovered);
  const hoveredIndex = useCity((s) => s.hoveredIndex);
  const selection = useCity((s) => s.selection);
  const awakenedSet = useCity((s) => s.awakenedSet);
  const awakenedVersion = useCity((s) => s.awakenedVersion);
  const agentMode = useCity((s) => s.agentMode);

  const fallback = useMemo(makeFallbackTexture, []);
  const tokenIdsTexRef = useRef<THREE.DataTexture | null>(null);
  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      "/atlas.png",
      (tex) => {
        tex.flipY = false;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        setAtlas(tex);
      },
      undefined,
      () => {
        console.warn(
          "/atlas.png not found — buildings will use a flat facade. Run `npm run build:atlas`."
        );
      }
    );
  }, []);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas ?? fallback },
        uCellUv: { value: ATLAS_CELL_UV },
        uTime: { value: 0 },
        uHoveredIndex: { value: -1 },
        uSelectedIndex: { value: -1 },
        uTokenIdsTex: { value: fallback }, // will be replaced when buildings change
        uTokenIdsTexSize: { value: 1 },
        uAgentMode: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
  }, [atlas, fallback]);

  // Rebuild per-instance attrs + the global tokenIds texture whenever the layout
  // changes (load, transfer, burn, lifecycle prune).
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || buildings.length === 0) return;

    const count = buildings.length;
    // Consolidated attributes (WebGL has a 16-attribute cap; instanceMatrix alone
    // consumes 4, plus position/normal/uv = 3, leaving 9 for our custom data).
    //   aMix    = (glow, shade, burned, hash)
    //   aLife   = (index, spawnAt, dieAt, tier)
    //   aSize   = (footprint, height)
    //   aTokens = (tokensOffset, tokensCount, cellSizeWorld)
    const aMix = new Float32Array(count * 4);
    const aLife = new Float32Array(count * 4);
    const aSize = new Float32Array(count * 2);
    const aTokens = new Float32Array(count * 3);

    const flatTokens: number[] = [];

    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      tmpObject.position.set(b.x, b.y, b.z);
      tmpObject.scale.set(b.footprint, b.height, b.footprint);
      tmpObject.updateMatrix();
      mesh.setMatrixAt(i, tmpObject.matrix);

      aMix[i * 4 + 0] = b.glow;
      aMix[i * 4 + 1] = b.kind === "burned" ? 0.45 : 1.0;
      // 3-state enum: 0 = normal, 1 = burned, 2 = awakened. A holder building
      // is "awakened" if any of its held token ids is in the awakened set.
      let stateZ = 0.0;
      if (b.kind === "burned") {
        stateZ = 1.0;
      } else {
        for (const id of b.tokenIds) {
          if (awakenedSet.has(id)) {
            stateZ = 2.0;
            break;
          }
        }
      }
      aMix[i * 4 + 2] = stateZ;
      aMix[i * 4 + 3] = fracHash(
        b.kind === "holder" ? hashFromAddress(b.address) : b.tokenId * 131
      );

      aLife[i * 4 + 0] = i;
      aLife[i * 4 + 1] =
        b.kind === "holder" && b.spawnedAt != null ? b.spawnedAt : -1;
      aLife[i * 4 + 2] = b.kind === "holder" && b.dyingAt != null ? b.dyingAt : -1;
      aLife[i * 4 + 3] = b.kind === "holder" ? b.tier : 0;

      aSize[i * 2 + 0] = b.footprint;
      aSize[i * 2 + 1] = b.height;

      aTokens[i * 3 + 0] = flatTokens.length;
      if (b.kind === "holder") {
        const visible = b.tokenIds.slice(0, MAX_FACADE_CELLS);
        aTokens[i * 3 + 1] = visible.length;
        aTokens[i * 3 + 2] = b.cellSize;
        flatTokens.push(...visible);
      } else {
        aTokens[i * 3 + 1] = 1;
        aTokens[i * 3 + 2] = b.cellSize;
        flatTokens.push(b.tokenId);
      }
    }

    // Pack flatTokens into a square Float32 RGBA texture; R channel = tokenId.
    const texSize = Math.max(8, Math.ceil(Math.sqrt(Math.max(1, flatTokens.length))));
    const tokenData = new Float32Array(texSize * texSize * 4);
    for (let i = 0; i < flatTokens.length; i++) tokenData[i * 4] = flatTokens[i];

    // Reuse the same texture object across rebuilds to avoid GPU upload churn —
    // dispose+recreate only when the size changes.
    let tex = tokenIdsTexRef.current;
    if (!tex || tex.image.width !== texSize) {
      tex?.dispose();
      tex = new THREE.DataTexture(
        tokenData,
        texSize,
        texSize,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tokenIdsTexRef.current = tex;
    } else {
      // DataTexture's image.data is typed as Uint8Array | Uint8ClampedArray in three's
      // public types even when we constructed it with Float32Array. Cast via unknown.
      (tex.image.data as unknown as Float32Array).set(tokenData);
    }
    tex.needsUpdate = true;
    material.uniforms.uTokenIdsTex.value = tex;
    material.uniforms.uTokenIdsTexSize.value = texSize;

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute("aMix", new THREE.InstancedBufferAttribute(aMix, 4));
    mesh.geometry.setAttribute("aLife", new THREE.InstancedBufferAttribute(aLife, 4));
    mesh.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(aSize, 2));
    mesh.geometry.setAttribute("aTokens", new THREE.InstancedBufferAttribute(aTokens, 3));
    mesh.computeBoundingSphere();
    // awakenedVersion bumps on every awakening so the 3-state attribute is
    // re-uploaded (the closure captures awakenedSet by reference but React
    // only re-runs the effect when a primitive dep changes).
  }, [buildings, material, awakenedSet, awakenedVersion]);

  useFrame(() => {
    material.uniforms.uTime.value = Date.now() / 1000;
    material.uniforms.uHoveredIndex.value = hoveredIndex ?? -1;
    material.uniforms.uAgentMode.value = agentMode ? 1 : 0;

    // Find the instance index of the currently selected building so the shader can
    // ghost out every other tower and let the selected one read through occluders.
    let selIdx = -1;
    if (selection?.kind === "holder") {
      const addr = selection.address;
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (b.kind === "holder" && b.address === addr) {
          selIdx = i;
          break;
        }
      }
    } else if (selection?.kind === "normie") {
      const tid = selection.tokenId;
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (b.kind === "holder" && b.tokenIds.indexOf(tid) >= 0) {
          selIdx = i;
          break;
        }
      }
    }
    material.uniforms.uSelectedIndex.value = selIdx;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId == null) return;

    // When a building is selected, prefer it if the ray passes through it even
    // when it's behind an occluder — this lets the user click their own tower
    // through the ghosted neighbours.
    let pickIdx: number = event.instanceId;
    if (selection?.kind === "holder" || selection?.kind === "normie") {
      let selIdx = -1;
      if (selection.kind === "holder") {
        for (let i = 0; i < buildings.length; i++) {
          const b = buildings[i];
          if (b.kind === "holder" && b.address === selection.address) { selIdx = i; break; }
        }
      } else {
        for (let i = 0; i < buildings.length; i++) {
          const b = buildings[i];
          if (b.kind === "holder" && b.tokenIds.indexOf(selection.tokenId) >= 0) { selIdx = i; break; }
        }
      }
      if (selIdx >= 0 && event.intersections) {
        for (const hit of event.intersections) {
          if (hit.instanceId === selIdx) {
            pickIdx = selIdx;
            break;
          }
        }
      }
    }

    const b = buildings[pickIdx];
    if (!b) return;
    if (b.kind === "holder") {
      setSelection({ kind: "holder", address: b.address });
    } else {
      setSelection({ kind: "burned", tokenId: b.tokenId });
    }
    setFlyTo({ x: b.x, y: b.y, z: b.z, size: b.height });
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (event.instanceId == null) return;
    setHovered(event.instanceId);
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    setHovered(null);
    if (typeof document !== "undefined") document.body.style.cursor = "";
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_BUILDINGS]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}

function fracHash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function hashFromAddress(addr: string): number {
  let h = 0;
  for (let i = 2; i < Math.min(addr.length, 14); i++) {
    h = (h * 31 + addr.charCodeAt(i)) | 0;
  }
  return h;
}

const VERT = /* glsl */ `
attribute vec4 aMix;    // (glow, shade, burned, hash)
attribute vec4 aLife;   // (index, spawnAt, dieAt, tier)
attribute vec2 aSize;   // (footprint, height)
attribute vec3 aTokens; // (tokensOffset, tokensCount, gridSize)

uniform float uTime;

varying vec3  vNormalW;
varying vec2  vUv;
varying vec4  vMix;
varying vec2  vSize;
varying vec3  vTokens;
varying float vIndex;
varying float vDying;
varying float vTier;

const float LIFECYCLE = 1.6;

void main() {
  vUv = uv;
  vMix = aMix;
  vSize = aSize;
  vTokens = aTokens;
  vIndex = aLife.x;
  vTier = aLife.w;

  float rise = aLife.y < 0.0 ? 1.0 : clamp((uTime - aLife.y) / LIFECYCLE, 0.0, 1.0);
  rise = 1.0 - pow(1.0 - rise, 3.0);
  float die = aLife.z < 0.0 ? 0.0 : clamp((uTime - aLife.z) / LIFECYCLE, 0.0, 1.0);
  die = die * die;
  float life = rise * (1.0 - die);
  vDying = die;

  vec3 pos = position;
  pos.y = (pos.y + 0.5) * life - 0.5;

  vec3 transformedNormal = mat3(instanceMatrix) * normal;
  vNormalW = normalize(transformedNormal);
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uAtlas;
uniform sampler2D uTokenIdsTex;
uniform float uTokenIdsTexSize;
uniform float uCellUv;
uniform float uTime;
uniform float uHoveredIndex;
uniform float uSelectedIndex;
uniform float uAgentMode;

varying vec3  vNormalW;
varying vec2  vUv;
varying vec4  vMix;    // (glow, shade, burned, hash)
varying vec2  vSize;
varying vec3  vTokens; // (tokensOffset, tokensCount, gridSize)
varying float vIndex;
varying float vDying;
varying float vTier;

const vec3 BRAND_ON  = vec3(0.282, 0.286, 0.294);
const vec3 BRAND_OFF = vec3(0.890, 0.898, 0.894);
const vec3 BRAND_INK = vec3(0.102, 0.106, 0.114);

#define vGlow   vMix.x
#define vShade  vMix.y
// vState: 0 = normal, 1 = burned, 2 = awakened (ERC-8004 agent bound).
#define vState  vMix.z
#define vHash   vMix.w
#define vTokensOffset vTokens.x
#define vTokensCount  vTokens.y
#define vCellSize     vTokens.z

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Reads the K-th token id from the global tokenIds data texture.
float readTokenId(float linearIdx) {
  float u = (mod(linearIdx, uTokenIdsTexSize) + 0.5) / uTokenIdsTexSize;
  float v = (floor(linearIdx / uTokenIdsTexSize) + 0.5) / uTokenIdsTexSize;
  return texture2D(uTokenIdsTex, vec2(u, v)).r;
}

// Renders the Normie bitmap for the given token id into cellUv ∈ [0,1].
vec3 sampleNormie(float tokenId, vec2 cellUv, float shade) {
  vec2 atlasCell = vec2(mod(tokenId, 100.0), floor(tokenId / 100.0));
  vec2 normieUv = (atlasCell + vec2(cellUv.x, 1.0 - cellUv.y)) * uCellUv;
  vec4 px = texture2D(uAtlas, normieUv);
  float on = step(0.5, 1.0 - px.r);
  vec3 normieOn  = mix(BRAND_ON,  BRAND_INK, 0.15);
  vec3 normieOff = BRAND_OFF * shade;
  return mix(normieOff, normieOn, on);
}

void main() {
  // ── See-through occluders ──
  // When a building is selected (via click or search), every OTHER tower is
  // rendered as a sparse dithered ghost so the selection reads cleanly even when
  // it's surrounded by taller neighbours. Discarding fragments here means we
  // don't write to the depth buffer for those pixels, so the selected building
  // becomes visible through them.
  bool selectionActive = uSelectedIndex >= 0.0;
  bool isSelected = selectionActive && abs(vIndex - uSelectedIndex) < 0.5;
  if (selectionActive && !isSelected) {
    // 4x4 Bayer-like dither — keep only ~1/8 of pixels for the occluders.
    vec2 sp = floor(mod(gl_FragCoord.xy, 4.0));
    float pat = sp.x + sp.y * 4.0;
    if (pat != 0.0 && pat != 5.0) discard;
  }

  vec3 color;
  vec3 absN = abs(vNormalW);
  bool isFront = vNormalW.z >  0.5;
  bool isTop   = vNormalW.y >  0.5;
  bool isBot   = vNormalW.y < -0.5;
  bool isSide  = !isFront && !isTop && !isBot && vNormalW.z > -0.5;
  bool isBack  = vNormalW.z < -0.5;

  // ----- Front face: SQUARE grid of Normie bitmaps in world units.
  // Cells are always square (cellSize × cellSize) so each Normie is undistorted.
  // The grid is laid bottom-up so occupied cells sit on the ground floor and the
  // top of the facade reads as "upper floors empty" if K < total cells.
  if (isFront) {
    vec2 worldFace = vUv * vSize;               // 0..footprint, 0..height
    float cellSize = max(vCellSize, 1.0);
    float gridCols = max(1.0, floor(vSize.x / cellSize));
    float gridRows = max(1.0, floor(vSize.y / cellSize));

    // Centre the grid horizontally within the face when it doesn't perfectly tile.
    float marginX = (vSize.x - gridCols * cellSize) * 0.5;
    float relX = worldFace.x - marginX;
    if (relX < 0.0 || relX >= gridCols * cellSize) {
      // Side margin: wall.
      color = mix(BRAND_INK, BRAND_ON, 0.55) * vShade;
    } else {
      vec2 cellIdx = vec2(floor(relX / cellSize), floor(worldFace.y / cellSize));
      vec2 cellUv  = vec2(fract(relX / cellSize), fract(worldFace.y / cellSize));

      // Top-down reading order: top row first, leaving any unused cells at the bottom.
      float linearIdx = (gridRows - 1.0 - cellIdx.y) * gridCols + cellIdx.x;

      if (cellIdx.y >= gridRows || linearIdx >= vTokensCount) {
        // Empty upper floors / overflow — wall.
        color = mix(BRAND_INK, BRAND_ON, 0.45) * vShade;
      } else {
        float tokenId = readTokenId(vTokensOffset + linearIdx);
        color = sampleNormie(tokenId, cellUv, vShade);
      }

      // Thin mullion between cells.
      if (gridCols > 1.5 || gridRows > 1.5) {
        float mEdge = 0.05;
        float mullion = step(1.0 - mEdge, max(cellUv.x, cellUv.y))
                      + step(cellUv.x, mEdge) + step(cellUv.y, mEdge);
        mullion = clamp(mullion, 0.0, 1.0);
        color = mix(color, BRAND_ON * 0.45, mullion * 0.45);
      }
    }
  }

  // ----- Top face: tier-specific roof signature.
  else if (isTop) {
    vec3 roof = mix(BRAND_INK, BRAND_ON, 0.55);
    color = roof;
    float bevel = 0.07;
    float edge = step(1.0 - bevel, vUv.x) + step(vUv.x, bevel)
               + step(1.0 - bevel, vUv.y) + step(vUv.y, bevel);
    edge = clamp(edge, 0.0, 1.0);
    color = mix(color, BRAND_OFF * 0.55, edge);

    if (vTier < 0.5) {
      // T0 villa: pitched-roof diamond seen from above.
      vec2 c = vUv - 0.5;
      float diamond = step(abs(c.x) + abs(c.y), 0.28);
      color = mix(color, BRAND_OFF * 0.8, diamond);
      float ridge = step(abs(c.y), 0.02) * step(abs(c.x), 0.27);
      color = mix(color, BRAND_OFF, ridge);
    } else if (vTier > 3.5) {
      // T4 skyscraper: central penthouse + helipad cross.
      vec2 c = abs(vUv - 0.5);
      float penthouse = step(c.x, 0.13) * step(c.y, 0.13);
      color = mix(color, BRAND_OFF * 0.85, penthouse);
      float cross = (step(c.x, 0.02) * step(c.y, 0.10)) + (step(c.y, 0.02) * step(c.x, 0.10));
      color = mix(color, BRAND_INK, clamp(cross, 0.0, 1.0));
    } else if (vTier > 2.5) {
      // T3 office: regular HVAC grid (4 small boxes).
      vec2 g = floor(vUv * 4.0);
      vec2 cellU = fract(vUv * 4.0);
      float hw = step(0.6, hash21(g + vHash * 11.0))
               * step(0.3, cellU.x) * step(cellU.x, 0.7)
               * step(0.3, cellU.y) * step(cellU.y, 0.7);
      color = mix(color, BRAND_OFF * 0.7, hw);
    } else {
      // T1/T2 mid-rise: a single hardware square offset by hash.
      vec2 hwUv = vec2(0.32 + 0.36 * vHash, 0.35 + 0.30 * fract(vHash * 4.0));
      vec2 d = abs(vUv - hwUv);
      float hardware = step(d.x, 0.06) * step(d.y, 0.06);
      color = mix(color, BRAND_OFF * 0.7, hardware);
    }
  }

  // ----- Bottom face: ink (mostly hidden by ground).
  else if (isBot) {
    color = BRAND_INK;
  }

  // ----- Side / back faces: pixel windows. Density and lit ratio scale with tier
  // (whales have denser, brighter facades than villas).
  else {
    float tierBoost = vTier * 1.0;
    float rowDensity = clamp(vSize.y / 18.0, 4.0, 32.0);
    float colDensity = (isSide ? 5.0 : 7.0) + tierBoost;
    vec2 grid = vec2(colDensity, rowDensity);
    vec2 cell = floor(vUv * grid);
    vec2 cUv  = fract(vUv * grid);

    // Villas (T0) collapse the pattern: instead of a window grid, show a single door
    // at the bottom centre on the front-side band, and quiet wall everywhere else.
    if (vTier < 0.5) {
      vec3 wall = mix(BRAND_INK, BRAND_ON, 0.6);
      color = wall;
      // Door at the centre-bottom of front-facing side panels.
      float door = step(0.38, vUv.x) * step(vUv.x, 0.62)
                 * step(vUv.y, 0.22) * step(0.02, vUv.y);
      color = mix(color, BRAND_OFF * 0.65, door);
      // A pair of small windows higher up.
      vec2 c = vUv - vec2(0.5, 0.55);
      float win = (step(abs(c.x - 0.18), 0.08) + step(abs(c.x + 0.18), 0.08))
                * step(abs(c.y), 0.08);
      color = mix(color, BRAND_OFF * 0.9, clamp(win, 0.0, 1.0));
    } else {
      float winRect = step(0.22, cUv.x) * step(cUv.x, 0.78)
                    * step(0.30, cUv.y) * step(cUv.y, 0.78);
      // Lit ratio grows with tier — modern towers shine.
      float litThreshold = 0.58 - vTier * 0.06;
      float lit = step(litThreshold, hash21(cell + vHash * 100.0));
      float flicker = 1.0 - 0.18 * step(0.85, hash21(cell + vHash * 200.0 + floor(uTime * 0.5)));
      vec3 wall = mix(BRAND_INK, BRAND_ON, 0.55);
      vec3 windowColor = mix(BRAND_ON * 0.6, BRAND_OFF * flicker, lit);
      color = mix(wall, windowColor, winRect);
      // Vertical spine — more prominent for high tiers (modern facade ribbing).
      float spineWidth = 0.49 + (4.0 - vTier) * 0.005;
      float vertSpine = step(spineWidth, fract(vUv.x * 2.0)) * step(fract(vUv.x * 2.0), 1.0 - spineWidth);
      color = mix(color, BRAND_ON * 0.4, vertSpine * 0.5);
    }
    color *= vShade;
  }

  // Base shadow strip.
  float baseShadow = smoothstep(0.06, 0.0, vUv.y);
  color *= mix(1.0, 0.55, baseShadow * (isTop || isBot ? 0.0 : 1.0));

  // Top glow halo for whales / lifecycle accents.
  float topT = smoothstep(0.78, 1.0, vUv.y);
  color = mix(color, BRAND_OFF, vGlow * topT * 0.55);

  float ndl = max(0.0, dot(vNormalW, normalize(vec3(0.45, 1.0, 0.3))));
  color *= 0.72 + 0.28 * ndl;

  // Hover highlight.
  if (abs(vIndex - uHoveredIndex) < 0.5) {
    float ring = step(0.96, max(vUv.x, vUv.y)) + step(vUv.x, 0.04) + step(vUv.y, 0.04);
    ring = clamp(ring, 0.0, 1.0);
    color = mix(color * 1.15, BRAND_OFF, ring * 0.85);
  }

  if (vState > 0.5 && vState < 1.5) {
    // Burned tomb.
    color *= 0.55;
    color += step(0.92, vUv.y) * 0.08;
  }

  // Awakened: emissive top band + a slow pulse — visible even when Agent Mode
  // is OFF so awakened towers are always discoverable in the skyline.
  if (vState > 1.5) {
    float topBand = smoothstep(0.82, 1.0, vUv.y);
    float pulse = 0.65 + 0.35 * sin(uTime * 1.6 + vHash * 6.2832);
    color += vec3(0.32) * topBand * pulse;
    // Thin emissive edge ring right at the top of the front face.
    float edgeRing = step(0.97, vUv.y) * step(0.04, vUv.x) * step(vUv.x, 0.96);
    color = mix(color, BRAND_OFF, edgeRing * 0.8);
  }

  // Agent Mode: emphasise the awakened layer over the dormant city.
  if (uAgentMode > 0.5 && vState < 1.5) {
    // Dither-discard ~3/16 of pixels on dormant towers so the awakened ones
    // pop. The pattern (mod 16, accept 0..2) keeps a sparse vertical ribbing
    // that reads as "still there but ghosted" rather than "missing".
    float pat = mod(gl_FragCoord.x + gl_FragCoord.y * 3.0, 16.0);
    if (pat > 2.5) discard;
  } else if (uAgentMode > 0.5 && vState > 1.5) {
    color *= 1.15;
  }

  // Dying buildings get a faint horizontal shimmer that creeps up the facade.
  if (vDying > 0.0) {
    float band = smoothstep(vDying - 0.05, vDying, vUv.y) * (1.0 - smoothstep(vDying, vDying + 0.05, vUv.y));
    color = mix(color, BRAND_OFF, band * 0.7);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
