"""Extracts the Login screen art layers from docs/references/retro-room-reference.png.

The reference was generated with OpenAI's image generation tool for this project.
Run: python3 -I docs/references/extract-login-assets.py <output-dir>
Needs Pillow and numpy. Writes PNG layers and manifest.json (positions in reference pixels).
"""
import json
import random
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

REFERENCE = Path(__file__).with_name("retro-room-reference.png")
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

src = Image.open(REFERENCE).convert("RGB")
A = np.array(src).astype(np.int32)
H, W, _ = A.shape

SPRITES = {
    "chicken": (55, 490, 265, 690),
    "farmer": (140, 725, 385, 940),
    "dog": (1175, 640, 1365, 800),
    "logo-sign": (225, 110, 1235, 655),
}
FLOWERS = {
    "flowers-white-1": (40, 5, 215, 150),
    "flowers-white-2": (0, 320, 145, 445),
    "flowers-white-3": (55, 915, 220, 1040),
    "flowers-yellow-1": (1265, 30, 1405, 270),
    "flowers-yellow-2": (0, 720, 105, 950),
    "flowers-pink-1": (1240, 440, 1390, 580),
    "flowers-pink-2": (1265, 850, 1420, 985),
}
BUTTON_AND_FOOTER = [(385, 675, 1065, 830), (430, 920, 1050, 985)]

dirty = np.zeros((H, W), bool)
PAD = 18
for x0, y0, x1, y1 in [*SPRITES.values(), *FLOWERS.values(), *BUTTON_AND_FOOTER]:
    dirty[max(0, y0 - PAD) : y1 + PAD, max(0, x0 - PAD) : x1 + PAD] = True

clean_pixels = A[~dirty].astype(np.float64)
grass_mean = clean_pixels.mean(axis=0)
grass_inv_cov = np.linalg.inv(np.cov(clean_pixels.T))


def grass_distance(px):
    d = px.astype(np.float64) - grass_mean
    return np.sqrt(np.einsum("...i,ij,...j->...", d, grass_inv_cov, d))


def is_green(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (g > r + 18) & (g > b + 12) & (g < 190)


MIN_COMPONENT_PIXELS = 40


def drop_specks(opaque):
    """Removes small isolated opaque islands (leftover grass specks)."""
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


manifest = {"reference": [W, H]}
for name, box in SPRITES.items():
    image, placed = cutout(box, is_green)
    image.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = list(placed)
for name, box in FLOWERS.items():
    image, placed = cutout(box, lambda px: grass_distance(px) < 3.0)
    image.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = list(placed)

# Sprite-free grass plate: feathered collage of clean 96px patches taken from the reference.
random.seed(7)
P, FEATHER = 96, 32
integral = np.cumsum(np.cumsum(dirty.astype(np.int32), 0), 1)


def is_clean(y, x):
    y1, x1 = y + P, x + P
    total = integral[y1 - 1, x1 - 1]
    if y > 0:
        total -= integral[y - 1, x1 - 1]
    if x > 0:
        total -= integral[y1 - 1, x - 1]
    if y > 0 and x > 0:
        total += integral[y - 1, x - 1]
    return total == 0


candidates = [(y, x) for y in range(0, H - P, 8) for x in range(0, W - P, 8) if is_clean(y, x)]
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
plate = (acc / np.maximum(weights, 1e-3)).clip(0, 255).astype(np.uint8)
Image.fromarray(plate).save(OUT / "grass-plate.png", optimize=True)

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest))
