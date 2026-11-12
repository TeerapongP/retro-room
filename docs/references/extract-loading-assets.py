"""Builds the Loading screen art from docs/references/retro-room-loading.png.

The reference was generated with OpenAI's image generation tool for this project, not taken from
Harvest Moon. Three things are lifted out of the scene and replaced with grass patches taken from clean
areas of the same image: the wooden "Loading..." panel (the app renders a real HTML panel), the sleeping
farmer (breathing animation) and the three "Z" glyphs (floating animation).

Frames are made by moving existing pixels, never by drawing new art (same method as D40).

Run: python3 -I docs/references/extract-loading-assets.py <output-dir>
Needs Pillow and numpy. Writes scene.webp, farmer-breathe.png, zzz-1..3.png, sheets.json and
manifest.json (positions in reference pixels).
"""
import json
import random
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

REFERENCE = Path(__file__).with_name("retro-room-loading.png")
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

src = Image.open(REFERENCE).convert("RGB")
A = np.array(src).astype(np.int32)
H, W, _ = A.shape

PANEL = (640, 400, 1032, 520)
FARMER_BOX = (456, 590, 738, 826)
GLYPH_BOXES = [(599, 582, 638, 623), (638, 555, 672, 596), (604, 627, 625, 654)]
GLYPH_TRAIL = (642, 603, 660, 613)
BREATH_AMPLITUDES = [0, 1, 2, 1]
BREATH_CENTER = (615, 728)
BREATH_SIGMA = (38, 15)
FARMER_PAD_TOP = 3
GRASS_ROWS = (470, 900)
P, FEATHER = 48, 16


def is_green(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (g > r + 15) & (g > b + 25) & (g < 200)


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    found = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            cells = []
            while queue:
                y, x = queue.popleft()
                cells.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))
            found.append(cells)
    return found


def dilate(mask, steps=1):
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def cutout(box, hole_boxes=(), min_size=40):
    """Non-grass pixels connected inside box, minus anything inside hole_boxes. Returns RGBA, bbox, full-size mask."""
    x0, y0, x1, y1 = box
    crop = A[y0:y1, x0:x1]
    h, w, _ = crop.shape
    background = is_green(crop)
    for hx0, hy0, hx1, hy1 in hole_boxes:
        background[max(0, hy0 - y0) : max(0, hy1 - y0), max(0, hx0 - x0) : max(0, hx1 - x0)] = True
    outside = np.zeros((h, w), bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if background[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if background[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and background[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    kept = np.zeros((h, w), bool)
    for cells in components(~outside):
        if len(cells) >= min_size:
            for y, x in cells:
                kept[y, x] = True
    alpha = np.where(kept, 255, 0).astype(np.uint8)
    image = Image.fromarray(np.dstack([crop.astype(np.uint8), alpha]), "RGBA")
    left, top, right, bottom = image.getchannel("A").getbbox()
    full = np.zeros((H, W), bool)
    full[y0:y1, x0:x1] = kept
    return np.array(image.crop((left, top, right, bottom))), (x0 + left, y0 + top, x0 + right, y0 + bottom), full


farmer, farmer_box, farmer_mask = cutout(FARMER_BOX, GLYPH_BOXES + [GLYPH_TRAIL], min_size=800)
glyph_cuts = [cutout(box) for box in GLYPH_BOXES]

dirty = np.zeros((H, W), bool)
px0, py0, px1, py1 = PANEL
dirty[py0:py1, px0:px1] = True
dirty |= dilate(farmer_mask, 4)
for _, _, mask in glyph_cuts:
    dirty |= dilate(mask, 3)
tx0, ty0, tx1, ty1 = GLYPH_TRAIL
dirty[ty0:ty1, tx0:tx1] = True

green = is_green(A)
integral_dirty = np.cumsum(np.cumsum(dirty.astype(np.int32), 0), 1)
integral_green = np.cumsum(np.cumsum(green.astype(np.int32), 0), 1)


def box_sum(integral, y, x):
    y1_, x1_ = y + P, x + P
    total = integral[y1_ - 1, x1_ - 1]
    if y > 0:
        total -= integral[y - 1, x1_ - 1]
    if x > 0:
        total -= integral[y1_ - 1, x - 1]
    if y > 0 and x > 0:
        total += integral[y - 1, x - 1]
    return total


candidates = [
    (y, x)
    for y in range(GRASS_ROWS[0], min(GRASS_ROWS[1], H - P), 6)
    for x in range(0, W - P, 6)
    if box_sum(integral_dirty, y, x) == 0 and box_sum(integral_green, y, x) > 0.99 * P * P
]
random.seed(5)
acc = np.zeros((H, W, 3), np.float32)
weights = np.zeros((H, W, 1), np.float32)
ramp = np.minimum(np.minimum(np.arange(P) + 1, P - np.arange(P)), FEATHER).astype(np.float32) / FEATHER
window = np.outer(ramp, ramp)[..., None]
ys, xs = np.nonzero(dirty)
for y in range(max(0, ys.min() - FEATHER), min(H, ys.max() + FEATHER), P - FEATHER):
    for x in range(max(0, xs.min() - FEATHER), min(W, xs.max() + FEATHER), P - FEATHER):
        if not dirty[y : y + P, x : x + P].any():
            continue
        sy, sx = random.choice(candidates)
        h, w = min(P, H - y), min(P, W - x)
        acc[y : y + h, x : x + w] += A[sy : sy + h, sx : sx + w] * window[:h, :w]
        weights[y : y + h, x : x + w] += window[:h, :w]
collage = (acc / np.maximum(weights, 1e-3)).clip(0, 255).astype(np.uint8)

scene = A.astype(np.uint8).copy()
scene[dirty] = collage[dirty]
Image.fromarray(scene).save(OUT / "scene.webp", quality=94, method=6)


def breathe_frame(sprite, amplitude):
    height, width, _ = sprite.shape
    padded = np.zeros((height + FARMER_PAD_TOP, width, 4), np.uint8)
    padded[FARMER_PAD_TOP:] = sprite
    cx, cy = BREATH_CENTER[0] - farmer_box[0], BREATH_CENTER[1] - farmer_box[1] + FARMER_PAD_TOP
    ys_, xs_ = np.mgrid[0 : height + FARMER_PAD_TOP, 0:width]
    bump = np.exp(-(((xs_ - cx) ** 2) / (2 * BREATH_SIGMA[0] ** 2) + ((ys_ - cy) ** 2) / (2 * BREATH_SIGMA[1] ** 2)))
    source_y = np.clip(np.round(ys_ + amplitude * bump).astype(int), 0, height + FARMER_PAD_TOP - 1)
    return padded[source_y, xs_]


frames = [breathe_frame(farmer, amplitude) for amplitude in BREATH_AMPLITUDES]
Image.fromarray(np.concatenate(frames, axis=1), "RGBA").save(OUT / "farmer-breathe.png", optimize=True)

glyph_boxes = []
for index, (glyph, box, _) in enumerate(glyph_cuts, start=1):
    Image.fromarray(glyph, "RGBA").save(OUT / f"zzz-{index}.png", optimize=True)
    glyph_boxes.append(list(box))

sheets = {
    "farmer-breathe": {
        "frames": len(frames),
        "frameWidth": frames[0].shape[1],
        "frameHeight": frames[0].shape[0],
        "padTop": FARMER_PAD_TOP,
    }
}
(OUT / "sheets.json").write_text(json.dumps(sheets, indent=2) + "\n")

manifest = {
    "reference": [W, H],
    "panel": list(PANEL),
    "farmer": [farmer_box[0], farmer_box[1] - FARMER_PAD_TOP, farmer_box[2], farmer_box[3]],
    "zzz": glyph_boxes,
    "candidatePatches": len(candidates),
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest))
