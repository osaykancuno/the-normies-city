// One-shot atlas builder: fetches every Normie's 40x40 bitmap and packs into a single
// 4000x4000 PNG. Resumable — re-running skips slots that already exist on disk.
//
// Usage: npm run build:atlas
// Expected runtime: ~3 hours (rate-limited to 55 req/min).
// Output: public/atlas.png, public/atlas.json (id -> [u, v] in normalized UV).

import { createCanvas, loadImage } from "canvas";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NORMIES_API, TOTAL_NORMIES, rateLimitedFetch, formatEta } from "./_rate-limit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "public");
const ATLAS_PATH = resolve(PUBLIC_DIR, "atlas.png");
const ATLAS_JSON = resolve(PUBLIC_DIR, "atlas.json");
const PROGRESS_PATH = resolve(PUBLIC_DIR, ".atlas-progress.json");

const CELL = 40;
const COLS = 100;
const ROWS = 100;
const SIZE = CELL * COLS; // 4000

const COLOR_ON = "#48494b";
const COLOR_OFF = "#e3e5e4";

mkdirSync(PUBLIC_DIR, { recursive: true });

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

// Resume: if atlas.png exists, load it as the starting canvas.
const progress = loadProgress();
if (existsSync(ATLAS_PATH) && progress.done.length > 0) {
  console.log(`Resuming from atlas.png (${progress.done.length}/${TOTAL_NORMIES} done)`);
  const img = await loadImage(ATLAS_PATH);
  ctx.drawImage(img, 0, 0);
} else {
  ctx.fillStyle = COLOR_OFF;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

const doneSet = new Set(progress.done);
const startTime = Date.now();
let succeeded = doneSet.size;
let failed = 0;

for (let id = 0; id < TOTAL_NORMIES; id++) {
  if (doneSet.has(id)) continue;

  const url = `${NORMIES_API}/normie/${id}/pixels`;
  let pixels;
  try {
    const res = await rateLimitedFetch(url);
    if (res.status === 404) {
      // Unminted — leave slot blank.
      doneSet.add(id);
      progress.done.push(id);
      maybePersist(id, succeeded, failed);
      continue;
    }
    if (!res.ok) {
      console.warn(`#${id}: ${res.status}`);
      failed++;
      continue;
    }
    pixels = (await res.text()).trim();
  } catch (err) {
    console.warn(`#${id}: ${err.message}`);
    failed++;
    continue;
  }

  if (pixels.length !== 1600) {
    console.warn(`#${id}: unexpected payload length ${pixels.length}`);
    failed++;
    continue;
  }

  drawBitmap(id, pixels);
  doneSet.add(id);
  progress.done.push(id);
  succeeded++;
  maybePersist(id, succeeded, failed);
}

// Final flush.
writeAtlas();
writeAtlasJson();
writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
console.log(`\nDone. ${succeeded} succeeded, ${failed} failed. Atlas: ${ATLAS_PATH}`);

function drawBitmap(id, pixels) {
  const col = id % COLS;
  const row = Math.floor(id / COLS);
  const x0 = col * CELL;
  const y0 = row * CELL;
  // Fill background once per cell.
  ctx.fillStyle = COLOR_OFF;
  ctx.fillRect(x0, y0, CELL, CELL);
  ctx.fillStyle = COLOR_ON;
  for (let i = 0; i < 1600; i++) {
    if (pixels[i] !== "1") continue;
    const px = i % CELL;
    const py = Math.floor(i / CELL);
    ctx.fillRect(x0 + px, y0 + py, 1, 1);
  }
}

function maybePersist(id, ok, fail) {
  // Flush atlas every 100 Normies, progress every 25.
  if (id % 25 === 0) writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
  if (id % 100 === 0) {
    writeAtlas();
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = TOTAL_NORMIES - ok - fail;
    console.log(
      `  #${id}: ok=${ok} fail=${fail} elapsed=${Math.round(elapsed)}s eta≈${formatEta(remaining)}`
    );
  }
}

function writeAtlas() {
  const buf = canvas.toBuffer("image/png", { compressionLevel: 9 });
  writeFileSync(ATLAS_PATH, buf);
}

function writeAtlasJson() {
  // Atlas is a regular grid — the mapping is implicit, but emit a tiny JSON for clarity
  // and to record metadata.
  const meta = {
    size: SIZE,
    cell: CELL,
    cols: COLS,
    rows: ROWS,
    total: TOTAL_NORMIES,
    colorOn: COLOR_ON,
    colorOff: COLOR_OFF,
    formula: "u = (id % cols) * cell / size; v = floor(id / cols) * cell / size",
    builtAt: new Date().toISOString(),
  };
  writeFileSync(ATLAS_JSON, JSON.stringify(meta, null, 2));
}

function loadProgress() {
  if (existsSync(PROGRESS_PATH)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_PATH, "utf8"));
    } catch {}
  }
  return { done: [] };
}
