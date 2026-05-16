"use client";

import { useEffect } from "react";
import useSWR from "swr";
import type { AgentInfo } from "@/lib/types";
import { useCity } from "@/lib/store";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Persona card shown inside the NormiePanel when the selected token has been
// awakened. Lazy-loads the full /agents/info/:id payload via SWR — the
// snapshot only carries name + tagline for the most-recent ~100 awakenings;
// older ones reach this panel with an empty name, get fetched on demand here,
// and write back into the store's nameIndex via markAwakened so SearchBar
// starts matching that name from now on.

export default function AwakenedPanel({ tokenId }: { tokenId: number }) {
  const agentMeta = useCity((s) => s.awakenedAgents.get(tokenId));
  const markAwakened = useCity((s) => s.markAwakened);
  const { data, isLoading } = useSWR<AgentInfo>(
    `/api/agents/${tokenId}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  // When the /info fetch lands and the store entry doesn't have a name yet,
  // hydrate it. This makes the activity feed retroactively show the persona
  // name and the search bar start matching it.
  useEffect(() => {
    if (!data?.name) return;
    if (agentMeta?.name) return;
    markAwakened({
      tokenId,
      agentId: data.agentId ?? agentMeta?.agentId ?? "",
      name: data.name,
      tagline: data.tagline ?? "",
    });
  }, [data, agentMeta, markAwakened, tokenId]);

  // Logical OR so an empty string from the snapshot falls through to the next
  // fallback rather than rendering a blank header.
  const name = data?.name || agentMeta?.name || `#${tokenId}`;
  const tagline = data?.tagline || agentMeta?.tagline || "";

  return (
    <section className="mt-3 border border-off/15 bg-ink/30 p-2 text-[10px]">
      <div className="flex items-center justify-between">
        <span className="bg-off px-1.5 py-0.5 text-[9px] tracking-widest text-on">
          AWAKENED
        </span>
        {agentMeta?.agentId && (
          <span className="opacity-50 tabular-nums">
            agent #{agentMeta.agentId}
          </span>
        )}
      </div>
      <div className="mt-2 text-sm tracking-wide">{name}</div>
      {tagline && <div className="mt-0.5 italic opacity-75">{tagline}</div>}

      {data?.greeting && (
        <div className="mt-2 border-l-2 border-off/30 pl-2 italic opacity-90">
          “{data.greeting}”
        </div>
      )}

      {data?.personalityTraits && data.personalityTraits.length > 0 && (
        <div className="mt-2">
          <div className="opacity-50 tracking-widest">PERSONALITY</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-3">
            {data.personalityTraits.slice(0, 8).map((p, i) => (
              <li key={i} className="opacity-90">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.quirks && data.quirks.length > 0 && (
        <div className="mt-2">
          <div className="opacity-50 tracking-widest">QUIRKS</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-3">
            {data.quirks.slice(0, 6).map((q, i) => (
              <li key={i} className="opacity-80">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.communicationStyle && (
        <div className="mt-2">
          <div className="opacity-50 tracking-widest">COMMUNICATES</div>
          <div className="mt-0.5 italic opacity-85">{data.communicationStyle}</div>
        </div>
      )}

      {data?.backstory && (
        <div className="mt-2">
          <div className="opacity-50 tracking-widest">BACKSTORY</div>
          <div className="mt-0.5 opacity-85">{data.backstory}</div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        <a
          className="border border-off/20 px-2 py-1 text-[9px] tracking-widest hover:bg-off/10"
          href={`https://api.normies.art/agents/agent-card/${tokenId}`}
          target="_blank"
          rel="noreferrer"
        >
          A2A AGENT CARD ↗
        </a>
        <a
          className="border border-off/20 px-2 py-1 text-[9px] tracking-widest hover:bg-off/10"
          href={`https://api.normies.art/agents/info/${tokenId}`}
          target="_blank"
          rel="noreferrer"
        >
          PERSONA JSON ↗
        </a>
      </div>

      {isLoading && !data && (
        <div className="mt-2 text-[9px] opacity-50">loading persona…</div>
      )}
    </section>
  );
}
