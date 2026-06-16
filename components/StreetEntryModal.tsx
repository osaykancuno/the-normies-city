"use client";

import { useEffect, useState } from "react";
import { useCity } from "@/lib/store";
import NormieImage from "./NormieImage";

// "Choose your Normie, then enter" banner. Opens when the user clicks
// ENTER STREET VIEW. They pick the Normie ID they'll wear as their avatar
// (visible to other walkers in phase-2 presence), then confirm — the confirm
// click is the user gesture that lets walk mode grab pointer lock.

export default function StreetEntryModal() {
  const open = useCity((s) => s.streetEntryOpen);
  const setOpen = useCity((s) => s.setStreetEntryOpen);
  const avatarNormieId = useCity((s) => s.avatarNormieId);
  const setAvatarNormieId = useCity((s) => s.setAvatarNormieId);
  const setViewMode = useCity((s) => s.setViewMode);

  const [draft, setDraft] = useState(String(avatarNormieId));

  // Sync the field with the current avatar whenever the banner (re)opens.
  useEffect(() => {
    if (open) setDraft(String(avatarNormieId));
  }, [open, avatarNormieId]);

  // ESC closes the banner.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const parsed = Number(draft.replace(/^#/, ""));
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 9999;
  const preview = valid ? parsed : avatarNormieId;

  const enter = () => {
    if (valid) setAvatarNormieId(parsed);
    setOpen(false);
    setViewMode("walk");
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-ink/85 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[min(360px,calc(100vw-2rem))] bg-on text-off shadow-[0_4px_30px_-6px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-off/15 px-4 py-2">
          <span className="text-sm tracking-widest">ENTER STREET VIEW</span>
          <button
            className="text-off/60 hover:text-off"
            onClick={() => setOpen(false)}
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <div className="text-[10px] tracking-widest opacity-60">
            CHOOSE YOUR NORMIE
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-20 w-20 shrink-0 bg-off">
              <NormieImage tokenId={preview} overlaySvg={false} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] tracking-widest opacity-60">
                NORMIE ID (0–9999)
              </label>
              <div className="mt-1 flex gap-1">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && valid) enter();
                  }}
                  inputMode="numeric"
                  placeholder="#id"
                  className="w-full bg-ink px-2 py-1.5 text-sm tracking-wide text-off placeholder:text-off/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDraft(String(Math.floor(Math.random() * 10000)))}
                  title="Random Normie"
                  className="bg-ink px-2 text-sm hover:bg-ink/70"
                >
                  🎲
                </button>
              </div>
              {!valid && draft !== "" && (
                <div className="mt-1 text-[10px] text-off/60">enter 0–9999</div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={enter}
            className="mt-4 block w-full bg-off px-3 py-2 text-center text-[11px] tracking-widest text-on hover:bg-off/85"
          >
            ENTER ON FOOT →
          </button>
          <div className="mt-2 text-center text-[9px] tracking-wider opacity-50">
            <span className="hidden sm:inline">
              WASD move · SHIFT sprint · MOUSE look · ESC exit
            </span>
            <span className="sm:hidden">
              joystick to move · drag to look · on-screen buttons
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
