import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import chickenSheets from "../../public/art/anim/sheets-chicken.json";
import farmerSheets from "../../public/art/anim/sheets-farmer.json";
import sheets from "../../public/art/anim/sheets.json";

function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(path);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

describe("sprite sheets in public/art/anim", () => {
  const entries = Object.entries({ ...sheets, ...chickenSheets, ...farmerSheets });

  it(`should list at least one sheet when animations ship`, () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)(
    `should have a PNG exactly frames x frameWidth wide when %s is declared in sheets.json`,
    (name, meta) => {
      const { width, height } = pngSize(resolve(process.cwd(), `public/art/anim/${name}.png`));

      expect(width).toBe(meta.frames * meta.frameWidth);
      expect(height).toBe(meta.frameHeight);
    },
  );

  it.each(entries)(`should use at least two frames when %s animates`, (_name, meta) => {
    expect(meta.frames).toBeGreaterThanOrEqual(2);
  });
});
