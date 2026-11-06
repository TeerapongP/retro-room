import { describe, expect, it } from "vitest";
import { VOTES_PER_MEMBER, countVotes, toggleVote, votesLeft } from "../../lib/votes";

describe("VOTES_PER_MEMBER", () => {
  it("should be 3", () => {
    expect(VOTES_PER_MEMBER).toBe(3);
  });
});

describe("countVotes", () => {
  it("should count how many voters chose each card", () => {
    const counts = countVotes([
      { uid: "a", cardIds: ["c1", "c2"] },
      { uid: "b", cardIds: ["c1"] },
      { uid: "c", cardIds: [] },
    ]);

    expect(counts.get("c1")).toBe(2);
    expect(counts.get("c2")).toBe(1);
    expect(counts.get("c3")).toBeUndefined();
  });

  it("should count a card once per voter even if its id is listed twice", () => {
    expect(countVotes([{ uid: "a", cardIds: ["c1", "c1"] }]).get("c1")).toBe(1);
  });

  it("should return an empty map for no voters", () => {
    expect(countVotes([]).size).toBe(0);
  });
});

describe("votesLeft", () => {
  it("should be the allowance minus the votes already placed and never below 0", () => {
    expect(votesLeft([])).toBe(3);
    expect(votesLeft(["a", "b"])).toBe(1);
    expect(votesLeft(["a", "b", "c"])).toBe(0);
    expect(votesLeft(["a", "b", "c", "d"])).toBe(0);
  });
});

describe("toggleVote", () => {
  it("should add a vote for a card the member has not voted for", () => {
    expect(toggleVote(["a"], "b")).toEqual(["a", "b"]);
  });

  it("should take a vote back when the member presses it again", () => {
    expect(toggleVote(["a", "b"], "a")).toEqual(["b"]);
  });

  it("should refuse a fourth vote and return null", () => {
    expect(toggleVote(["a", "b", "c"], "d")).toBeNull();
  });

  it("should still let the member take a vote back when all three are used", () => {
    expect(toggleVote(["a", "b", "c"], "c")).toEqual(["a", "b"]);
  });
});
