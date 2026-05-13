// One-shot holder map builder: fetches /normie/:id/owner for all 10k. Resumable.
//
// Output: public/holders.json — { byToken: [...], builtAt }
// Resume state: public/.holders-progress.json — { byToken, done: [ids...] }

import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NORMIES_API, TOTAL_NORMIES, rateLimitedFetch, formatEta } from "./_rate-limit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "public");
const OUT_PATH = resolve(PUBLIC_DIR, "holders.json");
const PROGRESS_PATH = resolve(PUBLIC_DIR, ".holders-progress.json");

mkdirSync(PUBLIC_DIR, { recursive: true });

const state = loadExisting();
const byToken = state.byToken;
const done = state.done;
const startTime = Date.now();
let ok = done.size;
let fail = 0;

console.log(`Starting with ${ok}/${TOTAL_NORMIES} already processed.`);

for (let id = 0; id < TOTAL_NORMIES; id++) {
  if (done.has(id)) continue;

  const url = `${NORMIES_API}/normie/${id}/owner`;
  try {
    const res = await rateLimitedFetch(url);
    if (res.status === 404) {
      byToken[id] = null;
      done.add(id);
      ok++;
    } else if (res.ok) {
      const json = await res.json();
      byToken[id] = (json.owner ?? null)?.toLowerCase() ?? null;
      done.add(id);
      ok++;
    } else {
      console.warn(`#${id}: ${res.status}`);
      fail++;
    }
  } catch (err) {
    console.warn(`#${id}: ${err.message}`);
    fail++;
  }

  if (id % 25 === 0) persistProgress();
  if (id % 2000 === 0 && id > 0) flushOut();
  if (id % 100 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(
      `  #${id}: ok=${ok} fail=${fail} elapsed=${Math.round(elapsed)}s eta≈${formatEta(
        TOTAL_NORMIES - ok - fail
      )}`
    );
  }
}

persistProgress();
flushOut();
// Clean up resume artifact once we're fully done.
if (ok === TOTAL_NORMIES && existsSync(PROGRESS_PATH)) {
  try {
    unlinkSync(PROGRESS_PATH);
  } catch {}
}
console.log(`\nDone. ${ok} ok, ${fail} failed. Output: ${OUT_PATH}`);

function flushOut() {
  writeFileSync(
    OUT_PATH,
    JSON.stringify({ byToken, builtAt: new Date().toISOString() })
  );
}

function persistProgress() {
  writeFileSync(
    PROGRESS_PATH,
    JSON.stringify({ byToken, done: [...done] })
  );
}

function loadExisting() {
  if (existsSync(PROGRESS_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(PROGRESS_PATH, "utf8"));
      if (
        parsed &&
        Array.isArray(parsed.byToken) &&
        parsed.byToken.length === TOTAL_NORMIES &&
        Array.isArray(parsed.done)
      ) {
        return { byToken: parsed.byToken, done: new Set(parsed.done) };
      }
    } catch {}
  }
  return { byToken: new Array(TOTAL_NORMIES).fill(null), done: new Set() };
}
