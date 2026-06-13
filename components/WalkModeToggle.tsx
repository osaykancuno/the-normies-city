"use client";

import { useEffect, useState } from "react";
import { useCity } from "@/lib/store";

// Top-bar pill that drops the visitor into first-person street view. The click
// itself is the user gesture that lets WalkControls request pointer lock.
// Hidden on coarse-pointer (touch) devices for phase 1 — mobile gets a touch
// joystick in the fast-follow.

export default function WalkModeToggle() {
  const viewMode = useCity((s) => s.viewMode);
  const setViewMode = useCity((s) => s.setViewMode);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const on = () => setCoarse(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  if (coarse) return null;

  const walking = viewMode === "walk";

  return (
    <button
      type="button"
      onClick={() => setViewMode(walking ? "orbit" : "walk")}
      title="Drop to street level and explore on foot — WASD to move, mouse to look, ESC to exit"
      className={
        "flex items-center gap-1 px-2.5 py-1.5 text-[10px] tracking-widest transition cursor-pointer " +
        (walking ? "bg-off text-on hover:bg-off/85" : "bg-on text-off/85 hover:text-off")
      }
    >
      <span>{walking ? "EXIT STREET VIEW" : "ENTER STREET VIEW"}</span>
    </button>
  );
}
