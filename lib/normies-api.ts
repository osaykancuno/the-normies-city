// Server-side client. Always called from Next route handlers or RSC — never from the
// browser. Two layers of protection sit on top of each request:
//   1. Vercel edge cache (`next.revalidate`) deduplicates concurrent traffic.
//   2. lib/api-cache `cachedGetJson` keeps the last-known-good response per
//      URL in server memory and serves it transparently when the upstream
//      Ponder indexer 502s — a routine occurrence that used to blank out
//      every history-driven page in the app.

import { cachedFetchJson, cachedGetJson } from "./api-cache";
import type {
  AgentBinding,
  AgentCard,
  AgentInfo,
  AgentMetadata,
  BurnCommit,
  BurnedTokenInfo,
  CanvasDiff,
  CanvasInfo,
  CanvasStatus,
  HistoryStats,
  HolderInfo,
  LegendaryCanvas,
  NormieMetadata,
  NormieVersion,
  RarityListedItem,
  RarityStats,
  ZombieConversion,
} from "./types";

export const BASE = process.env.NORMIES_API_BASE || "https://api.normies.art";

async function get<T>(path: string, revalidate: number): Promise<T> {
  return cachedGetJson<T>(`${BASE}${path}`, { revalidate });
}

/** Same as `get<T>` but exposes the cache metadata. Use it from route
 *  handlers that want to surface a stale-data indicator to the client. */
export async function getWithFreshness<T>(
  path: string,
  revalidate: number,
): Promise<{ data: T; stale: boolean; lastFetched: number | null }> {
  return cachedFetchJson<T>(`${BASE}${path}`, { revalidate });
}

// ---------- core ----------

export const fetchStats = () => get<HistoryStats>("/history/stats", 15);
export const fetchCanvasStatus = () => get<CanvasStatus>("/canvas/status", 30);
export const fetchLegendaryCanvas = () => get<LegendaryCanvas[]>("/legendary-canvas", 60);
export const fetchZombieConversions = () => get<ZombieConversion[]>("/zombies/conversions", 30);
export const fetchRarityStats = () => get<RarityStats>("/rarity/stats", 15);
export const fetchListedNormies = (page: number, limit = 100) =>
  get<{ items: RarityListedItem[] }>(
    `/rarity/normies?listed=1&sort=price&order=asc&page=${page}&limit=${limit}`,
    30,
  );

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

// ---------- agents (ERC-8004) ----------
//
// The Awakening: every Normie can be bound to an ERC-8004 agent identity via the
// Adapter8004 contract. The persona is computed deterministically server-side
// from the on-chain trait + canvas state — same inputs → same persona, every
// time, on any machine.

export const fetchAgentBinding = (tokenId: number) =>
  get<{ binding: AgentBinding | null }>(`/agents/binding/${tokenId}`, 60);

export const fetchAgentInfo = (tokenId: number) =>
  get<AgentInfo>(`/agents/info/${tokenId}`, 120);

export const fetchAgentMetadata = (tokenId: number) =>
  get<AgentMetadata>(`/agents/metadata/${tokenId}`, 60);

export const fetchAgentCard = (tokenId: number) =>
  get<AgentCard>(`/agents/agent-card/${tokenId}`, 120);

/** Deterministic persona preview — works for ANY token ID (including ones
 *  where /agents/metadata and /agents/info are currently broken upstream).
 *  Same persona generation logic as the live endpoints, computed
 *  server-side from on-chain bytes. Used as the last-resort fallback in the
 *  snapshot route so name search achieves 100 % coverage. */
export const fetchAgentPersonaPreview = (tokenId: number) =>
  get<{ name: string; type: string; tagline: string }>(
    `/agents/persona-preview/${tokenId}`,
    300, // long edge cache: previews are deterministic, never change for a given id
  );

/** Batch resolve binding for a set of token IDs. The upstream returns only the
 *  awakened entries — non-awakened tokens are omitted from the response, so a
 *  10 k-id payload comes back tiny (~18 KB for the 52 awakened today).
 *  Wrapped by cachedFetchJson so we keep serving the last-known good batch
 *  when the upstream is down. */
export async function fetchAgentBindingsBatch(
  tokenIds: number[],
): Promise<Record<string, AgentBinding>> {
  const body = JSON.stringify({ tokenIds });
  const { data } = await cachedFetchJson<{
    bindings?: Record<string, AgentBinding>;
  }>(`${BASE}/agents/binding/batch`, {
    revalidate: 30,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  });
  return data.bindings ?? {};
}

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
