"use client";

import { useEffect, useRef, useState } from "react";
import { useCity } from "@/lib/store";
import { touchInput, isTouchDevice } from "@/lib/touchinput";
import { getVoiceManager, type VoiceState } from "@/lib/voice";
import { presenceEnabled } from "@/lib/firebase";

// On-screen controls for mobile street view (touch devices only). There's no
// pointer lock on phones, so we provide: a left virtual joystick for movement, a
// full-screen look pad (drag to turn), and a right-side button cluster for talk,
// voice and exit. All inputs are written to the shared `touchInput` that
// WalkControls reads in its render loop — desktop is completely untouched.

const JOY_R = 52; // joystick travel radius (px)

export default function WalkTouchControls() {
  const viewMode = useCity((s) => s.viewMode);
  const nearbyAgentId = useCity((s) => s.nearbyAgentId);
  const chatTokenId = useCity((s) => s.chatTokenId);
  const openChat = useCity((s) => s.openChat);
  const setViewMode = useCity((s) => s.setViewMode);
  const awakenedAgents = useCity((s) => s.awakenedAgents);

  const isTouch = useRef(isTouchDevice()).current;
  const active = viewMode === "walk" && isTouch;

  const knobRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyCenter = useRef({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  const [voice, setVoice] = useState<VoiceState | null>(null);
  useEffect(() => {
    if (!active || !presenceEnabled()) return;
    return getVoiceManager().onState(setVoice);
  }, [active]);

  // Leaving walk releases any held inputs.
  useEffect(() => {
    if (!active) {
      touchInput.mx = 0;
      touchInput.mz = 0;
      touchInput.lookDX = 0;
      touchInput.lookDY = 0;
    }
  }, [active]);

  if (!active) return null;

  const vm = getVoiceManager();
  const nearbyName =
    nearbyAgentId != null
      ? awakenedAgents.get(nearbyAgentId)?.name || `#${nearbyAgentId}`
      : null;

  // --- Look pad (full screen, behind the HUD) ---
  const lookDown = (e: React.PointerEvent) => {
    if (lookId.current != null) return;
    lookId.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const lookMove = (e: React.PointerEvent) => {
    if (e.pointerId !== lookId.current) return;
    touchInput.lookDX += e.clientX - lookLast.current.x;
    touchInput.lookDY += e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const lookUp = (e: React.PointerEvent) => {
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  // --- Joystick ---
  const joyDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    joyCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joyId.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    joyMove(e);
  };
  const joyMove = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current && joyId.current != null) return;
    let dx = e.clientX - joyCenter.current.x;
    let dy = e.clientY - joyCenter.current.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) {
      dx = (dx / len) * JOY_R;
      dy = (dy / len) * JOY_R;
    }
    touchInput.mx = dx / JOY_R;
    touchInput.mz = -dy / JOY_R; // up = forward
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const joyUp = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return;
    joyId.current = null;
    touchInput.mx = 0;
    touchInput.mz = 0;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  };

  // Hide movement/look while the agent chat is open (its panel owns the screen).
  const showMoveLook = chatTokenId == null;

  return (
    <>
      {/* Look pad — sits above the canvas but below the HUD pills. */}
      {showMoveLook && (
        <div
          className="fixed inset-0 z-[12]"
          style={{ touchAction: "none" }}
          onPointerDown={lookDown}
          onPointerMove={lookMove}
          onPointerUp={lookUp}
          onPointerCancel={lookUp}
        />
      )}

      {/* Joystick (bottom-left). */}
      {showMoveLook && (
        <div
          className="fixed bottom-6 left-6 z-30 flex items-center justify-center rounded-full border border-off/25 bg-ink/40"
          style={{ width: JOY_R * 2 + 36, height: JOY_R * 2 + 36, touchAction: "none" }}
          onPointerDown={joyDown}
          onPointerMove={joyMove}
          onPointerUp={joyUp}
          onPointerCancel={joyUp}
        >
          <div
            ref={knobRef}
            className="h-12 w-12 rounded-full bg-off/80"
            style={{ transform: "translate(0px,0px)" }}
          />
        </div>
      )}

      {/* EXIT — top-right, tucked under the minimap so it never overlaps the
          bottom controls. */}
      <button
        type="button"
        onClick={() => setViewMode("orbit")}
        className="fixed right-3 top-[130px] z-30 bg-off px-3 py-1.5 text-[10px] tracking-widest text-on"
      >
        EXIT ✕
      </button>

      {/* Proximity TALK — bottom-centre, above the controls. */}
      {nearbyName && chatTokenId == null && (
        <button
          type="button"
          onClick={() => nearbyAgentId != null && openChat(nearbyAgentId)}
          className="fixed bottom-28 left-1/2 z-30 -translate-x-1/2 bg-off px-4 py-2 text-[11px] tracking-widest text-on"
        >
          TALK · {nearbyName.toUpperCase()}
        </button>
      )}

      {/* Voice cluster — bottom-right, stacked vertically so it stays narrow and
          never reaches across to the joystick on small phones. */}
      {presenceEnabled() && (
        <div className="fixed bottom-6 right-4 z-30 flex flex-col items-end gap-2">
          {voice?.enabled && (
            <button
              type="button"
              onClick={() => vm.setOutputMuted(!voice.outputMuted)}
              className={
                "px-3 py-2 text-[13px] " +
                (voice.outputMuted ? "bg-off text-on" : "bg-ink/70 text-off/85")
              }
            >
              {voice.outputMuted ? "🔇" : "🔊"}
            </button>
          )}
          <button
            type="button"
            onClick={() => (voice?.enabled ? vm.disable() : void vm.enable())}
            className={
              "px-3 py-2 text-[10px] tracking-widest " +
              (voice?.enabled ? "bg-off text-on" : "bg-ink/70 text-off/85")
            }
          >
            {voice?.enabled ? "VOICE ON" : "VOICE"}
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (!voice?.enabled) void vm.enable();
              else vm.setTransmitting(true);
            }}
            onPointerUp={() => vm.setTransmitting(false)}
            onPointerCancel={() => vm.setTransmitting(false)}
            className={
              "select-none px-5 py-3 text-[12px] tracking-widest " +
              (voice?.transmitting ? "bg-off text-on" : "bg-ink/70 text-off")
            }
            style={{ touchAction: "none" }}
          >
            🎙 {voice?.transmitting ? "ON AIR" : "TALK"}
          </button>
        </div>
      )}
    </>
  );
}
