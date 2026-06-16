"use client";

import { useEffect, useState } from "react";
import { useCity } from "@/lib/store";
import { presenceEnabled } from "@/lib/firebase";
import { localWalker, peerRegistry } from "@/lib/presence";
import { getVoiceManager, type VoiceState } from "@/lib/voice";

// Walk-mode proximity voice ("walkie-talkie"). Press V to join voice (one mic
// prompt); then HOLD T to talk to every Normie within VOICE_RADIUS — a group
// channel, so multiple people in range all hear you. Releasing T mutes you.
//
// This is a DOM overlay (no 3D): it owns the key handling, the proximity poll
// that tells the VoiceManager who's in range, and a small status readout. It's
// fully gated — renders nothing and touches no mic/network unless we're in walk
// mode AND Firebase presence is configured.

const VOICE_RADIUS = 90; // talk range in world units
const PROX_MS = 250; // proximity poll interval

export default function VoiceController() {
  const viewMode = useCity((s) => s.viewMode);
  const active = viewMode === "walk" && presenceEnabled();

  const [state, setState] = useState<VoiceState>({
    enabled: false,
    transmitting: false,
    connected: [],
    talking: [],
  });

  useEffect(() => {
    if (!active) return;
    const vm = getVoiceManager();
    const off = vm.onState(setState);

    // Proximity: tell the manager which presence uids are within talk range.
    const prox = setInterval(() => {
      const me = peerRegistry.selfUid;
      const near: string[] = [];
      for (const p of peerRegistry.peers) {
        if (p.id === me) continue;
        const dx = p.x - localWalker.x;
        const dz = p.z - localWalker.z;
        if (dx * dx + dz * dz <= VOICE_RADIUS * VOICE_RADIUS) near.push(p.id);
      }
      vm.setNearby(near);
    }, PROX_MS);

    // V toggles voice on/off; T (hold) is push-to-talk.
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (useCity.getState().chatTokenId != null) return; // typing in agent chat
      const k = e.key.toLowerCase();
      if (k === "v") {
        // Toggle based on the latest snapshot (effect re-binds on state.enabled).
        if (state.enabled) vm.disable();
        else void vm.enable();
      } else if (k === "t") {
        vm.setTransmitting(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t") vm.setTransmitting(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    return () => {
      clearInterval(prox);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      off();
    };
    // `state.enabled` is read inside the V handler; re-bind when it flips so the
    // toggle reflects the latest value.
  }, [active, state.enabled]);

  // Leaving walk mode fully tears down the mic + connections.
  useEffect(() => {
    if (!active) getVoiceManager().disable();
  }, [active]);

  if (!active) return null;

  const inRange = state.connected.length;
  const someoneTalking = state.talking.length > 0;

  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-20 -translate-x-1/2 select-none">
      {!state.enabled ? (
        <div className="bg-ink/70 px-3 py-1.5 text-[10px] tracking-widest text-off/75">
          PRESS <span className="text-off">V</span> TO JOIN VOICE
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          {state.transmitting ? (
            <div className="bg-off px-3 py-1.5 text-[10px] tracking-widest text-on">
              🎙 TRANSMITTING…
            </div>
          ) : (
            <div className="bg-ink/70 px-3 py-1.5 text-[10px] tracking-widest text-off/80">
              HOLD <span className="text-off">T</span> TO TALK
              {inRange > 0 ? ` · ${inRange} IN RANGE` : " · nobody nearby"}
            </div>
          )}
          {someoneTalking && (
            <div className="bg-ink/70 px-2 py-1 text-[9px] tracking-widest text-off/70">
              ◗ {state.talking.length} speaking
            </div>
          )}
          <div className="bg-ink/40 px-2 py-0.5 text-[8px] tracking-widest text-off/40">
            V to leave voice
          </div>
        </div>
      )}
    </div>
  );
}
