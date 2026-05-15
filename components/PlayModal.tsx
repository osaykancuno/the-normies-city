"use client";

import { useEffect, useState } from "react";
import { useCity } from "@/lib/store";

// Full-screen overlay hosting the TAG BATTLE bundle (built independently:
// Vite + Phaser + Firebase). The game is iframed for full isolation. The status
// strip at the top probes the bundled index.html to surface whether the
// multiplayer backend (Firebase) is configured — separating "I'm alone because
// the backend is broken" from "I'm alone because no other Normies holder is
// online right now".

type BackendStatus = "checking" | "configured" | "offline";

export default function PlayModal() {
  const open = useCity((s) => s.arenaOpen);
  const setOpen = useCity((s) => s.setArenaOpen);
  const [backend, setBackend] = useState<BackendStatus>("checking");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Probe the bundle to see if FIREBASE_CONFIG has been injected (a sign the
  // multiplayer backend is wired). Light fetch — ~127 KB, cached.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/tag-battle/index.html", { cache: "force-cache" });
        const txt = await res.text();
        if (cancelled) return;
        const configured =
          /const\s+FIREBASE_CONFIG\s*=\s*\{/.test(txt) &&
          !/const\s+FIREBASE_CONFIG\s*=\s*null/.test(txt.split("const FIREBASE_CONFIG")[1] ?? "");
        setBackend(configured ? "configured" : "offline");
      } catch {
        if (!cancelled) setBackend("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const statusColor =
    backend === "configured"
      ? "text-off"
      : backend === "offline"
        ? "text-off/40"
        : "text-off/70";
  const statusGlyph =
    backend === "configured" ? "●" : backend === "offline" ? "○" : "·";
  const statusLabel =
    backend === "configured"
      ? "MULTIPLAYER ONLINE"
      : backend === "offline"
        ? "SOLO MODE (no backend)"
        : "CHECKING…";

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex flex-col bg-ink">
      <header className="flex shrink-0 items-center justify-between border-b border-off/15 bg-on px-4 py-2 text-off">
        <div className="flex items-center gap-3">
          <span className="bg-off px-2 py-1 text-[10px] tracking-widest text-on">
            TAG BATTLE
          </span>
          <span
            className={
              "flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-widest " +
              statusColor
            }
            title={
              backend === "configured"
                ? "Firebase backend is wired. To see other players' tags, other Normies holders must sign in (SIWE) in the same zone."
                : backend === "offline"
                  ? "Single-player mode — tags only visible locally."
                  : "Probing…"
            }
          >
            <span>{statusGlyph}</span>
            <span>{statusLabel}</span>
          </span>
          <span className="hidden text-[10px] tracking-wider opacity-50 lg:inline">
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
      {backend === "configured" && (
        <div className="border-b border-off/10 bg-ink/60 px-4 py-1.5 text-[10px] tracking-wider text-off/65">
          To meet other players in real time, both you and they must (1) connect a
          wallet inside the game (SIWE), (2) hold ≥ 1 Normie, and (3) drop into the
          same zone. The Firestore backend syncs the wall in real time.
        </div>
      )}
      <iframe
        title="TAG BATTLE"
        src="/tag-battle/index.html"
        className="block h-full w-full flex-1 border-0 bg-ink"
        allow="autoplay; fullscreen; gamepad; clipboard-write; web-share"
      />
    </div>
  );
}
