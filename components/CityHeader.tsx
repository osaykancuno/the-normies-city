"use client";

import { useState } from "react";
import SearchBar from "./SearchBar";
import SyncBadge from "./SyncBadge";
import NewHoldersBadge from "./NewHoldersBadge";
import RefreshButton from "./RefreshButton";
import AgentModeToggle from "./AgentModeToggle";
import UpstreamBadge from "./UpstreamBadge";
import WalkModeToggle from "./WalkModeToggle";
import CanvasStatusBanner from "./CanvasStatus";

// Responsive top bar. On desktop every control sits inline in one wrapping row,
// exactly as before — the secondary group uses `sm:contents` so its children
// flow into the parent flex. On phones the bar collapses to just the brand +
// search + a `⋯` toggle, so it no longer obstructs the 3D view; tapping `⋯`
// reveals the rest as a wrapped block underneath.
export default function CityHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-2 sm:p-3">
      <div className="pointer-events-auto inline-flex max-w-full flex-wrap items-stretch gap-px bg-ink/40 text-off shadow-[0_2px_24px_-4px_rgba(0,0,0,0.6)]">
        {/* Brand block — compact label on phones, full on tablet+. */}
        <div className="flex items-center bg-off px-2 py-1 text-[11px] tracking-widest text-on sm:px-3 sm:py-1.5 sm:text-sm">
          <span className="sm:hidden">NORMIES CITY</span>
          <span className="hidden sm:inline">THE NORMIES CITY</span>
        </div>

        {/* Search — always visible so you can find a Normie / agent on any device. */}
        <SearchBar />

        {/* Mobile-only: toggle the rest of the controls. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="More controls"
          aria-expanded={open}
          className="flex items-center bg-on px-3 text-off/80 hover:text-off sm:hidden"
        >
          <span className="text-base leading-none">{open ? "✕" : "⋯"}</span>
        </button>

        {/* Secondary controls. Desktop: `sm:contents` dissolves this wrapper so
            its children flow inline in the parent row. Mobile: hidden until the
            `⋯` toggle, then shown as a full-width wrapped block below. */}
        <div
          className={`${
            open ? "flex" : "hidden"
          } basis-full flex-wrap items-stretch gap-px bg-ink/40 sm:contents`}
        >
          {/* Data lineage (desktop only — saves room on phones). */}
          <a
            href="https://api.normies.art/"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center bg-on px-2.5 py-1.5 text-[10px] tracking-wider text-off/70 hover:text-off sm:flex"
          >
            <span className="opacity-60">live from </span>
            <span className="ml-1 underline">api.normies.art</span>
          </a>

          <SyncBadge />
          <NewHoldersBadge />
          <AgentModeToggle />
          <WalkModeToggle />
          <UpstreamBadge />
          <CanvasStatusBanner />
          <RefreshButton />

          <a
            href="https://x.com/osaykancuno"
            target="_blank"
            rel="noreferrer"
            className="flex items-center bg-on px-2.5 py-1.5 text-[10px] tracking-widest text-off/70 transition hover:bg-off hover:text-on"
            title="Built by @osaykancuno"
          >
            <span className="opacity-60">BUILT BY </span>
            <span className="ml-1">@osaykancuno</span>
            <span className="ml-1 opacity-60">↗</span>
          </a>
        </div>
      </div>
    </header>
  );
}
