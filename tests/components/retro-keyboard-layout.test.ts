import { describe, expect, it } from "vitest";
import { KEYBOARD_PAGES, type KeyboardKey } from "../../components/ui/RetroKeyboard";

const characterOf = (key: KeyboardKey) => key.character;
const cellsOf = (keys: KeyboardKey[], layout: "wide" | "narrow") =>
  keys.flatMap((key) =>
    Array.from({ length: key[layout].span }, (_, offset) => `${key[layout].column + offset}:${key[layout].row}`),
  );

describe("RetroKeyboard layout", () => {
  const standardCharacters = KEYBOARD_PAGES.standard.filter((key) => key.kind === "character").map(characterOf);

  it(`should offer A to Z, a to z, 0 to 9 and Space exactly once when the standard page is shown`, () => {
    const expected = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", " "];

    expect([...standardCharacters].sort()).toEqual([...expected].sort());
  });

  it.each(["standard", "symbols"] as const)(
    `should include Mark, Space and OK when the %s page is shown`,
    (pageName) => {
      const ids = KEYBOARD_PAGES[pageName].map((key) => key.id);

      expect(ids).toEqual(expect.arrayContaining(["mark", "space", "ok"]));
    },
  );

  it(`should offer only printable non-space ASCII symbols when the symbols page is shown`, () => {
    const symbols = KEYBOARD_PAGES.symbols
      .filter((key) => key.kind === "character" && key.id !== "space")
      .map(characterOf);

    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) expect(symbol).toMatch(/^[\x21-\x7e]$/);
    expect(symbols.filter((symbol) => /[A-Za-z0-9]/.test(symbol ?? ""))).toEqual([]);
  });

  it.each(["standard", "symbols"] as const)(
    `should never place two keys in the same cell when the %s page uses either grid`,
    (pageName) => {
      for (const layout of ["wide", "narrow"] as const) {
        const cells = cellsOf(KEYBOARD_PAGES[pageName], layout);

        expect(new Set(cells).size).toBe(cells.length);
      }
    },
  );

  it(`should keep every key inside the 19 column wide grid and 8 column narrow grid`, () => {
    for (const key of [...KEYBOARD_PAGES.standard, ...KEYBOARD_PAGES.symbols]) {
      expect(key.wide.column + key.wide.span - 1).toBeLessThanOrEqual(19);
      expect(key.wide.row).toBeLessThanOrEqual(6);
      expect(key.narrow.column + key.narrow.span - 1).toBeLessThanOrEqual(8);
    }
  });
});
