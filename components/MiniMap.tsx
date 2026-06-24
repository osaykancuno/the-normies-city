"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCity } from "@/lib/store";
import { localWalker, peerRegistry } from "@/lib/presence";
import { talkingRegistry } from "@/lib/voice";

// GTA-style square "pixel" minimap (top-right), shown in street view. It's
// CENTRED ON YOU and ROTATES with your heading — your arrow stays fixed pointing
// up while the city turns underneath. Zoomed to a local area so nearby blocks +
// Normies read clearly. Holder buildings are faint pixels (culled to the view),
// other present Normies are bright squares (pulse + ring when speaking), and a
// small N marks north as the map spins. Cheap: a few dozen rects per frame.

// Smaller on phones so it doesn't crowd the touch HUD.
const SIZE =
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches
    ? 104
    : 150; // px, square
const VIEW_RADIUS = 340; // world units from centre to edge (zoom)
const SCALE = SIZE / 2 / VIEW_RADIUS;
const CULL = VIEW_RADIUS * 1.5; // a touch past the corners
const CULL2 = CULL * CULL;

export default function MiniMap() {
  const viewMode = useCity((s) => s.viewMode);
  const buildings = useCity((s) => s.buildings);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = viewMode === "walk";

  // Flat array of holder positions for fast per-frame culling.
  const holders = useMemo(() => {
    const out: number[] = [];
    for (const b of buildings) {
      if (b.kind !== "holder") continue;
      out.push(b.x, b.z);
    }
    return Float32Array.from(out);
  }, [buildings]);

  useEffect(() => {
    if (!active) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    const g = cv.getContext("2d");
    if (!g) return;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    let raf = 0;

    const draw = () => {
      const px = localWalker.x;
      const pz = localWalker.z;
      const h = localWalker.heading;
      // Rotate so the player's forward (sin h, cos h) points up (screen -y).
      const rot = h + Math.PI;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, SIZE, SIZE);
      // Ground.
      g.fillStyle = "rgba(23,24,27,0.82)";
      g.fillRect(0, 0, SIZE, SIZE);

      // Clip to the square so rotated content never spills the frame.
      g.save();
      g.beginPath();
      g.rect(0, 0, SIZE, SIZE);
      g.clip();

      // Buildings (culled to the local view), rotated about the player.
      g.fillStyle = "rgba(130,132,136,0.7)";
      for (let i = 0; i < holders.length; i += 2) {
        const dx = holders[i] - px;
        const dz = holders[i + 1] - pz;
        if (dx * dx + dz * dz > CULL2) continue;
        const sx = dx * SCALE;
        const sz = dz * SCALE;
        const mx = cx + (sx * cosR - sz * sinR);
        const my = cy + (sx * sinR + sz * cosR);
        g.fillRect(mx - 1.4, my - 1.4, 2.8, 2.8);
      }

      // Other Normies present.
      const me = peerRegistry.selfUid;
      let present = 1; // you
      for (const p of peerRegistry.peers) {
        if (p.id === me) continue;
        present++;
        const dx = p.x - px;
        const dz = p.z - pz;
        if (dx * dx + dz * dz > CULL2) continue;
        const sx = dx * SCALE;
        const sz = dz * SCALE;
        const mx = cx + (sx * cosR - sz * sinR);
        const my = cy + (sx * sinR + sz * cosR);
        if (talkingRegistry.ids.has(p.id)) {
          g.fillStyle = "#e3e5e4";
          g.fillRect(mx - 2.5, my - 2.5, 5, 5);
          g.strokeStyle = "rgba(227,229,228,0.5)";
          g.lineWidth = 1;
          g.strokeRect(mx - 4.5, my - 4.5, 9, 9);
        } else {
          g.fillStyle = "rgba(227,229,228,0.9)";
          g.fillRect(mx - 1.8, my - 1.8, 3.6, 3.6);
        }
      }
      g.restore();

      // Monument markers — edge-clamped waypoints so they always point you to
      // the Burn Memorial (south, z=+430) and Hall of the Awakened (north,
      // z=-430), even when off the local view.
      const drawMon = (wx: number, wz: number, label: string) => {
        const dx = wx - px;
        const dz = wz - pz;
        const sx = dx * SCALE;
        const sz = dz * SCALE;
        let mx = sx * cosR - sz * sinR;
        let my = sx * sinR + sz * cosR;
        const lim = SIZE / 2 - 9;
        const m = Math.max(Math.abs(mx), Math.abs(my));
        if (m > lim) {
          const s = lim / m;
          mx *= s;
          my *= s;
        }
        const X = cx + mx;
        const Y = cy + my;
        g.fillStyle = "rgba(23,24,27,0.92)";
        g.fillRect(X - 6, Y - 6, 12, 12);
        g.strokeStyle = "#e3e5e4";
        g.lineWidth = 1;
        g.strokeRect(X - 6, Y - 6, 12, 12);
        g.fillStyle = "#e3e5e4";
        g.font = "bold 8px monospace";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, X, Y + 0.5);
      };
      drawMon(0, 430, "B"); // Burn Memorial (south)
      drawMon(0, -430, "A"); // Hall of the Awakened (north)
      drawMon(430, 0, "L"); // Legendary Canvas (east)
      drawMon(-430, 0, "Z"); // Zombie Lot (west)

      // Player — fixed arrow at centre, always pointing up.
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#17181b";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx, cy - 6);
      g.lineTo(cx + 4, cy + 5);
      g.lineTo(cx, cy + 2.5);
      g.lineTo(cx - 4, cy + 5);
      g.closePath();
      g.fill();
      g.stroke();

      // North marker (world -z), rotated with the map.
      const nx = 0 * cosR - -1 * sinR; // = sinR
      const ny = 0 * sinR + -1 * cosR; // = -cosR
      const r = SIZE / 2 - 9;
      g.fillStyle = "rgba(227,229,228,0.8)";
      g.font = "bold 9px monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("N", cx + nx * r, cy + ny * r);

      // Count of Normies present.
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      g.font = "8px monospace";
      g.fillStyle = "rgba(227,229,228,0.85)";
      g.fillText(`${present} here`, 4, 11);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, holders]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-20">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <canvas
          ref={canvasRef}
          style={{ width: SIZE, height: SIZE, imageRendering: "pixelated" }}
          className="block"
        />
        {/* Square pixel frame. */}
        <div className="pointer-events-none absolute inset-0 border-2 border-off/35" />
        <div className="absolute -bottom-4 right-0 text-[8px] tracking-widest text-off/55">
          CITY MAP
        </div>
      </div>
    </div>
  );
}
