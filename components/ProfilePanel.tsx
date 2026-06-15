"use client";

import { useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useCity } from "@/lib/store";
import AwakenedPanel from "./AwakenedPanel";
import NormieImage from "./NormieImage";
import CanvasDiffOverlay from "./CanvasDiffOverlay";
import VersionTimeline from "./VersionTimeline";
import type { NormieVersion } from "@/lib/types";
import type {
  BurnedTokenInfo,
  CanvasDiff,
  CanvasInfo,
  HolderInfo,
  NormieMetadata,
} from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ProfilePanel() {
  const selection = useCity((s) => s.selection);
  if (!selection) return null;
  if (selection.kind === "holder") return <HolderPanel address={selection.address} />;
  if (selection.kind === "normie") return <NormiePanel tokenId={selection.tokenId} />;
  return <BurnedPanel tokenId={selection.tokenId} />;
}

function Frame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto absolute left-3 top-24 z-10 w-[min(320px,calc(100vw-1.5rem))] max-h-[calc(100vh-7rem)] overflow-y-auto bg-on text-off shadow-[0_4px_24px_-6px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between border-b border-off/15 px-3 py-2">
        <div className="text-sm tracking-widest">{title}</div>
        <button className="text-off/60 hover:text-off" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// HOLDER
// -----------------------------------------------------------------------------

function HolderPanel({ address }: { address: string }) {
  const buildings = useCity((s) => s.buildingsByAddress);
  const setSelection = useCity((s) => s.setSelection);
  const reconcileHolder = useCity((s) => s.reconcileHolder);
  const b = buildings.get(address.toLowerCase());
  const tokens = b?.tokenIds ?? [];

  // Live drift fix: when the panel opens we fetch the holder's current portfolio
  // from api.normies.art and reconcile against our snapshot. Catches transfers
  // that happened between the snapshot build (~hours ago) and now — the on-chain
  // transfer poll only covers a rolling 40-min window, so anything older would
  // otherwise stay stale until a fresh transfer touched it.
  const { data: live } = useSWR<{ holder: HolderInfo | null }>(
    `/api/holder/${address}`,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );
  useEffect(() => {
    if (!live?.holder?.tokenIds) return;
    const ids = live.holder.tokenIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 9999);
    reconcileHolder(address, ids);
  }, [live, address, reconcileHolder]);

  return (
    <Frame title={`HOLDER · ${tokens.length} NORMIES`} onClose={() => setSelection(null)}>
      <a
        className="block break-all bg-ink/40 px-2 py-1 text-[10px] underline opacity-90"
        href={`https://etherscan.io/address/${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {address}
      </a>

      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        <Stat label="HELD" value={tokens.length} />
        <Stat label="RANK" value={b ? `#${b.rank + 1}` : "—"} />
      </div>

      {tokens.length > 0 && (
        <>
          <div className="mt-3 text-[9px] tracking-widest opacity-50">PORTFOLIO</div>
          <ul className="mt-1 grid max-h-[230px] grid-cols-4 gap-1 overflow-y-auto">
            {tokens.slice(0, 48).map((id) => (
              <li key={id}>
                <button
                  onClick={() => setSelection({ kind: "normie", tokenId: id })}
                  className="block aspect-square w-full bg-off hover:ring-1 hover:ring-off"
                  title={`#${id}`}
                >
                  {/* overlaySvg on: the atlas baseline shows instantly, and the
                      live SVG corrects any blank/stale atlas cell on top. */}
                  <NormieImage tokenId={id} title={`#${id}`} />
                </button>
              </li>
            ))}
            {tokens.length > 48 && (
              <li className="col-span-4 text-center text-[10px] opacity-60">
                +{tokens.length - 48} more
              </li>
            )}
          </ul>
        </>
      )}

      <Link
        href={`/holder/${address}`}
        className="mt-3 block border border-off/20 px-2 py-1 text-center text-[10px] tracking-widest hover:bg-off/10"
      >
        OPEN HOLDER PAGE →
      </Link>
    </Frame>
  );
}

// -----------------------------------------------------------------------------
// NORMIE
// -----------------------------------------------------------------------------

function NormiePanel({ tokenId }: { tokenId: number }) {
  const setSelection = useCity((s) => s.setSelection);
  const traits = useCity((s) => s.traits);
  const isAwakened = useCity((s) => s.awakenedSet.has(tokenId));
  const openChat = useCity((s) => s.openChat);
  const awakenedName = useCity((s) => s.awakenedAgents.get(tokenId)?.name);
  const compact = traits?.[tokenId];

  // refreshInterval lets every SWR consumer in this panel automatically
  // recover when api.normies.art comes back online — no manual reload
  // needed. 30 s matches the upstream Vercel edge cache TTL so we're not
  // hammering the route between hits.
  const { data: meta } = useSWR<NormieMetadata>(
    `/api/normie/${tokenId}`,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, revalidateOnReconnect: true },
  );
  const { data: canvas } = useSWR<{ info: CanvasInfo | null; diff: CanvasDiff | null }>(
    `/api/normie/${tokenId}/canvas`,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, revalidateOnReconnect: true },
  );
  const { data: versions } = useSWR<NormieVersion[]>(
    `/api/normie/${tokenId}/versions`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, revalidateOnReconnect: true },
  );

  const customized = compact?.customized || canvas?.info?.customized;
  const hasVersions = Array.isArray(versions) && versions.length > 0;

  return (
    <Frame title={`NORMIE #${tokenId}`} onClose={() => setSelection(null)}>
      <div className="grid grid-cols-2 gap-1">
        <Pane label="NOW">
          {/* NormieImage renders the atlas baseline first (always works) and
              fades in the canvas-aware SVG on top when the upstream is up. */}
          <NormieImage tokenId={tokenId} title={`#${tokenId}`} />
        </Pane>
        {customized && (
          <Pane label="ORIGINAL">
            {/* The "original" view is the pre-Canvas pixel state. The atlas
                IS the original baseline, so disable the SVG overlay here —
                we don't want to fade in the current customised version. */}
            <NormieImage
              tokenId={tokenId}
              overlaySvg={false}
              title={`#${tokenId} original`}
            />
          </Pane>
        )}
      </div>

      {compact && (
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[10px]">
          <Trait k="TYPE" v={compact.type} />
          <Trait k="GENDER" v={compact.gender} />
          <Trait k="AGE" v={compact.age} />
          <Trait k="HAIR" v={compact.hairStyle} />
          <Trait k="FACIAL" v={compact.facialFeature} />
          <Trait k="EYES" v={compact.eyes} />
          <Trait k="EXPR" v={compact.expression} />
          <Trait k="ACC" v={compact.accessory} />
          <Trait k="LEVEL" v={compact.level} />
          <Trait k="PIXELS" v={compact.pixelCount} />
          <Trait k="AP" v={compact.actionPoints} />
          <Trait k="CANVAS" v={customized ? "Yes" : "No"} />
        </dl>
      )}

      {customized && canvas?.diff && (canvas.diff.addedCount || canvas.diff.removedCount) ? (
        <div className="mt-3 grid grid-cols-[1fr_1fr] gap-2">
          <Pane label="DIFF">
            <CanvasDiffOverlay diff={canvas.diff} />
          </Pane>
          <div className="flex flex-col justify-between border border-off/15 px-2 py-1.5 text-[10px]">
            <div>
              <div className="opacity-50 tracking-widest">PIXEL DIFF</div>
              <div className="mt-1 flex gap-3 tabular-nums">
                <span>+{canvas.diff.addedCount ?? 0}</span>
                <span>−{canvas.diff.removedCount ?? 0}</span>
              </div>
            </div>
            {canvas.diff.netChange != null && (
              <div className="opacity-60">net {canvas.diff.netChange > 0 ? "+" : ""}{canvas.diff.netChange}</div>
            )}
          </div>
        </div>
      ) : null}

      {hasVersions && (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between text-[9px] tracking-widest opacity-50">
            <span>EVOLUTION</span>
            <span className="tabular-nums opacity-70">{versions!.length} versions</span>
          </div>
          <VersionTimeline tokenId={tokenId} versions={versions!} />
        </div>
      )}

      {meta && <div className="mt-3 truncate text-[10px] opacity-60">{meta.name}</div>}

      {isAwakened ? (
        <>
          <button
            type="button"
            onClick={() => openChat(tokenId)}
            className="mt-3 block w-full bg-off px-2 py-1.5 text-center text-[10px] tracking-widest text-on hover:bg-off/80"
          >
            ◉ TALK TO {(awakenedName ?? `#${tokenId}`).toUpperCase()} →
          </button>
          <AwakenedPanel tokenId={tokenId} />
        </>
      ) : (
        <a
          href="https://normies.art/lab"
          target="_blank"
          rel="noreferrer"
          className="mt-3 block bg-off px-2 py-1.5 text-center text-[10px] tracking-widest text-on hover:bg-off/80"
          title="Bind this Normie to an ERC-8004 agent identity"
        >
          AWAKEN YOURS → normies.art/lab
        </a>
      )}

      <Link
        href={`/normie/${tokenId}`}
        className="mt-3 block border border-off/20 px-2 py-1 text-center text-[10px] tracking-widest hover:bg-off/10"
      >
        OPEN FULL PROFILE →
      </Link>
    </Frame>
  );
}

// -----------------------------------------------------------------------------
// BURNED
// -----------------------------------------------------------------------------

function BurnedPanel({ tokenId }: { tokenId: number }) {
  const setSelection = useCity((s) => s.setSelection);
  const { data } = useSWR<BurnedTokenInfo>(`/api/burned/${tokenId}`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  return (
    <Frame title={`BURNED · #${tokenId}`} onClose={() => setSelection(null)}>
      <div className="mx-auto aspect-square w-full max-w-[200px] bg-off opacity-70">
        <NormieImage tokenId={tokenId} burned title={`#${tokenId} burned`} />
      </div>
      {data && (
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[10px]">
          {data.commitId != null && <Trait k="COMMIT" v={String(data.commitId)} />}
          {data.receiverTokenId != null && (
            <Trait k="RECEIVER" v={`#${data.receiverTokenId}`} />
          )}
          {data.burnedAt != null && <Trait k="BURNED AT" v={String(data.burnedAt)} />}
        </dl>
      )}
      <Link
        href={`/normie/${tokenId}`}
        className="mt-3 block border border-off/20 px-2 py-1 text-center text-[10px] tracking-widest hover:bg-off/10"
      >
        OPEN FULL PROFILE →
      </Link>
    </Frame>
  );
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function Trait({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <>
      <dt className="opacity-50">{k}</dt>
      <dd className="truncate">{v == null || v === "" ? "—" : String(v)}</dd>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-ink/40 px-2 py-1">
      <div className="opacity-50">{label}</div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest opacity-50">{label}</div>
      <div className="aspect-square w-full bg-off">{children}</div>
    </div>
  );
}
