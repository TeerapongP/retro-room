import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../docs/references/loading-art-manifest.json";
import sheets from "../../public/art/loading/sheets.json";

function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(resolve(process.cwd(), path));
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

describe("loading scene art in public/art/loading", () => {
  it(`should have a farmer sheet exactly frames x frameWidth wide when declared in sheets.json`, () => {
    const meta = sheets["farmer-breathe"];
    const { width, height } = pngSize("public/art/loading/farmer-breathe.png");

    expect(meta.frames).toBeGreaterThanOrEqual(2);
    expect(width).toBe(meta.frames * meta.frameWidth);
    expect(height).toBe(meta.frameHeight);
  });

  it(`should size each Z glyph to its box when the manifest places it`, () => {
    manifest.zzz.forEach(([left, top, right, bottom], index) => {
      const { width, height } = pngSize(`public/art/loading/zzz-${index + 1}.png`);

      expect(width).toBe(right - left);
      expect(height).toBe(bottom - top);
    });
  });

  it(`should match the reference size when the scene plate is a WebP of the same dimensions`, () => {
    const file = readFileSync(resolve(process.cwd(), "public/art/loading/scene.webp"));

    expect(file.subarray(0, 4).toString()).toBe("RIFF");
    expect(file.subarray(8, 12).toString()).toBe("WEBP");
    expect(manifest.reference).toEqual([1672, 941]);
  });
});
