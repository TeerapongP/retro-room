import { describe, expect, it } from "vitest";
import { removeLastCharacter } from "../../lib/remove-last-character";

describe("removeLastCharacter", () => {
  it("should drop the final letter when the text is ASCII", () => {
    expect(removeLastCharacter("Tom")).toBe("To");
  });

  it("should return an empty string when the text is empty", () => {
    expect(removeLastCharacter("")).toBe("");
  });

  it("should drop a whole emoji when the text ends with a surrogate pair", () => {
    expect(removeLastCharacter("Hi😀")).toBe("Hi");
  });

  it("should drop one Thai character when the text is Thai", () => {
    expect(removeLastCharacter("สมชาย")).toBe("สมชา");
  });

  it("should drop a trailing space when the text ends with a space", () => {
    expect(removeLastCharacter("A ")).toBe("A");
  });
});
