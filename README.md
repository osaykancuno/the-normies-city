# The Normies City

A 3D pixel-art city that tells the story of every Normie. Each of the 10,000 Normies is a building; the 40×40 on-chain bitmap is the facade. Burns, pixel transforms, transfers and Canvas state are pulled live from the Normies API and painted onto the city in brand monochrome.

Inspired by [thegitcity.com](https://www.thegitcity.com/), built on top of the public [Normies API](https://api.normies.art/).

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React Three Fiber** + **Drei** + **Three.js** — 3D scene
- **viem** — ERC-1155 transfer event subscription
- **Tailwind CSS v4** — brand-only palette (`#48494b` / `#e3e5e4`)
- **Vercel** — hosting (no database)

## Quickstart

```bash
npm install

# One-time: fetch all 10k Normie bitmaps + traits (~6h total at the 60 req/min limit).
# Resumable — re-run after Ctrl+C to continue.
npm run build:data

# Dev server
npm run dev
```

Open http://localhost:3000. The city loads with synthetic dev traits if the data hasn't been built yet, so you can iterate on the UI immediately.

## What it shows live

| Endpoint | Where it surfaces |
| --- | --- |
| `/history/stats` | Stats ticker (top right) |
| `/history/burns` | Live feed + in-world burn bursts |
| `/canvas/status` | Canvas status banner |
| `/history/burned-tokens` | Graveyard ring outside the city |
| `/history/burned/:id` (+ image) | Graveyard tombstone tooltips |
| `/normie/:id/metadata`, `/owner`, `/image.svg` | Profile panel + full profile page |
| `/normie/:id/original/image.svg` | "Before Canvas" comparison on full profile |
| `/normie/:id/canvas/info`, `/canvas/diff` | Canvas detail in profile panel |
| `/history/normie/:id/versions` (+ version images) | Version timeline with snapshots |
| `/history/burns/receiver/:id` | Burns received by this Normie |
| `/holders/:address` | Owner's portfolio on the full profile |
| ERC-1155 `TransferSingle` via viem | Transfer events in feed (no public API for this) |

## Architecture

See [`/.claude/plans/woolly-conjuring-kay.md`](.claude/plans/woolly-conjuring-kay.md) for the full design doc.

- `app/` — Next.js App Router pages and route handlers
- `components/` — React + R3F components
- `lib/` — typed API client, atlas lookup, deterministic layout, on-chain watcher
- `scripts/` — one-shot data fetchers
- `public/atlas.png` — 4000×4000 atlas of every Normie bitmap (committed)
- `public/normies-traits.json` — trait table for client-side layout
