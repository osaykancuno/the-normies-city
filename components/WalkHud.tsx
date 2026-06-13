"use client";

import { useCity } from "@/lib/store";

// Minimal heads-up overlay shown only in first-person walk mode: a centre
// crosshair, the control hints, and an exit affordance. Pointer-events are off
// except the EXIT button so mouse-look isn't blocked.

export default function WalkHud() {
  const viewMode = useCity((s) => s.viewMode);
  const setViewMode = useCity((s) => s.setViewMode);

  if (viewMode !== "walk") return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* Centre crosshair. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-1.5 w-1.5 rounded-full bg-off/80 shadow-[0_0_0_3px_rgba(26,27,29,0.5)]" />
      </div>

      {/* Control hints. */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="bg-ink/70 px-3 py-1.5 text-[10px] tracking-widest text-off/85">
          WASD move · SHIFT sprint · MOUSE look · ESC exit
        </div>
      </div>

      {/* Exit button — the only interactive element. */}
      <button
        type="button"
        onClick={() => setViewMode("orbit")}
        className="pointer-events-auto absolute right-3 top-3 bg-off px-3 py-1.5 text-[10px] tracking-widest text-on hover:bg-off/80"
      >
        EXIT ✕
      </button>
    </div>
  );
}
