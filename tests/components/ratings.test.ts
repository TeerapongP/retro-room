import { describe, expect, it } from "vitest";
import { RATING_VALUES, averageRating, formatScore, isValidRating } from "../../lib/ratings";

describe("RATING_VALUES", () => {
  it("should run from 1 to 5 in steps of 0.5", () => {
    expect(RATING_VALUES).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });
});

describe("isValidRating", () => {
  it("should accept every step and reject everything else", () => {
    expect(RATING_VALUES.every(isValidRating)).toBe(true);
    for (const bad of [0, 0.5, 5.5, 1.2, -1, "3", null, undefined, Number.NaN]) {
      expect(isValidRating(bad)).toBe(false);
    }
  });
});

describe("averageRating", () => {
  it("should average the scores rounded to 2 decimals", () => {
    expect(averageRating([{ uid: "a", score: 4 }, { uid: "b", score: 3.5 }])).toBe(3.75);
    expect(averageRating([{ uid: "a", score: 1 }, { uid: "b", score: 1 }, { uid: "c", score: 1.5 }])).toBe(1.17);
  });

  it("should be null when nobody rated", () => {
    expect(averageRating([])).toBeNull();
  });
});

describe("formatScore", () => {
  it("should show whole scores without a decimal and halves with one", () => {
    expect(formatScore(4)).toBe("4");
    expect(formatScore(4.5)).toBe("4.5");
    expect(formatScore(3.75)).toBe("3.8");
  });
});
