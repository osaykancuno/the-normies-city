"use client";

import { useState } from "react";
import { useCity } from "@/lib/store";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export default function SearchBar() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const buildingsByAddress = useCity((s) => s.buildingsByAddress);
  const holders = useCity((s) => s.holders);
  const buildings = useCity((s) => s.buildings);
  const setSelection = useCity((s) => s.setSelection);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const nameIndex = useCity((s) => s.nameIndex);

  function go() {
    setError(null);
    const q = value.trim().toLowerCase();
    if (!q) return;

    // Persona name (e.g. "Zori"). Try an exact match first, then a forgiving
    // prefix/substring match so partial names work — handy on mobile where
    // typing the full agent name is fiddly.
    let personaHit = nameIndex.get(q);
    if (personaHit === undefined && q.length >= 2 && /[a-z]/.test(q) && !ADDRESS_RE.test(q)) {
      let prefix: number | undefined;
      let contains: number | undefined;
      for (const [name, id] of nameIndex) {
        if (name.startsWith(q)) { prefix = id; break; }
        if (contains === undefined && name.includes(q)) contains = id;
      }
      personaHit = prefix ?? contains;
    }
    if (personaHit !== undefined) {
      const owner = holders?.byToken[personaHit];
      if (owner) {
        const b = buildingsByAddress.get(owner.toLowerCase());
        if (b) setFlyTo({ x: b.x, y: b.y, z: b.z, size: b.height });
      }
      setSelection({ kind: "normie", tokenId: personaHit });
      return;
    }

    // Wallet address.
    if (ADDRESS_RE.test(q)) {
      const b = buildingsByAddress.get(q);
      if (!b) {
        setError("address holds no Normies");
        return;
      }
      setSelection({ kind: "holder", address: q });
      setFlyTo({ x: b.x, y: b.y, z: b.z, size: b.height });
      return;
    }

    // Normie id.
    const num = Number(q.replace(/^#/, ""));
    if (Number.isInteger(num) && num >= 0 && num <= 9999) {
      // Find current holder of that tokenId; fly to their building. If unminted
      // or burned, fall back to opening the burned/normie panel without flying.
      const owner = holders?.byToken[num] ?? null;
      if (owner) {
        const b = buildingsByAddress.get(owner.toLowerCase());
        if (b) {
          setFlyTo({ x: b.x, y: b.y, z: b.z, size: b.height });
        }
        setSelection({ kind: "normie", tokenId: num });
      } else {
        // Maybe burned — try to locate its tombstone.
        const burned = buildings.find((bb) => bb.kind === "burned" && bb.tokenId === num);
        if (burned) {
          setFlyTo({ x: burned.x, y: burned.y, z: burned.z, size: burned.height });
          setSelection({ kind: "burned", tokenId: num });
        } else {
          setSelection({ kind: "normie", tokenId: num });
          setError("not held in this snapshot");
        }
      }
      return;
    }

    setError("enter a Normie id (0-9999) or an Ethereum address");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="flex items-stretch"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        placeholder="#id · 0x… · agent name"
        className="w-[min(220px,42vw)] bg-on px-2.5 text-[11px] tracking-wide text-off placeholder:text-off/40 focus:bg-ink focus:outline-none sm:w-[min(240px,55vw)]"
        spellCheck={false}
        autoCorrect="off"
      />
      <button
        type="submit"
        className="bg-off px-3 py-1.5 text-[10px] tracking-widest text-on hover:bg-off/80"
      >
        FIND
      </button>
      {error && (
        <div role="alert" className="ml-px bg-on px-2 py-1.5 text-[10px] text-off/70">
          {error}
        </div>
      )}
    </form>
  );
}
