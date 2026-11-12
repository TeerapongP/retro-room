import { describe, expect, it } from "vitest";
import { pickWinnerUid, sortCandidates, wheelAngle } from "../../lib/wheel";

const people = [
  { uid: "c", name: "Cat" },
  { uid: "a", name: "Ann" },
  { uid: "b", name: "Bob" },
];

describe("sortCandidates", () => {
  it("should order by uid so every device draws the same wheel", () => {
    expect(sortCandidates(people).map((person) => person.uid)).toEqual(["a", "b", "c"]);
    expect(people[0].uid).toBe("c");
  });
});

describe("pickWinnerUid", () => {
  it("should map the random value onto the sorted candidates", () => {
    expect(pickWinnerUid(people, () => 0)).toBe("a");
    expect(pickWinnerUid(people, () => 0.5)).toBe("b");
    expect(pickWinnerUid(people, () => 0.99)).toBe("c");
  });

  it("should stay in range when random returns 1 and be null without candidates", () => {
    expect(pickWinnerUid(people, () => 1)).toBe("c");
    expect(pickWinnerUid([], () => 0.3)).toBeNull();
  });
});

describe("wheelAngle", () => {
  it("should put the middle of the winner's segment under the pointer after whole turns", () => {
    expect(wheelAngle(0, 4, 0)).toBe(-45);
    expect(wheelAngle(1, 4, 0)).toBe(-135);
    expect(wheelAngle(0, 4, 5)).toBe(1800 - 45);
  });

  it("should return 0 for a bad index or no candidates", () => {
    expect(wheelAngle(-1, 4)).toBe(0);
    expect(wheelAngle(4, 4)).toBe(0);
    expect(wheelAngle(0, 0)).toBe(0);
  });
});
