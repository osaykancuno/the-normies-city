"use client";

import { useEffect, useRef } from "react";
import { useCity } from "@/lib/store";
import { CITY_OUTER_RADIUS } from "@/lib/layout";
import { localWalker, peerRegistry } from "@/lib/presence";
import { talkingRegistry } from "@/lib/voice";

// Square "pixel" minimap (top-right), shown in street view. North-up overview of
// the whole city: holder buildings are faint pixels baked once into a backdrop;
// every other Normie present is a bright square (pulsing when they're speaking);
// you are a white arrow pointing where you face. Purely a HUD canvas — cheap to
// redraw (a cached image + a handful of dots).

const SIZE = 150; // px, square
const PAD = 1.04; // a little margin so edge buildings aren't clipped

export default function MiniMap() {
  const viewMode = useCity((s) => s.viewMode);
  const buildings = useCity((s) => s.buildings);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const active = viewMode === "walk";

  const scale = SIZE / (2 * CITY_OUTER_RADIUS * PAD);
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  // Bake the static backdrop (city disc + building pixels + centre) once per
  // layout change.
  useEffect(() => {
    if (!active) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const off = document.createElement("canvas");
    off.width = SIZE * dpr;
    off.height = SIZE * dpr;
    const g = off.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.fillStyle = "rgba(23,24,27,0.82)";
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = "rgba(42,43,48,0.55)";
    g.beginPath();
    g.arc(cx, cy, CITY_OUTER_RADIUS * scale, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(130,132,136,0.7)";
    for (const b of buildings) {
      if (b.kind !== "holder") continue;
      g.fillRect(cx + b.x * scale - 0.6, cy + b.z * scale - 0.6, 1.2, 1.2);
    }
    // Central plaza / obelisk marker.
    g.fillStyle = "rgba(227,229,228,0.55)";
    g.fillRect(cx - 2, cy - 2, 4, 4);
    bgRef.current = off;
  }, [active, buildings, scale, cx, cy]);

  // Animate the live layer.
  useEffect(() => {
    if (!active) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    const g = cv.getContext("2d");
    if (!g) return;
    let raf = 0;

    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, SIZE, SIZE);
      if (bgRef.current) g.drawImage(bgRef.current, 0, 0, SIZE, SIZE);

      const me = peerRegistry.selfUid;
      let present = 1; // you
      for (const p of peerRegistry.peers) {
        if (p.id === me) continue;
        present++;
        const mx = cx + p.x * scale;
        const my = cy + p.z * scale;
        const talking = talkingRegistry.ids.has(p.id);
        if (talking) {
          g.fillStyle = "#e3e5e4";
          g.fillRect(mx - 2.5, my - 2.5, 5, 5);
          g.strokeStyle = "rgba(227,229,228,0.5)";
          g.lineWidth = 1;
          g.strokeRect(mx - 4.5, my - 4.5, 9, 9);
        } else {
          g.fillStyle = "rgba(227,229,228,0.85)";
          g.fillRect(mx - 1.5, my - 1.5, 3, 3);
        }
      }

      // You — an arrow pointing along the camera heading.
      const px = cx + localWalker.x * scale;
      const py = cy + localWalker.z * scale;
      const fx = Math.sin(localWalker.heading);
      const fy = Math.cos(localWalker.heading);
      const ax = -fy;
      const ay = fx;
      g.beginPath();
      g.moveTo(px + fx * 6, py + fy * 6);
      g.lineTo(px - fx * 3 + ax * 3.6, py - fy * 3 + ay * 3.6);
      g.lineTo(px - fx * 3 - ax * 3.6, py - fy * 3 - ay * 3.6);
      g.closePath();
      g.fillStyle = "#ffffff";
      g.fill();
      g.strokeStyle = "#17181b";
      g.lineWidth = 1;
      g.stroke();

      // Count of Normies present.
      g.fillStyle = "rgba(227,229,228,0.85)";
      g.font = "8px monospace";
      g.fillText(`${present} here`, 4, 11);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, scale, cx, cy]);

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
