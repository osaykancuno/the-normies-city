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
export const fetchBurnsForReceiver = (tokenId: number, limit = 20) =>
  get<BurnCommit[]>(`/history/burns/receiver/${tokenId}?limit=${limit}`, 60);
export const fetchBurnsForAddress = (address: string, limit = 50) =>
  get<BurnCommit[]>(`/history/burns/address/${address}?limit=${limit}`, 60);
export const fetchBurnCommit = (commitId: string) =>
  get<BurnCommit>(`/history/burns/${commitId}`, 300);

export const fetchBurnedTokens = (limit = 2000, offset = 0) =>
  get<BurnedTokenInfo[]>(`/history/burned-tokens?limit=${limit}&offset=${offset}`, 300);
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
