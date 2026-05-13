"use client";

import useSWR from "swr";
import Link from "next/link";
import { useCity } from "@/lib/store";
import type {
  BurnedTokenInfo,
  CanvasDiff,
  CanvasInfo,
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
    <div className="pointer-events-auto absolute left-3 top-24 z-10 w-[320px] bg-on text-off">
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
  const b = buildings.get(address.toLowerCase());
  const tokens = b?.tokenIds ?? [];

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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.normies.art/normie/${id}/image.svg`}
                    alt={`#${id}`}
                    className="h-full w-full"
                    style={{ imageRendering: "pixelated" }}
                    loading="lazy"
                  />
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
  const compact = traits?.[tokenId];

  const { data: meta } = useSWR<NormieMetadata>(`/api/normie/${tokenId}`, fetcher);
  const { data: canvas } = useSWR<{ info: CanvasInfo | null; diff: CanvasDiff | null }>(
    `/api/normie/${tokenId}/canvas`,
    fetcher
  );

  const customized = compact?.customized || canvas?.info?.customized;

  return (
    <Frame title={`NORMIE #${tokenId}`} onClose={() => setSelection(null)}>
      <div className="grid grid-cols-2 gap-1">
        <Pane label="NOW">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.normies.art/normie/${tokenId}/image.svg`}
            alt={`#${tokenId}`}
            className="h-full w-full"
            style={{ imageRendering: "pixelated" }}
          />
        </Pane>
        {customized && (
          <Pane label="ORIGINAL">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.normies.art/normie/${tokenId}/original/image.svg`}
              alt={`#${tokenId} original`}
              className="h-full w-full"
              style={{ imageRendering: "pixelated" }}
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
        <div className="mt-3 border border-off/15 px-2 py-1.5 text-[10px]">
          <div className="opacity-50">PIXEL DIFF</div>
          <div className="flex gap-3 tabular-nums">
            <span>+{canvas.diff.addedCount ?? 0}</span>
            <span>−{canvas.diff.removedCount ?? 0}</span>
          </div>
        </div>
      ) : null}

      {meta && <div className="mt-3 truncate text-[10px] opacity-60">{meta.name}</div>}

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
  const { data } = useSWR<BurnedTokenInfo>(`/api/burned/${tokenId}`, fetcher);

  return (
    <Frame title={`BURNED · #${tokenId}`} onClose={() => setSelection(null)}>
      <div className="mx-auto aspect-square w-full max-w-[200px] bg-off opacity-70">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://api.normies.art/history/burned/${tokenId}/image.svg`}
          alt={`#${tokenId} burned`}
          className="h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
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
