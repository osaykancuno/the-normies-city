"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";

// Community storefronts ringing the central plaza. Each "shop" is a small
// pixel-art kiosk whose front facade is a texture loaded from public/shops.
// Clicking opens the linked community brand in a new tab — Normie City is a
// directory of agents AND a discovery layer for community-built products.
//
// Plaza-area layout (full inventory — keep this in sync when adding things):
//   N / E / S / W cardinals at radius 260 → 4 stat pillars (Plaza.tsx)
//   NE diagonal at radius ~318            → TAG BATTLE arena (Arena.tsx)
//   NW / SE / SW diagonals at radius 380  → shop kiosks (this file)
//
// The Arena was placed at NE first, so the shop ring uses the remaining
// three diagonals. New community features should reuse one of those three
// or pick a fresh angle that doesn't collide with anything above.

const BRAND_OFF = "#e3e5e4";
const BRAND_ON = "#48494b";
const BRAND_INK = "#1a1b1d";

const SHOP_RADIUS = 380;
const KIOSK_W = 60;
const KIOSK_H = 80;
const KIOSK_D = 18;
const PLINTH_H = 6;

type ShopDef = {
  id: string;
  /** Angle in radians, clockwise from north. */
  angle: number;
  label: string;
  /** Optional sublabel shown under the main one. */
  sublabel?: string;
  /** Click target. Missing → renders as COMING SOON placeholder. */
  url?: string;
  /** Image path under /public. Missing → wall-coloured facade. */
  image?: string;
  /** Native aspect ratio of `image` (width / height). Used to fit the image
   *  panel onto the kiosk facade without stretching. Default 1.0 (square). */
  imageAspect?: number;
  /** Topper style. */
  topper?: "coffee" | "default";
};

const SHOPS: ShopDef[] = [
  {
    // NW diagonal — NE is occupied by the TAG BATTLE arena, so the coffee
    // shop sits across from it on the opposite-facing diagonal. The plaza
    // reads diagonally as: arena ↔ coffee, with COMING SOON slots on the
    // remaining two corners.
    id: "8362-coffee",
    angle: (7 * Math.PI) / 4, // NW
    label: "8362 COFFEE",
    sublabel: "fuel of web3",
    url: "https://8362coffee.com/",
    image: "/shops/8362-coffee.png",
    imageAspect: 812 / 835, // native dimensions of the PNG
    topper: "coffee",
  },
  { id: "soon-se", angle: (3 * Math.PI) / 4, label: "COMING SOON" },
  { id: "soon-sw", angle: (5 * Math.PI) / 4, label: "COMING SOON" },
];

export default function Shops() {
  return (
    <group>
      {SHOPS.map((s) => (
        <ShopKiosk key={s.id} shop={s} />
      ))}
    </group>
  );
}

function ShopKiosk({ shop }: { shop: ShopDef }) {
  const isPlaceholder = !shop.url;
  const x = Math.sin(shop.angle) * SHOP_RADIUS;
  const z = -Math.cos(shop.angle) * SHOP_RADIUS;
  // Mirror the StatPillar rotation convention so the kiosk's +Z face points
  // toward the plaza centre (where the camera usually is).
  const rotY = -shop.angle;

  // Texture loading for the facade. Falls back gracefully to a flat brand
  // wall if the image is missing or hasn't loaded yet — never blocks render.
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!shop.image) return;
    const loader = new THREE.TextureLoader();
    loader.load(
      shop.image,
      (t) => {
        t.minFilter = THREE.NearestFilter;
        t.magFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        setTex(t);
      },
      undefined,
      () => {
        // Silent fail — the wall fallback already renders.
      },
    );
  }, [shop.image]);

  // Box materials: 6 faces, brand-coloured. The image goes on a SEPARATE
  // plane in front of the +Z face (see render) so it keeps its native aspect
  // ratio instead of stretching to fit the kiosk's W:H. The box becomes a
  // "frame" around the image — a common pattern in arcade-cabinet UI.
  const materials = useMemo(() => {
    const wallColor = isPlaceholder ? BRAND_ON : BRAND_OFF;
    const wall = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.95,
      transparent: isPlaceholder,
      opacity: isPlaceholder ? 0.55 : 1.0,
    });
    const top = new THREE.MeshStandardMaterial({
      color: BRAND_INK,
      roughness: 1,
      transparent: isPlaceholder,
      opacity: isPlaceholder ? 0.55 : 1.0,
    });
    return [wall, wall, top, wall, wall, wall];
  }, [isPlaceholder]);

  // Compute the image panel size: fit inside the front face with a 4-unit
  // padding, respecting the image's native aspect ratio.
  const imagePanel = useMemo(() => {
    const aspect = shop.imageAspect ?? 1;
    const padX = 4;
    const padY = 6;
    const maxW = KIOSK_W - padX * 2;
    const maxH = KIOSK_H - padY * 2;
    // Try width-limited first, fall back to height-limited if it overflows.
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { w, h };
  }, [shop.imageAspect]);

  // Steam puff for the coffee shop — three offset spheres rising on a loop.
  const puffsRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!puffsRef.current || shop.topper !== "coffee") return;
    const t = clock.elapsedTime;
    const children = puffsRef.current.children as THREE.Mesh[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const phase = (t * 0.35 + i / children.length) % 1;
      child.position.y = phase * 18; // rise from chimney top over the loop
      child.position.x = Math.sin(t * 0.5 + i) * 1.2;
      const scale = 1 + phase * 1.5;
      child.scale.setScalar(scale);
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - phase) * 0.55;
    }
  });

  // Subtle hover lift for affordance — placeholders skip it.
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useFrame(() => {
    if (!groupRef.current) return;
    const target = hovered && !isPlaceholder ? 4 : 0;
    groupRef.current.position.y +=
      (target - groupRef.current.position.y) * 0.1;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (shop.url && typeof window !== "undefined") {
      window.open(shop.url, "_blank", "noopener,noreferrer");
    }
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    if (!isPlaceholder && typeof document !== "undefined") {
      document.body.style.cursor = "pointer";
    }
  };
  const onOut = () => {
    setHovered(false);
    if (typeof document !== "undefined") document.body.style.cursor = "";
  };

  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* Inner group: hover lifts this so the plinth stays put. */}
      <group ref={groupRef}>
        {/* Plinth base. */}
        <mesh position={[0, PLINTH_H / 2, 0]}>
          <boxGeometry args={[KIOSK_W + 10, PLINTH_H, KIOSK_D + 10]} />
          <meshStandardMaterial color={BRAND_INK} roughness={1} />
        </mesh>

        {/* Kiosk body — solid brand walls, acts as a frame around the image. */}
        <mesh
          position={[0, PLINTH_H + KIOSK_H / 2, 0]}
          material={materials}
          onClick={onClick}
          onPointerOver={onOver}
          onPointerOut={onOut}
        >
          <boxGeometry args={[KIOSK_W, KIOSK_H, KIOSK_D]} />
        </mesh>

        {/* Image facade: a separate plane in front of the +Z face that keeps
            the image's native aspect ratio (no stretching). Click target is
            the kiosk body above; this plane is just the pixel-art sign. */}
        {tex && !isPlaceholder && (
          <mesh
            position={[
              0,
              PLINTH_H + KIOSK_H / 2,
              KIOSK_D / 2 + 0.06,
            ]}
            raycast={() => null}
          >
            <planeGeometry args={[imagePanel.w, imagePanel.h]} />
            <meshBasicMaterial map={tex} toneMapped={false} />
          </mesh>
        )}

        {/* Awning rail — thin slab above the facade. */}
        <mesh position={[0, PLINTH_H + KIOSK_H + 2, 0]}>
          <boxGeometry args={[KIOSK_W + 6, 4, KIOSK_D + 6]} />
          <meshBasicMaterial
            color={BRAND_OFF}
            transparent={isPlaceholder}
            opacity={isPlaceholder ? 0.55 : 1}
          />
        </mesh>

        {/* Topper: coffee chimney + steam puffs. */}
        {shop.topper === "coffee" && (
          <>
            <mesh
              position={[KIOSK_W * 0.28, PLINTH_H + KIOSK_H + 8, 0]}
            >
              <cylinderGeometry args={[2.2, 2.8, 8, 8]} />
              <meshStandardMaterial color={BRAND_INK} roughness={1} />
            </mesh>
            <group
              ref={puffsRef}
              position={[KIOSK_W * 0.28, PLINTH_H + KIOSK_H + 14, 0]}
            >
              {[0, 1, 2].map((i) => (
                <mesh key={i}>
                  <sphereGeometry args={[2.6, 10, 10]} />
                  <meshBasicMaterial
                    color={BRAND_OFF}
                    transparent
                    opacity={0.5}
                  />
                </mesh>
              ))}
            </group>
          </>
        )}

        {/* COMING SOON diagonal stamp across the facade. */}
        {isPlaceholder && (
          <group
            position={[0, PLINTH_H + KIOSK_H / 2, KIOSK_D / 2 + 0.08]}
          >
            <mesh rotation={[0, 0, Math.PI / 8]} raycast={() => null}>
              <planeGeometry args={[KIOSK_W * 1.1, 6]} />
              <meshBasicMaterial color={BRAND_OFF} transparent opacity={0.55} />
            </mesh>
            <Text
              position={[0, 0, 0.1]}
              rotation={[0, 0, Math.PI / 8]}
              fontSize={5.5}
              color={BRAND_INK}
              anchorX="center"
              anchorY="middle"
              letterSpacing={0.1}
            >
              COMING SOON
            </Text>
          </group>
        )}

        {/* Main label above the awning. */}
        <Text
          position={[0, PLINTH_H + KIOSK_H + 14, KIOSK_D / 2 + 0.1]}
          fontSize={6}
          color={BRAND_OFF}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.15}
          outlineWidth={0.4}
          outlineColor={BRAND_INK}
        >
          {shop.label}
        </Text>

        {/* Optional sublabel underneath. */}
        {shop.sublabel && (
          <Text
            position={[0, PLINTH_H + KIOSK_H + 7, KIOSK_D / 2 + 0.1]}
            fontSize={2.6}
            color={BRAND_OFF}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.2}
          >
            {shop.sublabel}
          </Text>
        )}
      </group>
    </group>
  );
}
