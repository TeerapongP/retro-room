import { describe, expect, it } from "vitest";
import { applyModifier, earnedPP, generateChestBoard, resolveTreasureActions } from "../../lib/treasure-rush";
import { MYSTERY_POOL } from "../../lib/firebase/types";
import type { TreasurePowerAction, TreasurePlayerState } from "../../lib/firebase/types";

function makeState(overrides: Partial<TreasurePlayerState> = {}): TreasurePlayerState {
  return {
    uid: "user-a",
    openedCount: 0,
    currentRunPoints: 0,
    currentRunGem: 0,
    currentRunCoin: 0,
    currentRunCrown: 0,
    bankedPoints: 0,
    gemBanked: 0,
    coinBanked: 0,
    crownBanked: 0,
    bankCount: 0,
    trapHit: false,
    maxSingleReward: 0,
    score: 0,
    lastActionAt: null,
    updatedAt: null,
    tcSpentOnItems: 0,
    attacksSent: 0,
    attacksBlocked: 0,
    tcLostToAttacks: 0,
    frozenUntilMs: null,
    ...overrides,
  };
}

function makeAction(uid: string, type: TreasurePowerAction["type"]): TreasurePowerAction {
  return { uid, type, cost: 30, submittedAt: null, updatedAt: null };
}

// ---------------------------------------------------------------------------
// generateChestBoard
// ---------------------------------------------------------------------------

describe("generateChestBoard", () => {
  it("produces deterministic output for the same seed", () => {
    expect(generateChestBoard(42, 12)).toEqual(generateChestBoard(42, 12));
  });

  it("produces different output for different seeds", () => {
    expect(generateChestBoard(1, 12)).not.toEqual(generateChestBoard(2, 12));
  });

  it("returns the requested count", () => {
    expect(generateChestBoard(1, 8)).toHaveLength(8);
    expect(generateChestBoard(1, 12)).toHaveLength(12);
  });

  it("all types are valid ChestType values", () => {
    const valid = new Set(["coins", "gem", "crown", "trap", "mystery"]);
    for (const chest of generateChestBoard(100, 50)) {
      expect(valid.has(chest.type)).toBe(true);
    }
  });

  it("mystery chests have basePoints from MYSTERY_POOL", () => {
    const pool = new Set(MYSTERY_POOL);
    for (const chest of generateChestBoard(100, 100)) {
      if (chest.type === "mystery") {
        expect(pool.has(chest.basePoints)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// applyModifier
// ---------------------------------------------------------------------------

describe("applyModifier", () => {
  it("null modifier returns bankedPoints unchanged", () => {
    expect(applyModifier(makeState({ bankedPoints: 200 }), null)).toBe(200);
  });

  it("gem-fever adds gemBanked to bankedPoints", () => {
    expect(applyModifier(makeState({ bankedPoints: 200, gemBanked: 100 }), "gem-fever")).toBe(300);
  });

  it("coin-rain adds coinBanked to bankedPoints", () => {
    expect(applyModifier(makeState({ bankedPoints: 150, coinBanked: 60 }), "coin-rain")).toBe(210);
  });

  it("safe-expedition adds a fixed 50 bonus", () => {
    expect(applyModifier(makeState({ bankedPoints: 100 }), "safe-expedition")).toBe(150);
  });

  it("royal-treasure adds crownBanked to bankedPoints", () => {
    expect(applyModifier(makeState({ bankedPoints: 200, crownBanked: 150 }), "royal-treasure")).toBe(350);
  });

  it("lucky-explorer adds bankCount × 20 to bankedPoints", () => {
    expect(applyModifier(makeState({ bankedPoints: 100, bankCount: 3 }), "lucky-explorer")).toBe(160);
  });

  it("double-treasure doubles bankedPoints", () => {
    expect(applyModifier(makeState({ bankedPoints: 150 }), "double-treasure")).toBe(300);
  });

  it("never returns a negative value", () => {
    expect(applyModifier(makeState({ bankedPoints: -100 }), null)).toBe(0);
    expect(applyModifier(makeState({ bankedPoints: -100 }), "double-treasure")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// earnedPP
// ---------------------------------------------------------------------------

describe("earnedPP", () => {
  it("0 bankedPoints earns 0 PP", () => {
    expect(earnedPP(0)).toBe(0);
  });

  it("99 bankedPoints earns 0 PP (below threshold)", () => {
    expect(earnedPP(99)).toBe(0);
  });

  it("100 bankedPoints earns 10 PP", () => {
    expect(earnedPP(100)).toBe(10);
  });

  it("250 bankedPoints earns 20 PP", () => {
    expect(earnedPP(250)).toBe(20);
  });

  it("never returns negative", () => {
    expect(earnedPP(-50)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveTreasureActions
// ---------------------------------------------------------------------------

describe("resolveTreasureActions", () => {
  it("empty members returns empty finalCandidateUids and noEligibleCandidates true", () => {
    const result = resolveTreasureActions({
      actions: [],
      allMemberUids: [],
      ignoredUids: [],
      hostExcludedUids: [],
    });
    expect(result.finalCandidateUids).toEqual([]);
    expect(result.noEligibleCandidates).toBe(true);
  });

  it("standard case includes all members sorted by uid", () => {
    const result = resolveTreasureActions({
      actions: [],
      allMemberUids: ["c", "a", "b"],
      ignoredUids: [],
      hostExcludedUids: [],
    });
    expect(result.finalCandidateUids).toEqual(["a", "b", "c"]);
    expect(result.noEligibleCandidates).toBe(false);
  });

  it("filters out ignoredUids", () => {
    const result = resolveTreasureActions({
      actions: [],
      allMemberUids: ["a", "b", "c"],
      ignoredUids: ["b"],
      hostExcludedUids: [],
    });
    expect(result.finalCandidateUids).toEqual(["a", "c"]);
  });

  it("filters out hostExcludedUids", () => {
    const result = resolveTreasureActions({
      actions: [],
      allMemberUids: ["a", "b", "c"],
      ignoredUids: [],
      hostExcludedUids: ["a"],
    });
    expect(result.finalCandidateUids).toEqual(["b", "c"]);
  });

  it("counts each lucky-reroll purchase in reSpinGrantCount", () => {
    const result = resolveTreasureActions({
      actions: [makeAction("a", "lucky-reroll"), makeAction("b", "lucky-reroll")],
      allMemberUids: ["a", "b"],
      ignoredUids: [],
      hostExcludedUids: [],
    });
    expect(result.reSpinGrantCount).toBe(2);
  });

  it("non-lucky-reroll actions do not increment reSpinGrantCount", () => {
    const result = resolveTreasureActions({
      actions: [makeAction("a", "trap-shield"), makeAction("b", "royal-bonus")],
      allMemberUids: ["a", "b"],
      ignoredUids: [],
      hostExcludedUids: [],
    });
    expect(result.reSpinGrantCount).toBe(0);
  });

  it("resolvedAt is always null", () => {
    const result = resolveTreasureActions({
      actions: [],
      allMemberUids: ["a"],
      ignoredUids: [],
      hostExcludedUids: [],
    });
    expect(result.resolvedAt).toBeNull();
  });
});
