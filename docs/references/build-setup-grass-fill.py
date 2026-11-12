"""Builds the seamless grass fill used behind and around the /setup scene (decision D58).

The tile is a wrap-around collage of clean grass windows cut from public/art/setup/scene.png, so it
has the same color, pixel density and blotch texture as the scene. scene.png comes from the
reference generated with OpenAI's image generation tool; nothing else is added.

Run: python3 -I docs/references/build-setup-grass-fill.py <output.png>
Needs Pillow and numpy.
"""
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCENE = Path(__file__).resolve().parents[2] / "public" / "art" / "setup" / "scene.png"
OUT = Path(sys.argv[1])
TILE = 1024
PATCH = 160
FEATHER = 56
PALETTE_COLORS = 128
MIN_SOURCE_DISTANCE = 36  # sources closer than this look alike, so they are not reused together
random.seed(11)

scene = np.array(Image.open(SCENE).convert("RGB")).astype(np.int32)
height, width, _ = scene.shape
red, green, blue = scene[..., 0], scene[..., 1], scene[..., 2]
grass = (green > red + 12) & (green > blue + 25) & (green < 200)
not_grass = ~grass
integral = np.cumsum(np.cumsum(not_grass.astype(np.int32), 0), 1)


def clean(y, x, allowed=0.015):
    y1, x1 = y + PATCH, x + PATCH
    total = integral[y1 - 1, x1 - 1]
    if y > 0:
        total -= integral[y - 1, x1 - 1]
    if x > 0:
        total -= integral[y1 - 1, x - 1]
    if y > 0 and x > 0:
        total += integral[y - 1, x - 1]
    return total <= allowed * PATCH * PATCH


candidates = [(y, x) for y in range(0, height - PATCH, 12) for x in range(0, width - PATCH, 12) if clean(y, x)]
if len(candidates) < 40:
    sys.exit(f"Only {len(candidates)} clean grass windows found")
random.shuffle(candidates)
chosen = []
for candidate in candidates:
    if all(abs(candidate[0] - c[0]) + abs(candidate[1] - c[1]) >= MIN_SOURCE_DISTANCE for c in chosen):
        chosen.append(candidate)


ramp = np.minimum(np.minimum(np.arange(PATCH) + 1, PATCH - np.arange(PATCH)), FEATHER).astype(np.float32) / FEATHER
window = np.outer(ramp, ramp)[..., None]
acc = np.zeros((TILE, TILE, 3), np.float32)
weights = np.zeros((TILE, TILE, 1), np.float32)
step = PATCH - FEATHER
for y in range(0, TILE, step):
    for x in range(0, TILE, step):
        sy, sx = chosen[random.randrange(len(chosen))]
        patch = scene[sy : sy + PATCH, sx : sx + PATCH].astype(np.float32)
        if random.random() < 0.5:
            patch = patch[:, ::-1]
        if random.random() < 0.5:
            patch = patch[::-1, :]
        ys = (np.arange(PATCH) + y) % TILE
        xs = (np.arange(PATCH) + x) % TILE
        acc[np.ix_(ys, xs)] += patch * window
        weights[np.ix_(ys, xs)] += window
tile = (acc / np.maximum(weights, 1e-3)).clip(0, 255).astype(np.uint8)
# A 128 color palette keeps the file small; the scene grass is already dithered pixel art.
Image.fromarray(tile).quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT, optimize=True)
print(f"{len(candidates)} clean windows, {len(chosen)} distinct sources, tile {TILE}x{TILE}")
