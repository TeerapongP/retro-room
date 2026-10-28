import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sheets from "../../public/art/setup/sheets.json";

function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(path);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

describe("sprite sheets in public/art/setup", () => {
  const entries = Object.entries(sheets);

  it.each(entries)(
    `should have a PNG exactly frames x frameWidth wide when %s is declared in sheets.json`,
    (name, meta) => {
      const { width, height } = pngSize(resolve(process.cwd(), `public/art/setup/${name}.png`));

      expect(width).toBe(meta.frames * meta.frameWidth);
      expect(height).toBe(meta.frameHeight);
    },
  );

  it(`should declare the farmer and four flower groups when the setup scene animates`, () => {
    expect(Object.keys(sheets).sort()).toEqual([
      "farmer-breathe",
      "flowers-bloom-white-sway",
      "flowers-bloom-yellow-sway",
      "flowers-left-sway",
      "flowers-pink-sway",
    ]);
  });
});
