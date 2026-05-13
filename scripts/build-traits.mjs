// One-shot trait + Canvas-level fetcher. Resumable.
//
// Usage: npm run build:traits
// Expected runtime: ~3 hours (rate-limited to 55 req/min).
// Output: public/normies-traits.json — compact array indexed by id.
//
// Per Normie we store: type, gender, age, hairStyle, facialFeature, eyes, expression,
// accessory, level, pixelCount, actionPoints, customized, exists (false for unminted).

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NORMIES_API, TOTAL_NORMIES, rateLimitedFetch, formatEta } from "./_rate-limit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "public");
const OUT_PATH = resolve(PUBLIC_DIR, "normies-traits.json");
const PROGRESS_PATH = resolve(PUBLIC_DIR, ".traits-progress.json");

mkdirSync(PUBLIC_DIR, { recursive: true });

const records = loadExisting();
const startTime = Date.now();
let ok = records.filter(Boolean).length;
let fail = 0;

for (let id = 0; id < TOTAL_NORMIES; id++) {
  if (records[id]) continue;

  const url = `${NORMIES_API}/normie/${id}/metadata`;
  try {
    const res = await rateLimitedFetch(url);
    if (res.status === 404) {
      records[id] = { exists: false };
      ok++;
    } else if (res.ok) {
      const json = await res.json();
      records[id] = compactMetadata(json);
      ok++;
    } else {
      console.warn(`#${id}: ${res.status}`);
      fail++;
    }
  } catch (err) {
    console.warn(`#${id}: ${err.message}`);
    fail++;
  }

  if (id % 25 === 0) writeFileSync(PROGRESS_PATH, JSON.stringify(records));
  if (id % 100 === 0) {
    flushOut();
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(
      `  #${id}: ok=${ok} fail=${fail} elapsed=${Math.round(elapsed)}s eta≈${formatEta(
        TOTAL_NORMIES - ok - fail
      )}`
    );
  }
}

flushOut();
console.log(`\nDone. ${ok} ok, ${fail} failed. Output: ${OUT_PATH}`);

function compactMetadata(meta) {
  const attrs = Object.fromEntries(
    (meta.attributes || []).map((a) => [a.trait_type, a.value])
  );
  return {
    exists: true,
    type: attrs["Type"] ?? null,
    gender: attrs["Gender"] ?? null,
    age: attrs["Age"] ?? null,
    hairStyle: attrs["Hair Style"] ?? null,
    facialFeature: attrs["Facial Feature"] ?? null,
    eyes: attrs["Eyes"] ?? null,
    expression: attrs["Expression"] ?? null,
    accessory: attrs["Accessory"] ?? null,
    level: numeric(attrs["Level"]),
    pixelCount: numeric(attrs["Pixel Count"]),
    actionPoints: numeric(attrs["Action Points"]),
    customized: attrs["Customized"] === "Yes",
  };
}

function numeric(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function flushOut() {
  writeFileSync(OUT_PATH, JSON.stringify(records));
}

function loadExisting() {
  if (existsSync(PROGRESS_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(PROGRESS_PATH, "utf8"));
      if (Array.isArray(parsed) && parsed.length === TOTAL_NORMIES) {
        console.log(`Resuming: ${parsed.filter(Boolean).length}/${TOTAL_NORMIES} cached`);
        return parsed;
      }
    } catch {}
  }
  return new Array(TOTAL_NORMIES).fill(null);
}
