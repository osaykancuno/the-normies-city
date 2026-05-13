// Synthetic traits for dev mode when the real build:data hasn't run yet.
// Generates 10k plausible Normies so the city is testable immediately.

import type { NormieCompact, NormieType } from "./types";

const TYPES: NormieType[] = ["Human", "Cat", "Agent", "Alien"];
const GENDERS = ["Male", "Female"];
const AGES = ["Young", "Adult", "Elder"];

export function generateSyntheticTraits(): NormieCompact[] {
  const out: NormieCompact[] = [];
  for (let id = 0; id < 10000; id++) {
    const h = hash(id);
    const type = TYPES[h % 4];
    out.push({
      exists: true,
      type,
      gender: GENDERS[(h >>> 2) % 2],
      age: AGES[(h >>> 4) % 3],
      hairStyle: null,
      facialFeature: null,
      eyes: null,
      expression: null,
      accessory: null,
      level: (h >>> 6) % 5,
      pixelCount: 200 + ((h >>> 9) % 1200),
      actionPoints: ((h >>> 12) % 8) * 25,
      customized: ((h >>> 8) & 1) === 1,
    });
  }
  return out;
}

function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b1;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
