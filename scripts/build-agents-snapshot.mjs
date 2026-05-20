// Bake the current awakened set into public/agents-snapshot.json.
// Run manually (or in CI before deploy) when api.normies.art is healthy.
// The /api/agents/snapshot route falls back to this file when the upstream
// Ponder indexer is unreachable, so even first-time visitors during an
// outage see the full agent layer (halos, antennas, persona search) rather
// than an empty city.
//
// Usage:
//   node scripts/build-agents-snapshot.mjs
//
// Exits 0 on success, prints a warning + exits 0 on upstream failure too —
// we don't want to break a deploy because Ponder is briefly down. The
// existing snapshot stays in place.

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "agents-snapshot.json");
const BASE = process.env.NORMIES_API_BASE || "https://api.normies.art";
const TOTAL = 10_000;
const BATCH_CHUNK = 1_000;
const META_CONCURRENCY = 25;

async function postBatch(ids) {
  const res = await fetch(`${BASE}/agents/binding/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokenIds: ids }),
  });
  if (!res.ok) throw new Error(`batch ${res.status}`);
  const json = await res.json();
  return json.bindings ?? {};
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]);
      } catch {
        results[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseDisplayName(metaName) {
  if (!metaName) return "";
  const i = metaName.indexOf(" - ");
  if (i < 0) return metaName.trim();
  return metaName.slice(i + 3).trim();
}

function parseTagline(description) {
  if (!description) return "";
  const first = (description.split(/\.(\s|$)/, 1)[0] ?? "").trim();
  return first;
}

async function main() {
  console.log(`Baking awakened snapshot from ${BASE} ...`);

  // 1. Chunked batch to discover all awakened ids (upstream silently caps at
  //    ~50 results when sent a single 10 k-id payload, so we chunk).
  const chunks = [];
  for (let off = 0; off < TOTAL; off += BATCH_CHUNK) {
    chunks.push(
      Array.from(
        { length: Math.min(BATCH_CHUNK, TOTAL - off) },
        (_, j) => off + j,
      ),
    );
  }
  const chunkResults = await Promise.all(chunks.map(postBatch));
  const bindings = {};
  for (const c of chunkResults) Object.assign(bindings, c);
  const awakenedIds = Object.keys(bindings)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL)
    .sort((a, b) => a - b);
  console.log(`  ${awakenedIds.length} awakened tokens discovered`);

  // 2. Recent list provides names for ~100 freshest awakenings cheaply.
  const named = new Map();
  try {
    const list = await getJson("/agents/list?limit=100");
    for (const item of list.items ?? []) {
      const name = (item.name ?? "").trim();
      if (!name) continue;
      named.set(String(item.tokenId), {
        name,
        tagline: item.type ? `${item.type} agent` : "",
      });
    }
    console.log(`  ${named.size} names harvested from /agents/list`);
  } catch (e) {
    console.warn("  /agents/list failed:", e.message);
  }

  // 3. Fan-out metadata for unnamed awakened ids.
  const need = awakenedIds.filter((id) => !named.has(String(id)));
  const meta = await mapConcurrent(need, META_CONCURRENCY, async (id) => {
    try {
      return await getJson(`/agents/metadata/${id}`);
    } catch {
      return null;
    }
  });
  for (let i = 0; i < need.length; i++) {
    const md = meta[i];
    if (!md) continue;
    const display = parseDisplayName(md.name);
    if (!display) continue;
    named.set(String(need[i]), {
      name: display,
      tagline: parseTagline(md.description),
    });
  }
  console.log(`  ${named.size} total named after metadata fan-out`);

  // 4. Last-resort persona-preview fallback for any remaining unnamed.
  const stillUnnamed = need.filter((id) => !named.has(String(id)));
  if (stillUnnamed.length > 0) {
    const previews = await mapConcurrent(stillUnnamed, 10, async (id) => {
      try {
        return await getJson(`/agents/persona-preview/${id}`);
      } catch {
        return null;
      }
    });
    for (let i = 0; i < stillUnnamed.length; i++) {
      const p = previews[i];
      if (!p?.name) continue;
      named.set(String(stillUnnamed[i]), {
        name: p.name.trim(),
        tagline: (p.tagline ?? "").trim(),
      });
    }
  }
  console.log(`  ${named.size} / ${awakenedIds.length} named (final)`);

  // 5. Compose rows.
  const rows = [];
  for (const tid of awakenedIds) {
    const key = String(tid);
    const binding = bindings[key];
    if (!binding) continue;
    const hit = named.get(key);
    rows.push({
      tokenId: tid,
      agentId: binding.agentId,
      name: hit?.name ?? "",
      tagline: hit?.tagline ?? "",
    });
  }

  const payload = {
    awakened: rows,
    asOf: new Date().toISOString(),
    total: rows.length,
    namedCount: rows.filter((r) => r.name).length,
  };

  writeFileSync(OUT_PATH, JSON.stringify(payload));
  console.log(`Wrote ${OUT_PATH} (${rows.length} rows, ${payload.namedCount} named)`);
}

main().catch((err) => {
  console.warn(`Snapshot bake failed: ${err.message}`);
  console.warn("Keeping the existing public/agents-snapshot.json in place.");
  if (existsSync(OUT_PATH)) {
    const existing = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    console.warn(
      `  existing snapshot has ${existing.total ?? 0} awakened, asOf ${existing.asOf}`,
    );
  } else {
    console.warn("  no existing snapshot — first-time visitors will see an empty agent layer until upstream returns");
  }
  // Exit 0 so deploys never fail because of a transient upstream outage.
  process.exit(0);
});
