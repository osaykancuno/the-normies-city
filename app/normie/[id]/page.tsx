import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchBurnsForReceiver,
  fetchHolder,
  fetchNormieCanvasDiff,
  fetchNormieCanvasInfo,
  fetchNormieMetadata,
  fetchNormieOwner,
  fetchVersions,
  normieImageSvgUrl,
  normieOriginalSvgUrl,
  normieVersionSvgUrl,
} from "@/lib/normies-api";
import type { BurnCommit, NormieVersion } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NormiePage({ params }: PageProps) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 0 || numId > 9999) notFound();

  const [
    metaSettled,
    ownerSettled,
    canvasInfoSettled,
    canvasDiffSettled,
    versionsSettled,
    burnsRecvSettled,
  ] = await Promise.allSettled([
    fetchNormieMetadata(numId),
    fetchNormieOwner(numId),
    fetchNormieCanvasInfo(numId),
    fetchNormieCanvasDiff(numId),
    fetchVersions(numId),
    fetchBurnsForReceiver(numId, 25),
  ]);
  if (metaSettled.status !== "fulfilled") notFound();
  const meta = metaSettled.value;
  const owner = ownerSettled.status === "fulfilled" ? ownerSettled.value.owner : null;
  const canvasInfo = canvasInfoSettled.status === "fulfilled" ? canvasInfoSettled.value : null;
  const canvasDiff = canvasDiffSettled.status === "fulfilled" ? canvasDiffSettled.value : null;
  const versions: NormieVersion[] =
    versionsSettled.status === "fulfilled" ? versionsSettled.value : [];
  const burnsReceived: BurnCommit[] =
    burnsRecvSettled.status === "fulfilled" ? burnsRecvSettled.value : [];

  // Optional owner portfolio (best-effort).
  let holderTokens: number[] = [];
  if (owner) {
    try {
      const holder = await fetchHolder(owner);
      // Official API returns `{ address, tokenIds: string[] }` directly.
      holderTokens = (holder.tokenIds ?? [])
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 9999 && n !== numId)
        .slice(0, 48);
    } catch {}
  }

  const customized = meta.attributes.find((a) => a.trait_type === "Customized")?.value === "Yes";

  return (
    <main className="h-screen w-screen overflow-y-auto bg-ink text-off">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <Link
          href="/"
          className="mb-6 inline-block bg-on px-2 py-1 text-[10px] tracking-widest hover:bg-off/10"
        >
          ← BACK TO CITY
        </Link>

        <div className="grid gap-8 md:grid-cols-[320px_1fr]">
          <div>
            <div className="grid grid-cols-2 gap-1">
              <Pane label="NOW">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={normieImageSvgUrl(numId)}
                  alt={meta.name}
                  className="h-full w-full"
                  style={{ imageRendering: "pixelated" }}
                />
              </Pane>
              <Pane label="ORIGINAL">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={normieOriginalSvgUrl(numId)}
                  alt={`${meta.name} original`}
                  className="h-full w-full"
                  style={{ imageRendering: "pixelated" }}
                />
              </Pane>
            </div>

            <h1 className="mt-4 text-2xl tracking-widest">{meta.name}</h1>

            {owner && (
              <div className="mt-3 break-all bg-on p-2 text-[10px]">
                <div className="opacity-50">OWNER</div>
                <a
                  className="underline"
                  href={`https://etherscan.io/address/${owner}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {owner}
                </a>
                <div className="mt-1 flex gap-2">
                  <a
                    className="underline opacity-70 hover:opacity-100"
                    href={`https://opensea.io/${owner}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    opensea
                  </a>
                  <Link className="underline opacity-70 hover:opacity-100" href={`/holder/${owner}`}>
                    portfolio
                  </Link>
                </div>
              </div>
            )}

            <a
              className="mt-2 block break-all bg-on px-2 py-1 text-[10px] hover:bg-off/10"
              href="https://opensea.io/collection/normies"
              target="_blank"
              rel="noreferrer"
            >
VIEW NORMIES ON OPENSEA →
            </a>
          </div>

          <div className="flex flex-col gap-6">
            <Section title="TRAITS">
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {meta.attributes
                  .filter((a) => a.display_type !== "number" || a.trait_type !== "Pixel Count")
                  .map((a) => (
                    <li key={a.trait_type} className="flex justify-between bg-on/70 px-2 py-1">
                      <span className="opacity-60">{a.trait_type}</span>
                      <span>{String(a.value)}</span>
                    </li>
                  ))}
              </ul>
            </Section>

            {(canvasInfo || canvasDiff) && (
              <Section title="CANVAS">
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <Stat label="LEVEL" value={canvasInfo?.level ?? "—"} />
                  <Stat label="ACTION POINTS" value={canvasInfo?.actionPoints ?? "—"} />
                  <Stat
                    label="CUSTOMIZED"
                    value={(canvasInfo?.customized ?? customized) ? "YES" : "NO"}
                  />
                  {canvasInfo?.pixelCount != null && (
                    <Stat label="PIXELS NOW" value={canvasInfo.pixelCount} />
                  )}
                  {canvasInfo?.originalPixelCount != null && (
                    <Stat label="PIXELS BEFORE" value={canvasInfo.originalPixelCount} />
                  )}
                  {canvasDiff?.addedCount != null && (
                    <Stat label="ADDED" value={`+${canvasDiff.addedCount}`} />
                  )}
                  {canvasDiff?.removedCount != null && (
                    <Stat label="REMOVED" value={`−${canvasDiff.removedCount}`} />
                  )}
                  {canvasDiff?.netChange != null && (
                    <Stat
                      label="NET CHANGE"
                      value={`${canvasDiff.netChange > 0 ? "+" : ""}${canvasDiff.netChange}`}
                    />
                  )}
                </div>
              </Section>
            )}

            {versions.length > 0 && (
              <Section title={`VERSION HISTORY · ${versions.length}`}>
                <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {versions.map((v) => (
                    <li key={v.version} className="bg-on/70 p-1 text-[10px]">
                      <div className="aspect-square w-full bg-off">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={normieVersionSvgUrl(numId, v.version)}
                          alt={`v${v.version}`}
                          className="h-full w-full"
                          style={{ imageRendering: "pixelated" }}
                          loading="lazy"
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span>v{v.version}</span>
                        {v.txHash && (
                          <a
                            className="underline opacity-60 hover:opacity-100"
                            href={`https://etherscan.io/tx/${v.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            tx
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {burnsReceived.length > 0 && (
              <Section title={`BURNS RECEIVED · ${burnsReceived.length}`}>
                <ul className="space-y-1 text-[11px]">
                  {burnsReceived.map((b) => (
                    <li key={b.commitId} className="flex items-center justify-between bg-on/70 px-2 py-1">
                      <span className="opacity-60">commit {b.commitId}</span>
                      <span className="tabular-nums">{b.tokenCount} burned</span>
                      <span className="tabular-nums opacity-60">{b.totalActions} AP</span>
                      <a
                        className="underline opacity-60 hover:opacity-100"
                        href={`https://etherscan.io/tx/${b.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        tx
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {holderTokens.length > 0 && (
              <Section title={`OWNER ALSO HOLDS · ${holderTokens.length}`}>
                <ul className="grid grid-cols-6 gap-1 sm:grid-cols-12">
                  {holderTokens.map((tid) => (
                    <li key={tid}>
                      <Link href={`/normie/${tid}`} className="block">
                        <div className="aspect-square w-full bg-off" title={`#${tid}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={normieImageSvgUrl(tid)}
                            alt={`#${tid}`}
                            className="h-full w-full"
                            style={{ imageRendering: "pixelated" }}
                            loading="lazy"
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[10px] tracking-widest opacity-60">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-on/70 px-2 py-1.5">
      <div className="text-[9px] tracking-widest opacity-50">{label}</div>
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

