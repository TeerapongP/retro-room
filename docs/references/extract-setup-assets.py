"""Extracts the Player Name Setup scene layers from docs/references/retro-room-player-name-reference.png.

The reference was generated with OpenAI's image generation tool for this project, not taken from
Harvest Moon. The three UI panels, the hand cursor and the animated sprites are removed from the
scene plate (their pixels are replaced by grass patches taken from clean areas), because the app
renders the panels as real components and the sprites as separate layers.

Run: python3 -I docs/references/extract-setup-assets.py <output-dir>
Needs Pillow and numpy. Writes scene.png, sprite layers and manifest.json (reference pixels).
"""
import json
import random
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

REFERENCE = Path(__file__).with_name("retro-room-player-name-reference.png")
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

src = Image.open(REFERENCE).convert("RGB")
A = np.array(src).astype(np.int32)
H, W, _ = A.shape

PANELS = {
    "dialogue": (105, 150, 745, 270),
    "name": (888, 198, 1470, 318),
    "keyboard": (195, 315, 1350, 735),
}
SPRITES = {
    "farmer": (398, 730, 560, 930),
    "chicken": (40, 505, 165, 635),
    "dog": (1340, 690, 1495, 835),
    "hand": (150, 342, 234, 414),
}
FLOWERS = {
    "flowers-left": (0, 380, 125, 485),
    "flowers-bloom-white": (600, 790, 705, 895),
    "flowers-bloom-yellow": (775, 775, 875, 865),
    "flowers-pink": (1325, 885, 1445, 985),
}
HAND_BOX = SPRITES["hand"]

dirty = np.zeros((H, W), bool)
PAD = 6
for x0, y0, x1, y1 in PANELS.values():
    dirty[y0:y1, x0:x1] = True
for x0, y0, x1, y1 in [*SPRITES.values(), *FLOWERS.values()]:
    dirty[max(0, y0 - PAD) : y1 + PAD, max(0, x0 - PAD) : x1 + PAD] = True


def is_green(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (g > r + 18) & (g > b + 12) & (g < 190)


clean_green = is_green(A) & ~dirty
grass_mean = A[clean_green].astype(np.float64).mean(axis=0)
grass_inv_cov = np.linalg.inv(np.cov(A[clean_green].astype(np.float64).T))


def is_green_or_cream(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    is_cream = (r > 225) & (g > 195) & (b < g - 12)
    return is_green(px) | is_cream


def grass_distance(px):
    d = px.astype(np.float64) - grass_mean
    return np.sqrt(np.einsum("...i,ij,...j->...", d, grass_inv_cov, d))


MIN_COMPONENT_PIXELS = 40


def drop_specks(opaque):
    h, w = opaque.shape
    seen = np.zeros((h, w), bool)
    keep = np.zeros((h, w), bool)
    for sy in range(h):
        for sx in range(w):
            if not opaque[sy, sx] or seen[sy, sx]:
                continue
            component = [(sy, sx)]
            seen[sy, sx] = True
            index = 0
            while index < len(component):
                y, x = component[index]
                index += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and opaque[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            component.append((ny, nx))
            if len(component) >= MIN_COMPONENT_PIXELS:
                for y, x in component:
                    keep[y, x] = True
    return keep


def cutout(box, background_test):
    x0, y0, x1, y1 = box
    crop = A[y0:y1, x0:x1]
    h, w, _ = crop.shape
    bg = background_test(crop)
    outside = np.zeros((h, w), bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    alpha = np.where(drop_specks(~outside), 255, 0).astype(np.uint8)
    rgba = np.dstack([crop.astype(np.uint8), alpha])
    image = Image.fromarray(rgba, "RGBA")
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox), (x0 + bbox[0], y0 + bbox[1], x0 + bbox[2], y0 + bbox[3])


manifest = {"reference": [W, H], "panels": {k: list(v) for k, v in PANELS.items()}}
for name in ("farmer", "chicken", "dog", "hand"):
    image, placed = cutout(SPRITES[name], is_green_or_cream if name == "hand" else is_green)
    if name == "hand":
        # The glove is white, blue and navy. Warm pixels are the panel border and selection box behind it.
        pixels = np.array(image)
        warm = pixels[..., 0].astype(int) > pixels[..., 2].astype(int) + 6
        pixels[warm, 3] = 0
        image = Image.fromarray(pixels, "RGBA")
        image = image.crop(image.getchannel("A").getbbox())
        placed = [placed[0], placed[1], placed[0] + image.width, placed[1] + image.height]
    image.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = list(placed)
for name, box in FLOWERS.items():
    image, placed = cutout(box, lambda px: grass_distance(px) < 3.2)
    image.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = list(placed)

# Scene plate: the reference with every removed layer replaced by feathered clean grass patches.
random.seed(11)
P, FEATHER = 64, 20
dirty_integral = np.cumsum(np.cumsum(dirty.astype(np.int32), 0), 1)
green_integral = np.cumsum(np.cumsum(is_green(A).astype(np.int32), 0), 1)


def box_sum(integral, y, x):
    y1, x1 = y + P, x + P
    total = integral[y1 - 1, x1 - 1]
    if y > 0:
        total -= integral[y - 1, x1 - 1]
    if x > 0:
        total -= integral[y1 - 1, x - 1]
    if y > 0 and x > 0:
        total += integral[y - 1, x - 1]
    return total


candidates = [
    (y, x)
    for y in range(0, H - P, 8)
    for x in range(0, W - P, 8)
    if box_sum(dirty_integral, y, x) == 0 and box_sum(green_integral, y, x) > 0.97 * P * P
]
acc = np.zeros((H, W, 3), np.float32)
weights = np.zeros((H, W, 1), np.float32)
ramp = np.minimum(np.minimum(np.arange(P) + 1, P - np.arange(P)), FEATHER).astype(np.float32) / FEATHER
window = np.outer(ramp, ramp)[..., None]
for y in range(0, H, P - FEATHER):
    for x in range(0, W, P - FEATHER):
        sy, sx = random.choice(candidates)
        h, w = min(P, H - y), min(P, W - x)
        acc[y : y + h, x : x + w] += A[sy : sy + h, sx : sx + w] * window[:h, :w]
        weights[y : y + h, x : x + w] += window[:h, :w]
collage = (acc / np.maximum(weights, 1e-3)).clip(0, 255).astype(np.uint8)
scene = A.astype(np.uint8).copy()
scene[dirty] = collage[dirty]
Image.fromarray(scene).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(
    OUT / "scene.png", optimize=True
)

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest))
