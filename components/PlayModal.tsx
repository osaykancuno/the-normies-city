"use client";

import { useEffect } from "react";
import { useCity } from "@/lib/store";

// Full-screen overlay that hosts the standalone TAG BATTLE bundle in an iframe.
// The game is built independently (Vite + Phaser + Firebase) and copied into
// /public/tag-battle/. Keeping it iframed means zero coupling between the two
// codebases — the city app stays slim and the game stays self-contained.

export default function PlayModal() {
  const open = useCity((s) => s.arenaOpen);
  const setOpen = useCity((s) => s.setArenaOpen);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex flex-col bg-ink">
      <header className="flex shrink-0 items-center justify-between border-b border-off/15 bg-on px-4 py-2 text-off">
        <div className="flex items-center gap-3">
          <span className="bg-off px-2 py-1 text-[10px] tracking-widest text-on">
            TAG BATTLE
          </span>
          <span className="text-[10px] tracking-wider opacity-60">
            graffiti · crews · territory · running inside THE NORMIES CITY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="bg-ink px-2 py-1 text-[10px] tracking-widest text-off/70 hover:text-off"
            href="/tag-battle/index.html"
            target="_blank"
            rel="noreferrer"
          >
            ↗ FULLSCREEN
          </a>
          <button
            className="bg-off px-3 py-1 text-[10px] tracking-widest text-on hover:bg-off/80"
            onClick={() => setOpen(false)}
            aria-label="close"
          >
            CLOSE ✕  · ESC
          </button>
        </div>
      </header>
      <iframe
        title="TAG BATTLE"
        src="/tag-battle/index.html"
        className="block h-full w-full flex-1 border-0 bg-ink"
        allow="autoplay; fullscreen; gamepad; clipboard-write; web-share"
      />
    </div>
  );
}
