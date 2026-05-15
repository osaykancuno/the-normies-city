// Server-side client. Always called from Next route handlers or RSC — never from the
// browser. Uses Next fetch cache for edge-level deduping under the 60 req/min budget.

import type {
  BurnCommit,
  BurnedTokenInfo,
  CanvasDiff,
  CanvasInfo,
  CanvasStatus,
  HistoryStats,
  HolderInfo,
  NormieMetadata,
  NormieVersion,
} from "./types";

const BASE = process.env.NORMIES_API_BASE || "https://api.normies.art";

async function get<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`normies-api ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------- core ----------

export const fetchStats = () => get<HistoryStats>("/history/stats", 15);
export const fetchCanvasStatus = () => get<CanvasStatus>("/canvas/status", 30);

export const fetchNormieMetadata = (id: number) =>
  get<NormieMetadata>(`/normie/${id}/metadata`, 60);
export const fetchNormieOwner = (id: number) =>
  get<{ owner: string }>(`/normie/${id}/owner`, 30);
export const fetchNormieCanvasInfo = (id: number) =>
  get<CanvasInfo>(`/normie/${id}/canvas/info`, 30);
export const fetchNormieCanvasDiff = (id: number) =>
  get<CanvasDiff>(`/normie/${id}/canvas/diff`, 30);

// ---------- history ----------

export const fetchRecentBurns = (limit = 20) =>
  get<BurnCommit[]>(`/history/burns?limit=${limit}`, 10);
export const fetchBurnsForReceiver = (tokenId: number, limit = 20, offset = 0) =>
  get<BurnCommit[]>(
    `/history/burns/receiver/${tokenId}?limit=${limit}&offset=${offset}`,
    60,
  );

/** Paginated walk of ALL burns ever committed against a given receiver token.
 *  Some Normies have 100+ burns received over their lifetime — the upstream
 *  endpoint caps each page at 100, so we walk offsets until a short page comes
 *  back. Used by Portfolio Heritage where undercounting is a correctness bug. */
export async function fetchAllBurnsForReceiver(
  tokenId: number,
): Promise<BurnCommit[]> {
  const PAGE = 100;
  const all: BurnCommit[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchBurnsForReceiver(tokenId, PAGE, offset);
    all.push(...page);
    if (page.length < PAGE) break;
    if (offset > 5000) break; // defensive
  }
  return all;
}
export const fetchBurnsForAddress = (address: string, limit = 50, offset = 0) =>
  get<BurnCommit[]>(
    `/history/burns/address/${address}?limit=${limit}&offset=${offset}`,
    60,
  );

/** Walk every burn commit attributable to an address. The upstream caps each
 *  page at 100 items regardless of the requested limit; without pagination a
 *  whale's burn-history pill showed "12 commits" when the real count was
 *  several hundred. Used by the holder page. */
export async function fetchAllBurnsForAddress(
  address: string,
): Promise<BurnCommit[]> {
  const PAGE = 100;
  const all: BurnCommit[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchBurnsForAddress(address, PAGE, offset);
    all.push(...page);
    if (page.length < PAGE) break;
    if (offset > 10000) break; // defensive
  }
  return all;
}
export const fetchBurnCommit = (commitId: string) =>
  get<BurnCommit>(`/history/burns/${commitId}`, 300);

export const fetchBurnedTokens = (limit = 100, offset = 0) =>
  get<BurnedTokenInfo[]>(`/history/burned-tokens?limit=${limit}&offset=${offset}`, 300);

/** The upstream endpoint caps each page at 100 items regardless of the requested
 *  limit — walk the offsets and concatenate until the API returns short. The result
 *  is served from /api/burned-tokens with a long edge-cache so this only hits the
 *  upstream every ~5 min. */
export async function fetchAllBurnedTokens(): Promise<BurnedTokenInfo[]> {
  const PAGE = 100;
  const all: BurnedTokenInfo[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchBurnedTokens(PAGE, offset);
    all.push(...page);
    if (page.length < PAGE) break;
    // Defensive cap to avoid runaway loops if the API ever misbehaves.
    if (offset > 20000) break;
  }
  return all;
}
export const fetchBurnedToken = (tokenId: number) =>
  get<BurnedTokenInfo>(`/history/burned/${tokenId}`, 300);

export const fetchVersions = (id: number) =>
  get<NormieVersion[]>(`/history/normie/${id}/versions`, 30);

// ---------- holders ----------

export const fetchHolder = (address: string) =>
  get<HolderInfo>(`/holders/${address}`, 60);

// ---------- image URLs (browsers fetch these directly, with their own caching) ----------

export const normieImageSvgUrl = (id: number) => `${BASE}/normie/${id}/image.svg`;
export const normieOriginalSvgUrl = (id: number) => `${BASE}/normie/${id}/original/image.svg`;
export const normieVersionSvgUrl = (id: number, version: number) =>
  `${BASE}/history/normie/${id}/version/${version}/image.svg`;
export const burnedImageSvgUrl = (tokenId: number) =>
  `${BASE}/history/burned/${tokenId}/image.svg`;
