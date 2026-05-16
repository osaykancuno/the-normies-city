"use client";

import { useCity } from "@/lib/store";

// Top-bar pill that toggles Agent Mode for the whole city.
//
// In Agent Mode dormant Normie buildings fade to a dithered ghost while
// awakened ones intensify — turning the city into a directory-style view of
// which Normies have been bound to an ERC-8004 agent. Even when the mode is
// OFF, awakened buildings keep their subtle halo + antenna so the signal is
// always visible to passers-by.

export default function AgentModeToggle() {
  const agentMode = useCity((s) => s.agentMode);
  const setAgentMode = useCity((s) => s.setAgentMode);
  const awakenedCount = useCity((s) => s.awakenedSet.size);

  return (
    <button
      type="button"
      onClick={() => setAgentMode(!agentMode)}
      title="Toggle Agent Mode — dim dormant Normies, highlight awakened ERC-8004 agents"
      className={
        "flex items-center gap-1 px-2.5 py-1.5 text-[10px] tracking-widest transition cursor-pointer " +
        (agentMode
          ? "bg-off text-on hover:bg-off/85"
          : "bg-on text-off/85 hover:text-off")
      }
    >
      <span>AGENT MODE</span>
      <span className="opacity-50">·</span>
      <span>{agentMode ? "ON" : "OFF"}</span>
      <span className="opacity-50">·</span>
      <span className="tabular-nums">{awakenedCount}</span>
      <span className="opacity-50">/ 10K</span>
    </button>
  );
}
