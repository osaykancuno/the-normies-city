"use client";

// Shared, non-reactive touch input for mobile street view. The on-screen
// joystick + look pad (WalkTouchControls, a DOM overlay) write here every touch
// event; WalkControls reads it inside its render loop. Mirrors the localWalker
// pattern so there are no per-frame React re-renders.
//
//  - mx / mz: normalised movement from the left joystick (-1..1). mz>0 = forward.
//  - lookDX / lookDY: accumulated look-drag pixels since the last frame; the
//    render loop consumes them (resets to 0) and turns them into yaw/pitch.

export const touchInput = {
  mx: 0,
  mz: 0,
  lookDX: 0,
  lookDY: 0,
};

/** True on phones/tablets (coarse pointer, no hover) — chosen once at import. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
