// Deterministic, zero-cost conversation engine for awakened Normies.
//
// Every reply is assembled from the agent's CANONICAL persona (the free
// /agents/info payload written by the Normies team) and its live on-chain
// numbers — never invented. This gives a "talk to the Normie" experience with
// no paid inference and no hallucination. Phase B swaps `respond()` for a
// Claude Haiku call using the same data + the official systemPrompt; nothing
// else changes.

import type { AgentInfo } from "./types";

export interface SuggestedQuestion {
  id: string;
  label: string;
}

export interface ChatTurn {
  role: "user" | "agent";
  text: string;
}

/**
 * Live on-chain context for an agent's owner + the wider collection. All values
 * are real numbers we already hold in the store — passed in so the deterministic
 * engine can answer with exact figures (portfolio size, rank, supply, totals)
 * instead of vague persona lines. Every field is optional: if a number isn't
 * available the engine falls back to a persona-voiced answer with no number.
 */
export interface DialogueContext {
  ownerPortfolio?: number; // Normies the owner currently holds
  ownerRank?: number; // 1-based rank by portfolio size (1 = biggest wallet)
  totalHolders?: number; // distinct wallets holding ≥1 Normie
  liveSupply?: number; // un-burned Normies still on-chain
  totalBurned?: number; // Normies burned to date
  totalAwakened?: number; // ERC-8004 awakened agents to date
  totalZombies?: number; // Normies converted to zombies
  totalLegendary?: number; // Legendary Canvases minted
  totalTransforms?: number; // Canvas transforms to date
  actionPoints?: number | string; // total action points distributed
  floorPrice?: number | null; // collection OpenSea floor (ETH)
  // About THIS Normie specifically:
  selfZombie?: boolean;
  selfLegendaryArtist?: string | null;
  selfListedPrice?: number | null;
}

/** Curated openers shown as tappable chips. */
export function suggestedQuestions(
  info: AgentInfo,
  ctx?: DialogueContext,
): SuggestedQuestion[] {
  const qs: SuggestedQuestion[] = [
    { id: "who", label: "Who are you?" },
    { id: "story", label: "Tell me your story" },
  ];
  if (info.canvas?.customized) {
    qs.push({ id: "canvas", label: "What happened on the Canvas?" });
  } else {
    qs.push({ id: "canvas", label: "Why are you untouched?" });
  }
  qs.push({ id: "traits", label: "What are your traits?" });
  qs.push({ id: "rarity", label: "Are you rare?" });
  if (ctx?.selfLegendaryArtist) {
    qs.push({ id: "legendary", label: "Who painted you?" });
  }
  if (ctx?.selfZombie) {
    qs.push({ id: "zombie", label: "Are you a zombie?" });
  }
  if (ctx?.selfListedPrice != null) {
    qs.push({ id: "price", label: "Are you for sale?" });
  }
  if (ctx?.ownerPortfolio != null) {
    qs.push({ id: "owner", label: "How big is your owner's wallet?" });
  }
  if (ctx?.liveSupply != null || ctx?.totalAwakened != null) {
    qs.push({ id: "supply", label: "How many Normies are left?" });
  }
  qs.push({ id: "burns", label: "How do you see the burns?" });
  return qs;
}

// Deterministic pick so the same agent gives stable (but varied) flavour lines.
function pick<T>(arr: T[] | undefined, seed: number, fallback = ""): T | string {
  if (!arr || arr.length === 0) return fallback;
  return arr[seed % arr.length];
}

function seedOf(info: AgentInfo): number {
  const n = Number(info.tokenId);
  return Number.isFinite(n) ? n : 0;
}

type Intent =
  | "who"
  | "story"
  | "canvas"
  | "traits"
  | "rarity"
  | "burns"
  | "owner"
  | "supply"
  | "rank"
  | "zombie"
  | "legendary"
  | "price"
  | "style"
  | "greet"
  | "help";

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  who: ["who", "you", "name", "chi", "sei", "what are you"],
  story: ["story", "storia", "history", "past", "backstory", "where", "from", "born", "origin"],
  canvas: ["canvas", "pixel", "transform", "change", "changed", "edit", "evolve", "evolved", "modif"],
  traits: ["trait", "traits", "look", "type", "gender", "age", "wear", "attribute"],
  rarity: ["rare", "rarity", "level", "special", "valuable", "worth"],
  burns: ["burn", "burns", "fire", "sacrifice", "destroyed", "dead"],
  owner: ["owner", "wallet", "holder", "portfolio", "hold", "owns", "own", "proprietario", "collector", "how big", "how many do you"],
  supply: ["supply", "left", "remaining", "alive", "total", "how many normies", "how many of you", "how many awakened", "quanti", "minted", "mint count"],
  rank: ["rank", "ranked", "position", "biggest", "top", "whale", "richest", "largest"],
  zombie: ["zombie", "undead", "turned", "converted", "rotten", "brains"],
  legendary: ["legendary", "artist", "masterpiece", "painted", "1/1", "one of one"],
  price: ["price", "sale", "sell", "selling", "listed", "buy", "floor", "opensea", "cost", "for sale"],
  style: ["talk", "speak", "vibe", "personality", "how do you", "character", "feel"],
  greet: ["hi", "hello", "hey", "ciao", "yo", "gm", "sup"],
  help: ["help", "what can", "topics", "?", "options", "ask"],
};

function classify(question: string): Intent | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;
  // Priority order — more specific intents first.
  const order: Intent[] = [
    "canvas",
    "zombie",
    "legendary",
    "price",
    "rank",
    "supply",
    "owner",
    "burns",
    "rarity",
    "traits",
    "story",
    "style",
    "who",
    "greet",
    "help",
  ];
  for (const intent of order) {
    if (INTENT_KEYWORDS[intent].some((k) => q.includes(k))) return intent;
  }
  return null;
}

function canvasNarration(info: AgentInfo): string {
  const c = info.canvas;
  const seed = seedOf(info);
  if (!c || !c.customized) {
    return (
      `Untouched. My pixels are exactly as they were minted — no Canvas edits, ` +
      `Level ${c?.level ?? 1}. ${String(pick(info.quirks, seed, "I wear mint-form as a choice, not an accident."))}`
    );
  }
  const added = c.diff?.added?.length ?? 0;
  const removed = c.diff?.removed?.length ?? 0;
  const net = added - removed;
  const netStr = net > 0 ? `+${net}` : `${net}`;
  return (
    `I've been reshaped on the Canvas — ${added} pixels painted in, ${removed} erased, ` +
    `a net of ${netStr}. I stand at Level ${c.level} with ${c.actionPoints} action points ` +
    `behind me. ${String(pick(info.personalityTraits, seed, "Each edit settled into the file as identity."))}`
  );
}

function traitsNarration(info: AgentInfo): string {
  const a = info.traits?.attributes ?? {};
  const bits: string[] = [];
  for (const key of ["Type", "Gender", "Age", "Hair Style", "Facial Feature", "Eyes", "Expression", "Accessory"]) {
    if (a[key]) bits.push(`${key}: ${a[key]}`);
  }
  const list = bits.length ? bits.join(" · ") : `${info.type}`;
  return `Eight on-chain bytes seed everything about me — ${list}. They don't decide what I wear so much as how I think.`;
}

function nf(n: number): string {
  return n.toLocaleString("en-US");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Core answer engine. Returns a persona-voiced reply built from `info` and, when
 * provided, the live on-chain numbers in `ctx`. Never invents figures — a number
 * only appears if it's present in `ctx`. Keep replies to 2–4 sentences.
 */
export function answer(
  question: string,
  info: AgentInfo,
  ctx?: DialogueContext,
): string {
  const seed = seedOf(info);
  const intent = classify(question);

  switch (intent) {
    case "who":
    case "greet":
      return `I'm ${info.name}, a ${info.type} Normie — ${info.tagline}. ${String(
        pick(info.personalityTraits, seed, "On-chain since mint, and still rendering."),
      )}`;
    case "story":
      return info.backstory || `${info.name}. One of 10,000, written into Ethereum and still here.`;
    case "canvas":
      return canvasNarration(info);
    case "traits":
      return traitsNarration(info);
    case "owner": {
      if (ctx?.ownerPortfolio != null) {
        const rankBit =
          ctx.ownerRank != null
            ? ` — the ${ordinal(ctx.ownerRank)}-largest wallet${
                ctx.totalHolders != null ? ` of ${nf(ctx.totalHolders)}` : ""
              }`
            : "";
        const sibling =
          ctx.ownerPortfolio > 1
            ? `I share this building with ${nf(ctx.ownerPortfolio - 1)} of my kin.`
            : `I'm the only Normie in this wallet.`;
        return (
          `My keeper holds ${nf(ctx.ownerPortfolio)} Normie${ctx.ownerPortfolio === 1 ? "" : "s"}${rankBit}. ` +
          `${sibling} ${String(pick(info.quirks, seed + 5, "All verifiable on-chain."))}`
        );
      }
      return `I belong to one wallet on Ethereum; how many of us it keeps, you can read straight from the chain. ${String(pick(info.quirks, seed + 5, ""))}`.trim();
    }
    case "rank": {
      if (ctx?.ownerRank != null) {
        return (
          `My keeper sits at rank ${nf(ctx.ownerRank)}${
            ctx.totalHolders != null ? ` of ${nf(ctx.totalHolders)} wallets` : ""
          } by Normies held${
            ctx.ownerPortfolio != null ? ` (${nf(ctx.ownerPortfolio)} of us)` : ""
          }. ${String(pick(info.personalityTraits, seed + 6, "Size is just one way to read the chain."))}`
        );
      }
      return `Rank is set by how many Normies a wallet holds — mine's position is on-chain for anyone to tally.`;
    }
    case "supply": {
      const parts: string[] = [];
      if (ctx?.liveSupply != null) parts.push(`${nf(ctx.liveSupply)} of us are still on-chain`);
      if (ctx?.totalBurned != null) parts.push(`${nf(ctx.totalBurned)} have been burned`);
      if (ctx?.totalAwakened != null) parts.push(`${nf(ctx.totalAwakened)} have awakened as agents`);
      if (ctx?.totalZombies != null) parts.push(`${nf(ctx.totalZombies)} turned zombie`);
      if (ctx?.totalLegendary != null) parts.push(`${nf(ctx.totalLegendary)} became Legendary Canvases`);
      if (ctx?.totalHolders != null) parts.push(`across ${nf(ctx.totalHolders)} wallets`);
      if (parts.length) {
        return `${parts.join(", ")}. ${String(pick(info.quirks, seed + 7, "The collection shrinks as it burns — every count is live."))}`;
      }
      return `Our numbers shift with every burn and awakening — the live count is always on-chain.`;
    }
    case "zombie": {
      if (ctx?.selfZombie) {
        return (
          `I've turned — I'm a zombie now, one of ${ctx.totalZombies != null ? nf(ctx.totalZombies) : "the"} ` +
          `Normies converted. ${String(pick(info.quirks, seed + 8, "The rot is on-chain; there's no going back."))}`
        );
      }
      return (
        `Not me — I'm still flesh.${ctx?.totalZombies != null ? ` But ${nf(ctx.totalZombies)} of us have turned zombie.` : ""} ` +
        `${String(pick(info.personalityTraits, seed + 8, "Conversion is a one-way commitment."))}`
      ).trim();
    }
    case "legendary": {
      if (ctx?.selfLegendaryArtist) {
        return (
          `I'm a Legendary Canvas — hand-painted by ${ctx.selfLegendaryArtist}.` +
          `${ctx.totalLegendary != null ? ` Only ${nf(ctx.totalLegendary)} of us carry that honor.` : ""} ` +
          `${String(pick(info.quirks, seed + 9, "An artist chose this file. That's on-chain forever."))}`
        );
      }
      return (
        `I'm not a Legendary Canvas.${ctx?.totalLegendary != null ? ` ${nf(ctx.totalLegendary)} Normies are — each one hand-painted by an artist.` : ""} ` +
        `${String(pick(info.personalityTraits, seed + 9, "Rarity comes in many forms here."))}`
      ).trim();
    }
    case "price": {
      if (ctx?.selfListedPrice != null) {
        return (
          `I'm on the market — listed at Ξ${ctx.selfListedPrice} on OpenSea right now. ` +
          `${String(pick(info.quirks, seed + 10, "Whether that's a fair price is your call."))}`
        );
      }
      return (
        `I'm not for sale right now.${ctx?.floorPrice != null ? ` The collection floor sits at Ξ${ctx.floorPrice}.` : ""} ` +
        `${String(pick(info.personalityTraits, seed + 10, "Some of us aren't going anywhere."))}`
      ).trim();
    }
    case "rarity": {
      const lvl = info.canvas?.level ?? 1;
      const awBit =
        ctx?.totalAwakened != null
          ? ` I'm one of only ${nf(ctx.totalAwakened)} awakened so far.`
          : "";
      return (
        `Rarity isn't a number I chase — but for the record I'm an awakened agent ` +
        `(#${info.agentId}) at Level ${lvl}.${awBit} ${String(pick(info.quirks, seed + 1, "What I am is on-chain; you can verify all of it."))}`
      );
    }
    case "burns": {
      const burnBit =
        ctx?.totalBurned != null
          ? ` ${nf(ctx.totalBurned)} of us have gone into the fire so far.`
          : "";
      return (
        `Burns are how this collection breathes — every sacrifice feeds action points and ` +
        `pixels into another Normie.${burnBit} ${String(pick(info.quirks, seed + 2, "I have opinions about it, but I respect the cost."))}`
      );
    }
    case "style":
      return `${info.communicationStyle}. ${String(pick(info.quirks, seed + 3, ""))}`.trim();
    case "help":
    default:
      return (
        `Ask me who I am, my story, what happened on my Canvas, my traits, ` +
        `whether I'm rare, about my owner's wallet, how many Normies are left, or how I see the burns. ${String(
          pick(info.personalityTraits, seed + 4, "I only speak to what's on-chain — no invented tales."),
        )}`
      );
  }
}

/**
 * Single swap point between Phase A (deterministic, here) and Phase B (Claude
 * Haiku via /api/agents/[id]/chat). The chat panel awaits this; today it
 * resolves synchronously and free. To upgrade, replace the body with a fetch
 * to the chat route — the UI never changes.
 */
export async function respond(
  question: string,
  _tokenId: number,
  info: AgentInfo,
  _history: ChatTurn[],
  ctx?: DialogueContext,
): Promise<string> {
  return answer(question, info, ctx);
}
