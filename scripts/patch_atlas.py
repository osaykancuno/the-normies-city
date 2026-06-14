#!/usr/bin/env python3
"""Repair blank cells in public/atlas.png.

The original atlas build (scripts/build-atlas.mjs) marked some tokens "done"
with empty content when the upstream pixels fetch failed (rate-limit bursts),
leaving ~1800 blank 40x40 cells. Those Normies render blank on building
facades and in atlas-only thumbnails.

This targeted repair scans the atlas for blank cells, re-fetches ONLY those
from api.normies.art/normie/{id}/pixels, and paints them in. Resumable: re-run
until "blank cells: 0". Respects the 60 req/min rate limit.

Usage:  python scripts/patch_atlas.py
"""

import os
import sys
import time
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(ROOT, "public", "atlas.png")
BASE = os.environ.get("NORMIES_API_BASE", "https://api.normies.art")
CELL = 40
ON = (72, 73, 75)      # #48494b
OFF = (227, 229, 228)  # #e3e5e4
THROTTLE = 1.1         # seconds between requests (~54/min, under the 60/min cap)


def find_blank(img):
    px = img.load()
    blank = []
    for tid in range(10000):
        col, row = tid % 100, tid // 100
        x0, y0 = col * CELL, row * CELL
        has_dark = False
        for yy in range(y0, y0 + CELL):
            for xx in range(x0, x0 + CELL):
                if sum(px[xx, yy][:3]) < 384:  # any reasonably dark pixel
                    has_dark = True
                    break
            if has_dark:
                break
        if not has_dark:
            blank.append(tid)
    return blank


def fetch_pixels(tid):
    url = f"{BASE}/normie/{tid}/pixels"
    with urllib.request.urlopen(url, timeout=15) as r:
        return r.read().decode("utf-8").strip()


def paint(img, tid, bits):
    col, row = tid % 100, tid // 100
    x0, y0 = col * CELL, row * CELL
    px = img.load()
    for i, ch in enumerate(bits):
        if i >= CELL * CELL:
            break
        cx = i % CELL
        cy = i // CELL
        px[x0 + cx, y0 + cy] = ON if ch == "1" else OFF


def main():
    img = Image.open(ATLAS).convert("RGB")
    print("scanning for blank cells…", flush=True)
    blank = find_blank(img)
    print(f"blank cells: {len(blank)}", flush=True)
    if not blank:
        print("nothing to do.")
        return

    ok = 0
    fail = 0
    for n, tid in enumerate(blank):
        try:
            bits = fetch_pixels(tid)
            if bits and len(bits) >= CELL * CELL and "1" in bits:
                paint(img, tid, bits)
                ok += 1
            else:
                fail += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f"  #{tid}: {e}", flush=True)
        if n % 50 == 0:
            img.save(ATLAS)
            print(f"  progress {n}/{len(blank)} ok={ok} fail={fail}", flush=True)
        time.sleep(THROTTLE)

    img.save(ATLAS)
    print(f"done. patched {ok}, failed {fail}. saved {ATLAS}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
