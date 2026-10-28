"""Builds the animated sprite strips for the Player Name Setup scene.

Input is the output of extract-setup-assets.py. Frames are made by moving existing pixels, never by
drawing new art (same method as build-derived-sheets.py): flowers shear sideways (sway) and the
farmer's chest rises (breathing). The source art was generated with OpenAI's image generation tool.

Run: python3 -I docs/references/build-setup-sheets.py <extract-output-dir> <public-art-setup-dir>
Needs Pillow and numpy. Writes the PNG strips and sheets.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SOURCE = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

SWAY_PAD = 3
SWAY_OFFSETS = [0, 2, 0, -2]
BREATH_AMPLITUDES = [0, 1, 2, 1]
FLOWER_NAMES = ["flowers-left", "flowers-bloom-white", "flowers-bloom-yellow", "flowers-pink"]
MIN_COMPONENT_PIXELS = 30


def load(name):
    return np.array(Image.open(SOURCE / f"{name}.png").convert("RGBA"))


def drop_specks(sprite):
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


def sway_frame(sprite, top_offset):
    height, width, _ = sprite.shape
    frame = np.zeros((height, width + 2 * SWAY_PAD, 4), np.uint8)
    for y in range(height):
        above_root = (height - 1 - y) / (height - 1)
        weight = max(0.0, (above_root - 0.2) / 0.8) ** 1.2
        shift = int(round(top_offset * weight))
        frame[y, SWAY_PAD + shift : SWAY_PAD + shift + width] = sprite[y]
    return frame


def breathe_frame(sprite, amplitude):
    height, width, _ = sprite.shape
    center = (width * 0.5, height * 0.58)
    sigma = (width * 0.2, height * 0.08)
    ys, xs = np.mgrid[0:height, 0:width]
    bump = np.exp(-(((xs - center[0]) ** 2) / (2 * sigma[0] ** 2) + ((ys - center[1]) ** 2) / (2 * sigma[1] ** 2)))
    source_y = np.clip(np.round(ys + amplitude * bump).astype(int), 0, height - 1)
    return sprite[source_y, xs]


def strip(frames):
    return Image.fromarray(np.concatenate(frames, axis=1), "RGBA")


sheets = {}
for name in FLOWER_NAMES:
    sprite = drop_specks(load(name))
    frames = [sway_frame(sprite, offset) for offset in SWAY_OFFSETS]
    strip(frames).save(OUT / f"{name}-sway.png", optimize=True)
    sheets[f"{name}-sway"] = {
        "frames": len(frames),
        "frameWidth": frames[0].shape[1],
        "frameHeight": frames[0].shape[0],
        "pad": SWAY_PAD,
    }

farmer = load("farmer")
frames = [breathe_frame(farmer, amplitude) for amplitude in BREATH_AMPLITUDES]
strip(frames).save(OUT / "farmer-breathe.png", optimize=True)
sheets["farmer-breathe"] = {
    "frames": len(frames),
    "frameWidth": frames[0].shape[1],
    "frameHeight": frames[0].shape[0],
    "pad": 0,
}

(OUT / "sheets.json").write_text(json.dumps(sheets, indent=2) + "\n")
print(json.dumps(sheets))
