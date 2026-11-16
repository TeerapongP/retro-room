/**
 * Unit tests for lib/fishing-festival.ts (pure logic, no Firebase).
 *
 * These tests import calcScores and buildCandidates from the data-layer module that
 * the fishing-data-layer agent will create. They run with `vitest run tests/unit` and
 * do not require the Firebase emulator.
 */

import { describe, expect, it } from "vitest";
import { buildCandidates, calcScores } from "../../lib/fishing-festival";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const t = (offsetMs = 0): Date => new Date(1_700_000_000_000 + offsetMs);

function makeCatch(uid: string, catchCount: number, lastCatchAtOffsetMs = 0) {
  return { uid, catchCount, lastCatchAt: t(lastCatchAtOffsetMs) };
}

// ---------------------------------------------------------------------------
// calcScores
// ---------------------------------------------------------------------------

describe("calcScores", () => {
  it("all score 0 with no catches and small-fish segment", () => {
    const catches = [makeCatch("a", 0), makeCatch("b", 0)];
    const results = calcScores(catches, "small-fish");
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  it("small-fish: each catch scores 10 points with no modifier", () => {
    const catches = [makeCatch("a", 3), makeCatch("b", 1)];
    const results = calcScores(catches, "small-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["a"]).toBe(30);
    expect(byUid["b"]).toBe(10);
  });

  it("big-fish: each catch scores catchCount × 10 × 2", () => {
    const catches = [makeCatch("a", 2), makeCatch("b", 4)];
    const results = calcScores(catches, "big-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["a"]).toBe(40);
    expect(byUid["b"]).toBe(80);
  });

  it("golden-fish: player with earliest lastCatchAt gets +50 bonus", () => {
    const catches = [
      makeCatch("a", 2, 1000),
      makeCatch("b", 1, 500), // earlier
    ];
    const results = calcScores(catches, "golden-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    // b has earliest lastCatchAt so gets +50; a has base 20
    expect(byUid["b"]).toBe(10 + 50); // 1 catch × 10 + 50 bonus
    expect(byUid["a"]).toBe(20); // 2 catches × 10, no bonus
  });

  it("golden-fish: player with earliest lastCatchAt wins the tie", () => {
    const catches = [
      makeCatch("a", 2, 1000),
      makeCatch("b", 2, 2000),
      makeCatch("c", 2, 500), // earliest
    ];
    const results = calcScores(catches, "golden-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["c"]).toBe(70); // 20 + 50
    expect(byUid["a"]).toBe(20);
    expect(byUid["b"]).toBe(20);
  });

  it("golden-fish: zero-catch players are not eligible for the bonus", () => {
    const catches = [
      makeCatch("a", 0, 100), // earliest but zero catches
      makeCatch("b", 1, 500),
    ];
    const results = calcScores(catches, "golden-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    // 'a' should not receive the bonus despite having the earliest timestamp
    expect(byUid["b"]).toBe(10 + 50); // only eligible catcher
    expect(byUid["a"]).toBe(0);
  });

  it("lucky: score = base + (catchCount × 20)", () => {
    const catches = [makeCatch("a", 3), makeCatch("b", 2)];
    const results = calcScores(catches, "lucky");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    // With lucky: base from normal (3×10=30) plus bonus 3×20=60 → 90
    // OR the spec means only catchCount×20 as the full score (no base)
    // The spec says "base + (catchCount × 20)" so base is catchCount×10 and lucky adds catchCount×20
    expect(byUid["a"]).toBe(30 + 60); // 3×10 base + 3×20 bonus = 90
    expect(byUid["b"]).toBe(20 + 40); // 2×10 + 2×20 = 60
  });

  it("double-points: score = (catchCount × 10) × 2", () => {
    const catches = [makeCatch("a", 3), makeCatch("b", 1)];
    const results = calcScores(catches, "double-points");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["a"]).toBe(60);
    expect(byUid["b"]).toBe(20);
  });

  it("rare-fish: first to reach catchCount >= 3 (earliest lastCatchAt among those) gets +100", () => {
    const catches = [
      makeCatch("a", 3, 2000), // reaches 3 but later
      makeCatch("b", 4, 1000), // reaches >= 3 earliest
      makeCatch("c", 2, 500),  // never reaches 3
    ];
    const results = calcScores(catches, "rare-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["b"]).toBe(40 + 100); // 4×10 + bonus
    expect(byUid["a"]).toBe(30);       // no bonus (b was earlier)
    expect(byUid["c"]).toBe(20);       // never reached 3
  });

  it("rare-fish: no bonus when nobody reaches catchCount >= 3", () => {
    const catches = [makeCatch("a", 2), makeCatch("b", 1)];
    const results = calcScores(catches, "rare-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["a"]).toBe(20);
    expect(byUid["b"]).toBe(10);
    expect(results.every((r) => r.score < 100)).toBe(true);
  });

  it("all members appear in results even with 0 catches", () => {
    const catches = [makeCatch("a", 0), makeCatch("b", 2), makeCatch("c", 0)];
    const results = calcScores(catches, "small-fish");
    const uids = results.map((r) => r.uid).sort();
    expect(uids).toEqual(["a", "b", "c"]);
  });

  it("rank is shared for equal scores", () => {
    const catches = [makeCatch("a", 2), makeCatch("b", 2), makeCatch("c", 1)];
    const results = calcScores(catches, "small-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r]));
    expect(byUid["a"].rank).toBe(byUid["b"].rank);
    expect(byUid["c"].rank).toBeGreaterThan(byUid["a"].rank);
  });

  it("output is sorted by rank then uid regardless of input order", () => {
    const catchesABC = [makeCatch("c", 3), makeCatch("a", 1), makeCatch("b", 3)];
    const catchesBAC = [makeCatch("b", 3), makeCatch("a", 1), makeCatch("c", 3)];
    const resultsABC = calcScores(catchesABC, "small-fish");
    const resultsBAC = calcScores(catchesBAC, "small-fish");
    expect(resultsABC.map((r) => r.uid)).toEqual(resultsBAC.map((r) => r.uid));
  });

  it("null segment falls back to base score (catchCount × 10)", () => {
    const catches = [makeCatch("a", 3), makeCatch("b", 1)];
    const results = calcScores(catches, null);
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r.score]));
    expect(byUid["a"]).toBe(30);
    expect(byUid["b"]).toBe(10);
  });

  it("three-argument form enriches results with displayName", () => {
    const catches = [makeCatch("a", 2), makeCatch("b", 1)];
    const members = [
      { uid: "a", displayName: "Alice", role: "member" as const, joinedAt: null },
      { uid: "b", displayName: "Bob", role: "member" as const, joinedAt: null },
    ];
    const results = calcScores(catches, members, "small-fish");
    const byUid = Object.fromEntries(results.map((r) => [r.uid, r]));
    expect(byUid["a"].displayName).toBe("Alice");
    expect(byUid["b"].displayName).toBe("Bob");
  });
});

// ---------------------------------------------------------------------------
// buildCandidates
// ---------------------------------------------------------------------------

describe("buildCandidates", () => {
  const members = ["a", "b", "c", "d"];

  it("returns all members when none are excluded or ignored", () => {
    const candidates = buildCandidates(members, [], []);
    expect(candidates.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("ignoredUids are excluded from candidates", () => {
    const candidates = buildCandidates(members, ["b"], []);
    expect(candidates).not.toContain("b");
    expect(candidates.sort()).toEqual(["a", "c", "d"]);
  });

  it("excludedUids (host/past host) are excluded from candidates", () => {
    const candidates = buildCandidates(members, [], ["a"]);
    expect(candidates).not.toContain("a");
    expect(candidates.sort()).toEqual(["b", "c", "d"]);
  });

  it("member in both ignoredUids and excludedUids is excluded exactly once", () => {
    const candidates = buildCandidates(members, ["b"], ["b"]);
    expect(candidates.filter((c) => c === "b")).toHaveLength(0);
    expect(candidates.sort()).toEqual(["a", "c", "d"]);
  });

  it("returns empty array when no eligible candidates remain", () => {
    const candidates = buildCandidates(members, ["a", "b"], ["c", "d"]);
    expect(candidates).toEqual([]);
  });

  it("admin member can be excluded by ignoredUids", () => {
    const membersWithAdmin = ["admin-uid", "b", "c"];
    const candidates = buildCandidates(membersWithAdmin, ["admin-uid"], []);
    expect(candidates).not.toContain("admin-uid");
    expect(candidates.sort()).toEqual(["b", "c"]);
  });

  it("result is sorted by uid for deterministic output", () => {
    const unordered = ["d", "b", "a", "c"];
    const candidates = buildCandidates(unordered, [], []);
    expect(candidates).toEqual(["a", "b", "c", "d"]);
  });
});
