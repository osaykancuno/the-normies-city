"use client";

import { useCity } from "@/lib/store";

// Top-bar pill that drops the visitor into first-person street view. On desktop
// the click is the gesture that lets WalkControls grab pointer lock; on touch
// devices WalkControls + WalkTouchControls drive a joystick + look-pad instead.

export default function WalkModeToggle() {
  const viewMode = useCity((s) => s.viewMode);
  const setViewMode = useCity((s) => s.setViewMode);
  const setStreetEntryOpen = useCity((s) => s.setStreetEntryOpen);

  const walking = viewMode === "walk";

  return (
    <button
      type="button"
      onClick={() => (walking ? setViewMode("orbit") : setStreetEntryOpen(true))}
      title="Drop to street level and explore on foot — pick your Normie, then WASD to move, mouse to look, ESC to exit"
      className={
        "flex items-center gap-1 px-2.5 py-1.5 text-[10px] tracking-widest transition cursor-pointer " +
        (walking ? "bg-off text-on hover:bg-off/85" : "bg-on text-off/85 hover:text-off")
      }
    >
      <span>{walking ? "EXIT STREET VIEW" : "ENTER STREET VIEW"}</span>
    </button>
  );
}
