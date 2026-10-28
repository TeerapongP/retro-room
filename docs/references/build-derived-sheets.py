"""Builds derived sprite sheets (flowers and dog) from the single-frame layers in public/art. The farmer comes from the owner's sheet instead (extract-sprite-sheets.py farmer).

Frames are made by moving existing pixels, never by drawing new art:
  - flowers: rows shear sideways, more toward the top, the root stays fixed (sway)
  - dog: the tail piece rotates around its base (tail wag), nearest neighbour so pixels stay hard
The single frames came from the approved reference, which was generated with OpenAI's image
generation tool, so these sheets are derived from AI generated art.

Run: python3 -I docs/references/build-derived-sheets.py <output-dir>
Needs Pillow and numpy. Writes the PNG strips, sheets.json and preview.png.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parents[2] / "public" / "art"
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

SWAY_PAD = 3
SWAY_OFFSETS = [0, 2, 0, -2]  # pixels at the top of the plant, per frame
DOG_TAIL_ANGLES = [0, 14, 0, -14]  # degrees, per frame
DOG_TAIL_PIVOT = (146.0, 66.0)  # where the tail joins the back, in dog.png pixels
DOG_TAIL_CLEAR = (143, 62)  # pixels removed from the body: x >= 143 and y <= 62
DOG_TAIL_ROTATE = (143, 67)  # pixels that rotate: x >= 143 and y <= 67 (5 px overlap with the back)
DOG_PAD_TOP = 8
DOG_PAD_RIGHT = 10
FLOWER_NAMES = [
    "flowers-white-1",
    "flowers-white-2",
    "flowers-white-3",
    "flowers-yellow-1",
    "flowers-yellow-2",
    "flowers-pink-1",
    "flowers-pink-2",
]


MIN_COMPONENT_PIXELS = 100


def drop_specks(sprite):
    """Clears small floating opaque islands so they do not drift during the sway."""
    opaque = sprite[..., 3] > 0
    height, width = opaque.shape
    seen = np.zeros_like(opaque)
    cleaned = sprite.copy()
    for sy in range(height):
        for sx in range(width):
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
                        if 0 <= ny < height and 0 <= nx < width and opaque[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            component.append((ny, nx))
            if len(component) < MIN_COMPONENT_PIXELS:
                for y, x in component:
                    cleaned[y, x] = 0
    return cleaned


def load(name):
    return np.array(Image.open(ART / f"{name}.png").convert("RGBA"))


def sway_frame(sprite, top_offset):
    height, width, _ = sprite.shape
    frame = np.zeros((height, width + 2 * SWAY_PAD, 4), np.uint8)
    for y in range(height):
        above_root = (height - 1 - y) / (height - 1)
        weight = max(0.0, (above_root - 0.2) / 0.8) ** 1.2
        shift = int(round(top_offset * weight))
        frame[y, SWAY_PAD + shift : SWAY_PAD + shift + width] = sprite[y]
    return frame


def dog_frame(sprite, angle_degrees):
    height, width, _ = sprite.shape
    ys, xs = np.mgrid[0:height, 0:width]
    opaque = sprite[..., 3] > 0
    clear_mask = opaque & (xs >= DOG_TAIL_CLEAR[0]) & (ys <= DOG_TAIL_CLEAR[1])
    tail_mask = opaque & (xs >= DOG_TAIL_ROTATE[0]) & (ys <= DOG_TAIL_ROTATE[1])
    body = sprite.copy()
    body[clear_mask] = 0
    frame = np.zeros((height + DOG_PAD_TOP, width + DOG_PAD_RIGHT, 4), np.uint8)
    frame[DOG_PAD_TOP:, :width] = body
    angle = np.deg2rad(angle_degrees)
    cos, sin = np.cos(angle), np.sin(angle)
    px, py = DOG_TAIL_PIVOT
    out_h, out_w = frame.shape[:2]
    dst_y, dst_x = np.mgrid[0:out_h, 0:out_w]
    rel_x = dst_x - px
    rel_y = (dst_y - DOG_PAD_TOP) - py
    src_x = np.round(px + cos * rel_x + sin * rel_y).astype(int)
    src_y = np.round(py - sin * rel_x + cos * rel_y).astype(int)
    inside = (src_x >= 0) & (src_x < width) & (src_y >= 0) & (src_y < height)
    sx = np.clip(src_x, 0, width - 1)
    sy = np.clip(src_y, 0, height - 1)
    from_tail = inside & tail_mask[sy, sx]
    frame[from_tail] = sprite[sy[from_tail], sx[from_tail]]
    return frame


def strip(frames):
    return Image.fromarray(np.concatenate(frames, axis=1), "RGBA")


sheets = {}
previews = []
for name in FLOWER_NAMES:
    sprite = drop_specks(load(name))
    frames = [sway_frame(sprite, offset) for offset in SWAY_OFFSETS]
    sheet_name = f"{name}-sway"
    strip(frames).save(OUT / f"{sheet_name}.png", optimize=True)
    sheets[sheet_name] = {
        "frames": len(frames),
        "frameWidth": frames[0].shape[1],
        "frameHeight": frames[0].shape[0],
        "pad": SWAY_PAD,
    }
    previews.append(strip(frames))

dog = load("dog")
frames = [dog_frame(dog, angle) for angle in DOG_TAIL_ANGLES]
strip(frames).save(OUT / "dog-wag.png", optimize=True)
sheets["dog-wag"] = {
    "frames": len(frames),
    "frameWidth": frames[0].shape[1],
    "frameHeight": frames[0].shape[0],
    "pad": 0,
    "padTop": DOG_PAD_TOP,
    "padRight": DOG_PAD_RIGHT,
}
previews.append(strip(frames))

(OUT / "sheets.json").write_text(json.dumps(sheets, indent=2) + "\n")

width = max(p.width for p in previews)
height = sum(p.height for p in previews) + 8 * len(previews)
sheet = Image.new("RGB", (width, height), (230, 220, 190))
y = 0
for preview in previews:
    sheet.paste(preview, (0, y), preview)
    y += preview.height + 8
sheet.save(OUT / "preview.png")
print(json.dumps(sheets))
