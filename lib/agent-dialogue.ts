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

/** Curated openers shown as tappable chips. */
export function suggestedQuestions(info: AgentInfo): SuggestedQuestion[] {
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
  | "style"
  | "greet"
  | "help";

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  who: ["who", "you", "name", "chi", "sei", "what are you"],
  story: ["story", "storia", "history", "past", "backstory", "where", "from", "born", "origin"],
  canvas: ["canvas", "pixel", "transform", "change", "changed", "edit", "evolve", "evolved", "modif"],
  traits: ["trait", "traits", "look", "type", "gender", "age", "wear", "attribute"],
  rarity: ["rare", "rarity", "level", "special", "awaken", "agent", "valuable", "worth"],
  burns: ["burn", "burns", "fire", "sacrifice", "destroyed", "dead"],
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

/**
 * Core answer engine. Returns a persona-voiced reply built only from `info`.
 * Keep replies to 2–4 sentences.
 */
export function answer(question: string, info: AgentInfo): string {
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
    case "rarity": {
      const lvl = info.canvas?.level ?? 1;
      return (
        `Rarity isn't a number I chase — but for the record I'm an awakened agent ` +
        `(#${info.agentId}) at Level ${lvl}. ${String(pick(info.quirks, seed + 1, "What I am is on-chain; you can verify all of it."))}`
      );
    }
    case "burns":
      return (
        `Burns are how this collection breathes — every sacrifice feeds action points and ` +
        `pixels into another Normie. ${String(pick(info.quirks, seed + 2, "I have opinions about it, but I respect the cost."))}`
      );
    case "style":
      return `${info.communicationStyle}. ${String(pick(info.quirks, seed + 3, ""))}`.trim();
    case "help":
    default:
      return (
        `Ask me who I am, my story, what happened on my Canvas, my traits, ` +
        `whether I'm rare, or how I see the burns. ${String(
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
): Promise<string> {
  return answer(question, info);
}
