"use client";

import { useState } from "react";
import { ATLAS_COLS, ATLAS_ROWS } from "@/lib/atlas";

// Always-available Normie thumbnail.
//
// Renders the bitmap by slicing the right 40×40 cell out of the on-disk
// /atlas.png (100×100 grid of cells in a single 4000×4000 PNG). The atlas
// is part of our static assets and never depends on api.normies.art, so
// every Normie image keeps rendering even during full upstream outages —
// the failure mode that left the NORMIE panel + holder portfolio grid
// showing blank squares.
//
// Optional `overlaySvg` mode additionally loads the canvas-aware SVG from
// api.normies.art and fades it in once it arrives. That gives customized
// Normies their up-to-date facade when upstream is healthy, while still
// showing the original baseline if the SVG 502s. The atlas stays as the
// always-on bottom layer.
//
// Background-position math: the atlas is a perfect 100×100 grid, so
// background-position percent of `(c / 99) * 100` on each axis exactly
// aligns cell (c, r) with the container when background-size is "10000%"
// (image scaled to 100× the container). This is the standard CSS sprite
// trick — no canvas, no JS sizing, no flicker.

const SVG_BASE = process.env.NEXT_PUBLIC_NORMIES_API_BASE || "https://api.normies.art";

export default function NormieImage({
  tokenId,
  className,
  burned,
  overlaySvg = true,
  style,
  title,
}: {
  tokenId: number;
  className?: string;
  /** If true, treat as a burned token (uses the burned variant of the SVG
   *  overlay, which the upstream renders with a tombstone effect). */
  burned?: boolean;
  /** When true (default), additionally load the upstream SVG over the
   *  atlas baseline. Set to false on heavy grids (holder portfolios) to
   *  skip 20+ network requests during an upstream outage. */
  overlaySvg?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  const col = tokenId % ATLAS_COLS;
  const row = Math.floor(tokenId / ATLAS_COLS);
  const xPct = (col / (ATLAS_COLS - 1)) * 100;
  const yPct = (row / (ATLAS_ROWS - 1)) * 100;

  const baseStyle: React.CSSProperties = {
    backgroundImage: "url(/atlas.png)",
    backgroundSize: "10000% 10000%",
    backgroundPosition: `${xPct}% ${yPct}%`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    width: "100%",
    height: "100%",
    ...(style ?? {}),
  };

  const svgUrl = burned
    ? `${SVG_BASE}/history/burned/${tokenId}/image.svg`
    : `${SVG_BASE}/normie/${tokenId}/image.svg`;

  const [svgLoaded, setSvgLoaded] = useState(false);

  return (
    <div className={className} style={baseStyle} title={title}>
      {overlaySvg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={svgUrl}
          alt=""
          aria-hidden="true"
          onLoad={() => setSvgLoaded(true)}
          onError={() => setSvgLoaded(false)}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            imageRendering: "pixelated",
            opacity: svgLoaded ? 1 : 0,
            transition: "opacity 180ms ease-out",
          }}
        />
      )}
    </div>
  );
}
