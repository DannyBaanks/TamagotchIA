#!/usr/bin/env python3
"""Build public/packs/malbolge-cat/ from the untouched Companion originals.

Two defects in the original art, both visible on a real iPhone (2026-09-25):

1. Doubled paws. In every frame where a front paw is raised, the resting paws
   are still drawn on the floor, so the cat shows three or four front paws.
   Those frames are dropped (listed in BROKEN, found by looking at all 36).
   Redrawing them needs an illustrator or an image model, not a script.
2. A blue/cyan halo: fringe pixels left around the silhouette when the
   background was cut out. Removed by peeling bluish pixels that touch
   transparency, a few passes deep. The purple glitch ear (high red) and the
   lime details are protected by the colour test.

Originals: art/companion-original/malbolge-cat (Companion e7e8692, hashes in
its SHA256SUMS). Run:  python3 tools/clean_pack_art.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art/companion-original/malbolge-cat"
DST = ROOT / "public/packs/malbolge-cat"

BROKEN = {
    "thinking": {4},
    "working": {1, 2, 3, 4},
    "success": {1, 2},
    "waiting": {1, 2, 4},
}
PASSES = 3


def halo(r: int, _g: int, b: int) -> bool:
    """Blue or cyan fringe. Purple has high red; lime has low blue; the outline is near black."""
    return r < 100 and b > 90 and b > r + 30


def peel(frame: Image.Image) -> tuple[Image.Image, int]:
    im = frame.copy()
    px = im.load()
    w, h = im.size
    removed = 0
    for _ in range(PASSES):
        doomed = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or not halo(r, g, b):
                    continue
                if any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    doomed.append((x, y))
        for x, y in doomed:
            px[x, y] = (0, 0, 0, 0)
        removed += len(doomed)
        if not doomed:
            break
    # stray specks: opaque pixels with at most one opaque neighbour belong to nothing
    specks = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] and sum(
        1 for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3]) <= 1]
    for x, y in specks:
        px[x, y] = (0, 0, 0, 0)
    return im, removed + len(specks)


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for src in sorted(SRC.glob("*.gif")):
        pose = src.stem
        gif = Image.open(src)
        frames, durations, removed = [], [], 0
        for i in range(gif.n_frames):
            gif.seek(i)
            if i in BROKEN.get(pose, set()):
                continue
            clean, n = peel(gif.convert("RGBA"))
            frames.append(clean)
            durations.append(gif.info.get("duration", 150))
            removed += n
        frames[0].save(DST / src.name, save_all=True, append_images=frames[1:], duration=durations,
                       loop=0, disposal=2, optimize=False)
        print(f"{pose:9} frames {gif.n_frames} -> {len(frames)}   halo pixels removed: {removed}")


if __name__ == "__main__":
    main()
