"use client";

import { useEffect } from "react";
import { useCity } from "@/lib/store";
import NormieImage from "./NormieImage";

// Minimal heads-up overlay shown only in first-person walk mode: a centre
// crosshair, a read-only avatar badge, control hints, and an exit affordance.
// The avatar is chosen up-front in StreetEntryModal (you can't focus an input
// while pointer-locked), so here it's display-only. This component also toggles
// the `walk-mode` body class so globals.css hides the top bar + footer hint.

export default function WalkHud() {
  const viewMode = useCity((s) => s.viewMode);
  const setViewMode = useCity((s) => s.setViewMode);
  const avatarNormieId = useCity((s) => s.avatarNormieId);
  const nearbyAgentId = useCity((s) => s.nearbyAgentId);
  const chatTokenId = useCity((s) => s.chatTokenId);
  const openChat = useCity((s) => s.openChat);
  const awakenedAgents = useCity((s) => s.awakenedAgents);
  const walkLocked = useCity((s) => s.walkLocked);

  // Hide the page chrome while walking (CSS in globals.css keys off this class).
  useEffect(() => {
    const walking = viewMode === "walk";
    document.body.classList.toggle("walk-mode", walking);
    return () => document.body.classList.remove("walk-mode");
  }, [viewMode]);

  // Press E to talk to the nearby awakened Normie.
  useEffect(() => {
    if (viewMode !== "walk") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "e" || e.key === "E") && nearbyAgentId != null && chatTokenId == null) {
        openChat(nearbyAgentId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, nearbyAgentId, chatTokenId, openChat]);

  if (viewMode !== "walk") return null;

  const nearbyName =
    nearbyAgentId != null
      ? awakenedAgents.get(nearbyAgentId)?.name || `#${nearbyAgentId}`
      : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* Centre crosshair. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-1.5 w-1.5 rounded-full bg-off/80 shadow-[0_0_0_3px_rgba(26,27,29,0.5)]" />
      </div>

      {/* If the browser ever drops the pointer lock mid-walk, a tiny tap hint
          appears (click anywhere re-engages mouse-look). Silent when locked. */}
      {!walkLocked && chatTokenId == null && (
        <div className="absolute left-1/2 top-[62%] -translate-x-1/2 bg-ink/60 px-2 py-1 text-[9px] tracking-widest text-off/70">
          click to look
        </div>
      )}

      {/* Read-only avatar badge — the Normie you're wearing. */}
      <div className="absolute left-3 top-3 flex items-center gap-2 bg-ink/70 p-2">
        <div className="h-9 w-9 shrink-0 bg-off">
          <NormieImage tokenId={avatarNormieId} overlaySvg={false} />
        </div>
        <div className="text-[10px] tracking-widest text-off/85">
          <div className="opacity-60">YOU ARE</div>
          <div className="tabular-nums">#{avatarNormieId}</div>
        </div>
      </div>

      {/* Proximity prompt — talk to a nearby awakened Normie. */}
      {nearbyName && chatTokenId == null && (
        <button
          type="button"
          onClick={() => nearbyAgentId != null && openChat(nearbyAgentId)}
          className="pointer-events-auto absolute left-1/2 top-[58%] -translate-x-1/2 bg-off px-3 py-1.5 text-[11px] tracking-widest text-on hover:bg-off/80"
        >
          E · TALK TO {nearbyName.toUpperCase()}
        </button>
      )}

      {/* Control hints. */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="bg-ink/70 px-3 py-1.5 text-[10px] tracking-widest text-off/85">
          WASD move · SHIFT sprint · MOUSE look · E talk · ESC exit
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
