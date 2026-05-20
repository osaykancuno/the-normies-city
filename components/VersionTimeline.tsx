"use client";

import { useState } from "react";
import NormieImage from "./NormieImage";
import type { NormieVersion } from "@/lib/types";

// Horizontal strip of historical Normie snapshots, one thumbnail per
// recorded Canvas version. Renders the chronological evolution of a
// customised Normie at a glance: the leftmost cell is the mint state, the
// rightmost is the current state.
//
// Visual structure of each cell:
//   - background: atlas baseline (always renders, even with upstream down)
//   - overlay: /history/normie/{id}/version/{v}/image.svg if reachable —
//     this is the only way to see intermediate states (the atlas only
//     holds the original / current pair). Fades in once loaded.
//   - label band underneath with version number + relative timestamp
//
// We deliberately reuse <NormieImage> for the original state because that
// guarantees a pixel-perfect baseline. Intermediate versions need the
// upstream SVG; when it 502s we just show the atlas underneath with the
// version label as a placeholder so the strip never goes blank.

const SVG_BASE = process.env.NEXT_PUBLIC_NORMIES_API_BASE || "https://api.normies.art";

export default function VersionTimeline({
  tokenId,
  versions,
}: {
  tokenId: number;
  versions: NormieVersion[];
}) {
  if (!versions || versions.length === 0) return null;

  // Sort ascending by version so the timeline reads left-to-right oldest
  // → newest. Upstream usually returns them in this order already but we
  // sort defensively.
  const ordered = [...versions].sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex gap-1 px-1">
        {ordered.map((v) => (
          <Cell key={v.version} tokenId={tokenId} v={v} />
        ))}
      </ul>
    </div>
  );
}

function Cell({ tokenId, v }: { tokenId: number; v: NormieVersion }) {
  const isOriginal = (v.version ?? 0) === 0;
  // v0 is the on-chain original — atlas covers it perfectly and we skip
  // the SVG round-trip. Later versions need the historical SVG endpoint.
  const svgUrl = isOriginal
    ? null
    : `${SVG_BASE}/history/normie/${tokenId}/version/${v.version}/image.svg`;
  const [loaded, setLoaded] = useState(false);

  const ts =
    v.timestamp != null
      ? new Date(Number(v.timestamp) * 1000).toLocaleDateString()
      : null;

  return (
    <li
      className="flex w-14 flex-none flex-col items-stretch"
      title={
        `version ${v.version}` +
        (ts ? ` · ${ts}` : "") +
        (v.diffAdded != null ? ` · +${v.diffAdded}` : "") +
        (v.diffRemoved != null ? ` · −${v.diffRemoved}` : "")
      }
    >
      <div className="relative aspect-square w-full bg-off">
        <NormieImage tokenId={tokenId} overlaySvg={false} />
        {svgUrl && (
          // Historical state overlay on top of the atlas baseline. Fades
          // in when (and if) the upstream SVG arrives; otherwise the
          // atlas baseline remains as the placeholder.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={svgUrl}
            alt=""
            aria-hidden="true"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(false)}
            className="absolute inset-0 h-full w-full"
            style={{
              imageRendering: "pixelated",
              opacity: loaded ? 1 : 0,
              transition: "opacity 180ms ease-out",
            }}
          />
        )}
      </div>
      <div className="mt-0.5 text-center text-[9px] tracking-widest opacity-70">
        v{v.version}
      </div>
    </li>
  );
}
