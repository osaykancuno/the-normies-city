"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useCity } from "@/lib/store";
import NormieImage from "./NormieImage";
import {
  respond,
  suggestedQuestions,
  type ChatTurn,
  type DialogueContext,
  type SuggestedQuestion,
} from "@/lib/agent-dialogue";
import type { AgentInfo } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// "Talk to the Normie" panel. Opens for an awakened token; the agent answers
// from its canonical on-chain persona (zero-cost deterministic engine today,
// swappable to Claude Haiku later via respond()). Text-first, brand monochrome.

export default function AgentChat() {
  const tokenId = useCity((s) => s.chatTokenId);
  const closeChat = useCity((s) => s.closeChat);
  const agentMeta = useCity((s) =>
    tokenId != null ? s.awakenedAgents.get(tokenId) : undefined,
  );

  // Live on-chain context for the deterministic engine — real numbers only.
  const holders = useCity((s) => s.holders);
  const buildings = useCity((s) => s.buildings);
  const buildingsByAddress = useCity((s) => s.buildingsByAddress);
  const burned = useCity((s) => s.burned);
  const awakenedSet = useCity((s) => s.awakenedSet);
  const zombieSet = useCity((s) => s.zombieSet);
  const legendary = useCity((s) => s.legendary);
  const historyStats = useCity((s) => s.historyStats);
  const listedSet = useCity((s) => s.listedSet);
  const listedPrice = useCity((s) => s.listedPrice);
  const market = useCity((s) => s.market);
  const ctx = useMemo<DialogueContext>(() => {
    const out: DialogueContext = {};
    if (burned?.size) out.totalBurned = burned.size;
    if (awakenedSet?.size) out.totalAwakened = awakenedSet.size;
    if (zombieSet?.size) out.totalZombies = zombieSet.size;
    if (legendary?.length) out.totalLegendary = legendary.length;
    if (historyStats?.totalTransforms) out.totalTransforms = historyStats.totalTransforms;
    if (historyStats?.totalActionPointsDistributed)
      out.actionPoints = historyStats.totalActionPointsDistributed;
    if (market?.floor != null) out.floorPrice = market.floor;
    let holderCount = 0;
    let live = 0;
    for (const b of buildings) {
      if (b.kind !== "holder") continue;
      holderCount++;
      live += b.tokenIds.length;
    }
    if (holderCount) out.totalHolders = holderCount;
    if (live) out.liveSupply = live;
    const owner = tokenId != null ? holders?.byToken[tokenId] : undefined;
    if (owner) {
      const b = buildingsByAddress.get(owner.toLowerCase());
      if (b && b.kind === "holder") {
        out.ownerPortfolio = b.tokenIds.length;
        out.ownerRank = b.rank + 1; // store rank is 0-based (0 = biggest)
      }
    }
    if (tokenId != null) {
      out.selfZombie = zombieSet.has(tokenId);
      out.selfLegendaryArtist = legendary.find((l) => l.tokenId === tokenId)?.artist ?? null;
      out.selfListedPrice = listedPrice.get(tokenId) ?? null;
    }
    return out;
  }, [
    tokenId,
    holders,
    buildings,
    buildingsByAddress,
    burned,
    awakenedSet,
    zombieSet,
    legendary,
    historyStats,
    listedSet,
    listedPrice,
    market,
  ]);

  const { data: info } = useSWR<AgentInfo>(
    tokenId != null ? `/api/agents/${tokenId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset the conversation whenever a different agent is opened, seeding it with
  // the agent's canonical greeting.
  useEffect(() => {
    if (tokenId == null) return;
    setTurns([]);
    setDraft("");
  }, [tokenId]);

  useEffect(() => {
    if (info?.greeting && turns.length === 0) {
      setTurns([{ role: "agent", text: info.greeting }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.greeting]);

  // Keep the transcript scrolled to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  // ESC closes the chat.
  useEffect(() => {
    if (tokenId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tokenId, closeChat]);

  if (tokenId == null) return null;

  const name = info?.name || agentMeta?.name || `#${tokenId}`;
  const tagline = info?.tagline || agentMeta?.tagline || "";
  const ready = Boolean(info);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || !info || thinking) return;
    setTurns((t) => [...t, { role: "user", text: q }]);
    setDraft("");
    setThinking(true);
    try {
      const reply = await respond(q, tokenId, info, turns, ctx);
      setTurns((t) => [...t, { role: "agent", text: reply }]);
    } finally {
      setThinking(false);
    }
  };

  const chips: SuggestedQuestion[] = info ? suggestedQuestions(info, ctx) : [];

  return (
    <div className="pointer-events-auto fixed bottom-3 right-3 z-40 flex w-[min(380px,calc(100vw-1.5rem))] flex-col bg-on text-off shadow-[0_4px_30px_-6px_rgba(0,0,0,0.6)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-off/15 px-3 py-2">
        <div className="h-9 w-9 shrink-0 bg-off">
          <NormieImage tokenId={tokenId} overlaySvg={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm tracking-widest">{name}</div>
          {tagline && <div className="truncate text-[10px] italic opacity-70">{tagline}</div>}
        </div>
        <span className="bg-off px-1.5 py-0.5 text-[9px] tracking-widest text-on">
          AGENT
        </span>
        <button
          className="ml-1 text-off/60 hover:text-off"
          onClick={closeChat}
          aria-label="close"
        >
          ✕
        </button>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="max-h-[40vh] min-h-[120px] overflow-y-auto px-3 py-2 text-[11px]">
        {!ready && <div className="opacity-50">waking the agent…</div>}
        {turns.map((t, i) => (
          <div key={i} className={"mb-2 flex " + (t.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={
                "max-w-[80%] px-2 py-1.5 " +
                (t.role === "user"
                  ? "bg-off text-on"
                  : "bg-ink/50 text-off")
              }
            >
              {t.text}
            </div>
          </div>
        ))}
        {thinking && <div className="mb-2 opacity-50">…</div>}
      </div>

      {/* Suggestion chips */}
      {ready && (
        <div className="flex flex-wrap gap-1 border-t border-off/10 px-3 py-2">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => ask(c.label)}
              disabled={thinking}
              className="bg-ink/50 px-2 py-1 text-[9px] tracking-wide text-off/85 hover:bg-ink hover:text-off"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-stretch gap-1 border-t border-off/15 p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          maxLength={300}
          placeholder={ready ? `ask ${name} something…` : "…"}
          disabled={!ready}
          className="w-full bg-ink px-2 py-1.5 text-[11px] tracking-wide text-off placeholder:text-off/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!ready || thinking || !draft.trim()}
          className="bg-off px-3 text-[10px] tracking-widest text-on hover:bg-off/80 disabled:opacity-40"
        >
          ASK
        </button>
      </form>

      <Link
        href={`/normie/${tokenId}`}
        className="border-t border-off/10 px-3 py-1.5 text-center text-[9px] tracking-widest opacity-60 hover:opacity-100"
      >
        OPEN FULL PROFILE →
      </Link>
    </div>
  );
}
