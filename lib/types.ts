// Shared types across client + server. Mirrors the api.normies.art shape.

// Trait enums mirror the official api.normies.art docs (V4 renderer).
// The `| string` widens each union so the app keeps rendering if upstream
// ever introduces a new value before we update the literals.
export type NormieType = "Human" | "Cat" | "Agent" | "Alien";
export type NormieGender = "Male" | "Female" | "Non-Binary" | string;
export type NormieAge = "Young" | "Middle-Aged" | "Old" | string;

export interface NormieCompact {
  exists: boolean;
  type: NormieType | null;
  gender: NormieGender | null;
  age: NormieAge | null;
  hairStyle: string | null;
  facialFeature: string | null;
  eyes: string | null;
  expression: string | null;
  accessory: string | null;
  level: number;
  pixelCount: number;
  actionPoints: number;
  customized: boolean;
}

export interface NormieMetadata {
  name: string;
  description?: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number; display_type?: string }>;
}

export interface BurnCommit {
  commitId: string;
  owner: string;
  receiverTokenId: string;
  tokenCount: number;
  transferredActionPoints: string;
  pixelCounts: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
  revealed: boolean;
  totalActions: string;
  expired: boolean;
  revealBlockNumber?: string;
  revealTimestamp?: string;
  revealTxHash?: string;
}

export interface HistoryStats {
  totalBurnCommitments: number;
  totalBurnedTokens: number;
  totalTransforms: number;
  totalActionPointsDistributed: string;
}

export interface CanvasStatus {
  paused: boolean;
  maxBurnPercent: number;
  tierThresholds: number[];
  tierMinPercents: number[];
}

/** Per-Normie Canvas state from /normie/:id/canvas/info. Loosely typed — exact fields
 *  are not strictly documented, so we keep a permissive shape. */
export interface CanvasInfo {
  level?: number;
  actionPoints?: number;
  customized?: boolean;
  lastTransformAt?: string;
  pixelCount?: number;
  originalPixelCount?: number;
  [key: string]: unknown;
}

/** Diff between a Normie's original and current Canvas bitmap. The API returns count
 *  scalars alongside coordinate arrays — we read the counts. */
export interface CanvasDiff {
  added?: Array<{ x: number; y: number }>;
  removed?: Array<{ x: number; y: number }>;
  addedCount?: number;
  removedCount?: number;
  netChange?: number;
  [key: string]: unknown;
}

/** Result of /holders/:address — owner's portfolio. The official API returns
 *  `{ address, tokenIds: string[] }` directly. */
export interface HolderInfo {
  address?: string;
  tokenIds?: string[];
  [key: string]: unknown;
}

export interface BurnedTokenInfo {
  tokenId: string;
  burnedAt?: string;
  commitId?: string;
  receiverTokenId?: string;
  lastImage?: string;
  [key: string]: unknown;
}

export interface NormieVersion {
  version: number;
  txHash?: string;
  blockNumber?: string;
  timestamp?: string;
  pixelCount?: number;
  diffAdded?: number;
  diffRemoved?: number;
}

export type ActivityEvent =
  | { kind: "burn"; commit: BurnCommit; receivedAt: number }
  | { kind: "transform"; tokenId: number; commitId: string; receivedAt: number }
  | { kind: "transfer"; tokenId: number; from: string; to: string; txHash: string; receivedAt: number }
  | { kind: "newHolder"; address: string; tokenId: number; receivedAt: number }
  | { kind: "awakened"; tokenId: number; agentId: string; name: string; receivedAt: number };

// ---------- ERC-8004 agent layer ----------
// See https://eips.ethereum.org/EIPS/eip-8004 and the Adapter8004 (ERC-8217) contract.

export interface AgentBinding {
  id: string;            // "0:0x9eb6…:4354"
  agentId: string;       // "32362"
  standard?: number;
  tokenContract: string;
  tokenId: string;
  registeredBy: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
}

export interface AgentMetadata {
  type: string;
  name: string;          // "Normie #4354 - Zori"
  description: string;
  image: string;
  services?: Array<{ name: string; endpoint: string; version: string }>;
  active?: boolean;
  x402Support?: boolean;
  updatedAt?: number;
}

export interface AgentInfo {
  tokenId: string;
  agentId: string;
  chainId: number;
  name: string;
  type: string;
  tagline: string;
  backstory: string;
  greeting: string;
  personalityTraits: string[];
  communicationStyle: string;
  quirks: string[];
  systemPrompt?: string;
  traits?: { name: string; attributes: Record<string, string> };
  canvas?: {
    level: number;
    actionPoints: number;
    customized: boolean;
    diff?: {
      added?: Array<{ x: number; y: number }>;
      removed?: Array<{ x: number; y: number }>;
    };
  };
}

export interface AgentCard {
  name: string;
  description: string;
  supportedInterfaces?: Array<{ url: string; protocolBinding: string; protocolVersion: string }>;
  provider?: { organization: string; url: string };
  iconUrl?: string;
  capabilities?: Record<string, boolean>;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
  }>;
}

/** Compact awakened-Normie row exposed by /api/agents/snapshot. */
export interface AwakenedRow {
  tokenId: number;
  agentId: string;
  name: string;
  tagline: string;
}

/** Live holder state. Both directions are kept so we can do O(1) updates on transfer:
 *  - byToken: token id → owner address (canonical truth)
 *  - byAddress: derived index for fast portfolio lookups
 *  Burned tokens are kept in a separate set so they don't pollute the holder map. */
export interface HolderState {
  byToken: (string | null)[]; // length 10000; null = unminted/burned/unknown
  byAddress: Map<string, Set<number>>;
}

export interface AtlasMeta {
  size: number;
  cell: number;
  cols: number;
  rows: number;
  total: number;
  colorOn: string;
  colorOff: string;
  formula: string;
  builtAt: string;
}
