"use client";

import type { CanvasDiff } from "@/lib/types";

// Pixel-level visualisation of /normie/{id}/canvas/diff.
//
// The Normie bitmap is 40×40; the diff arrays carry per-pixel {x, y}
// coordinates for everything ADDED and REMOVED since the original mint
// state. We render the diff as a 40×40 SVG grid over a neutral brand-ON
// background so the changes pop:
//   - added pixel → BRAND_OFF cell (the "ink" that was painted in)
//   - removed pixel → BRAND_INK cell (the original ink that was erased)
//   - unchanged → flat brand-ON background
//
// Result: an "X-ray" of how the Normie evolved on Canvas. For an
// uncustomised Normie (both arrays empty) we show a single dimmed message
// instead of an empty grid, keeping the pane self-explanatory.

const BRAND_OFF = "#e3e5e4";
const BRAND_INK = "#1a1b1d";
const BRAND_ON = "#48494b";
const GRID = 40;

export default function CanvasDiffOverlay({
  diff,
  className,
}: {
  diff?: CanvasDiff | null;
  className?: string;
}) {
  const added = diff?.added ?? [];
  const removed = diff?.removed ?? [];
  const empty = added.length === 0 && removed.length === 0;

  if (empty) {
    return (
      <div
        className={
          (className ?? "") +
          " flex h-full w-full items-center justify-center bg-ink/40 p-2 text-center text-[9px] opacity-60"
        }
      >
        no canvas edits
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      preserveAspectRatio="none"
      className={(className ?? "") + " block h-full w-full"}
      style={{ imageRendering: "pixelated", background: BRAND_ON }}
      role="img"
      aria-label={`Canvas diff: +${added.length} pixels added, −${removed.length} removed`}
    >
      {/* Removed pixels — drawn first so additions, if they overlap a
          removal cell at the same coordinate (rare but valid), win the
          z-order and read as the dominant signal. */}
      {removed.map((p, i) => (
        <rect
          key={`r-${p.x}-${p.y}-${i}`}
          x={p.x}
          y={p.y}
          width={1}
          height={1}
          fill={BRAND_INK}
        />
      ))}
      {added.map((p, i) => (
        <rect
          key={`a-${p.x}-${p.y}-${i}`}
          x={p.x}
          y={p.y}
          width={1}
          height={1}
          fill={BRAND_OFF}
        />
      ))}
    </svg>
  );
}
