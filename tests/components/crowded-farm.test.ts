import { describe, expect, it } from "vitest";
import {
  autoAssignedField,
  candidateUidsOf,
  farmDeadlineMillis,
  fnv1a32,
  formatScore,
  isBetterScore,
  isPersistedWinnerConsistent,
  revealFarmGame,
  scoreHundredths,
  type FarmChoice,
  type FarmFieldId,
} from "../../lib/crowded-farm";

const GAME_ID = "game-1";

function players(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${String(index).padStart(3, "0")}`);
}

function everyoneChooses(uids: string[], field: FarmFieldId): FarmChoice[] {
  return uids.map((uid) => ({ uid, field }));
}

function tallyOf(reveal: ReturnType<typeof revealFarmGame>, field: FarmFieldId) {
  return reveal.tallies.find((tally) => tally.field.id === field)!;
}

describe("fnv1a32", () => {
  it("should match the published FNV-1a test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("should hash the UTF-8 bytes, not UTF-16 units", () => {
    expect(fnv1a32("é")).not.toBe(fnv1a32("e"));
    expect(fnv1a32("ไก่")).toBe(2967519234);
    expect(fnv1a32("game-1:alice") % 3).toBe(0);
  });
});

describe("autoAssignedField", () => {
  it("should be stable for the same game and player and use all three fields over many players", () => {
    expect(autoAssignedField(GAME_ID, "alice")).toBe(autoAssignedField(GAME_ID, "alice"));
    const used = new Set(players(60).map((uid) => autoAssignedField(GAME_ID, uid)));
    expect(used.size).toBe(3);
  });

  it("should change with the game id", () => {
    const first = players(30).map((uid) => autoAssignedField("game-a", uid)).join();
    const second = players(30).map((uid) => autoAssignedField("game-b", uid)).join();
    expect(first).not.toBe(second);
  });
});

describe("scores", () => {
  it("should compare by exact cross multiplication", () => {
    expect(isBetterScore(8, 1, 7, 1)).toBe(true);
    expect(isBetterScore(6, 3, 8, 4)).toBe(false);
    expect(isBetterScore(8, 4, 6, 3)).toBe(false);
    expect(isBetterScore(6, 6, 7, 7)).toBe(false);
    expect(isBetterScore(7, 7, 6, 6)).toBe(false);
    expect(isBetterScore(7, 6, 6, 7)).toBe(true);
  });

  it("should round to two decimals half up with integers", () => {
    expect(scoreHundredths(8, 1)).toBe(800);
    expect(scoreHundredths(6, 3)).toBe(200);
    expect(scoreHundredths(7, 3)).toBe(233);
    expect(scoreHundredths(8, 3)).toBe(267);
    expect(scoreHundredths(6, 8)).toBe(75);
    expect(scoreHundredths(7, 8)).toBe(88);
    expect(formatScore(233)).toBe("2.33");
    expect(formatScore(800)).toBe("8.00");
  });
});

describe("revealFarmGame", () => {
  it.each([1, 2, 3, 10, 11, 20, 50])("should pick one direct winner when %i players hold different spots and one stands alone", (count) => {
    const uids = players(count);
    const choices: FarmChoice[] = uids.map((uid, index) => ({
      uid,
      field: index === 0 ? "strawberry" : "carrot",
    }));
    const reveal = revealFarmGame(GAME_ID, uids, choices);
    expect(reveal.outcome).toEqual({ kind: "direct", winnerUid: uids[0] });
    expect(tallyOf(reveal, "strawberry").playerCount).toBe(1);
    expect(tallyOf(reveal, "carrot").playerCount).toBe(count - 1);
  });

  it.each([2, 3, 10, 11, 20, 50])("should tie everyone when all %i players choose the same field", (count) => {
    const uids = players(count);
    const reveal = revealFarmGame(GAME_ID, uids, everyoneChooses(uids, "corn"));
    expect(reveal.outcome).toEqual({ kind: "tie-wheel", candidateUids: uids });
    expect(tallyOf(reveal, "corn").scoreHundredths).toBe(scoreHundredths(7, count));
    expect(tallyOf(reveal, "corn").isBest).toBe(true);
  });

  it("should send a mixed round to the wheel with only the best field's players", () => {
    const uids = players(6);
    const choices: FarmChoice[] = [
      { uid: uids[0], field: "strawberry" },
      { uid: uids[1], field: "strawberry" },
      { uid: uids[2], field: "corn" },
      { uid: uids[3], field: "corn" },
      { uid: uids[4], field: "corn" },
      { uid: uids[5], field: "carrot" },
    ];
    const reveal = revealFarmGame(GAME_ID, uids, choices);
    expect(tallyOf(reveal, "carrot").isBest).toBe(true);
    expect(reveal.outcome).toEqual({ kind: "direct", winnerUid: uids[5] });
  });

  it("should tie two fields whose exact scores are equal and put both groups in the wheel", () => {
    const uids = players(7);
    const choices: FarmChoice[] = uids.map((uid, index) => ({ uid, field: index < 3 ? "carrot" : "strawberry" }));
    const reveal = revealFarmGame(GAME_ID, uids, choices);
    expect(tallyOf(reveal, "carrot").isBest).toBe(true);
    expect(tallyOf(reveal, "strawberry").isBest).toBe(true);
    expect(reveal.outcome).toEqual({ kind: "tie-wheel", candidateUids: uids });
  });

  it("should treat 6 players on carrot and 7 on corn as an exact tie where decimals would differ", () => {
    const uids = players(6 + 7 + 9);
    const choices: FarmChoice[] = uids.map((uid, index) => ({
      uid,
      field: index < 6 ? "carrot" : index < 13 ? "corn" : "strawberry",
    }));
    const reveal = revealFarmGame(GAME_ID, uids, choices);
    expect(tallyOf(reveal, "carrot").isBest).toBe(true);
    expect(tallyOf(reveal, "corn").isBest).toBe(true);
    expect(tallyOf(reveal, "strawberry").isBest).toBe(false);
    expect(candidateUidsOf(reveal.outcome)).toEqual(uids.slice(0, 13));
  });

  it("should give players who did not choose their assigned field and keep them in the count and the wheel", () => {
    const uids = players(5);
    const explicit: FarmChoice[] = [{ uid: uids[0], field: "strawberry" }];
    const reveal = revealFarmGame(GAME_ID, uids, explicit);
    expect(reveal.hasExplicitChoice).toBe(true);
    const total = reveal.tallies.reduce((sum, tally) => sum + tally.playerCount, 0);
    expect(total).toBe(5);
    const assignedStrawberry = uids.slice(1).filter((uid) => autoAssignedField(GAME_ID, uid) === "strawberry").length;
    expect(tallyOf(reveal, "strawberry").playerCount).toBe(1 + assignedStrawberry);
  });

  it("should use the wheel for every player and ignore automatic assignments when nobody chose", () => {
    const uids = players(4);
    const reveal = revealFarmGame(GAME_ID, uids, []);
    expect(reveal.hasExplicitChoice).toBe(false);
    expect(reveal.outcome).toEqual({ kind: "all-wheel", candidateUids: uids });
    expect(reveal.tallies.every((tally) => tally.playerCount === 0 && !tally.isBest)).toBe(true);
  });

  it("should ignore choices of users who are not players and invalid fields", () => {
    const uids = players(3);
    const reveal = revealFarmGame(GAME_ID, uids, [
      { uid: "stranger", field: "strawberry" },
      { uid: uids[0], field: "wheat" as FarmFieldId },
    ]);
    expect(reveal.hasExplicitChoice).toBe(false);
    expect(reveal.outcome.kind).toBe("all-wheel");
  });

  it("should give the same answer for any input order", () => {
    const uids = players(12);
    const choices: FarmChoice[] = uids.map((uid, index) => ({
      uid,
      field: (["carrot", "corn", "strawberry"] as const)[index % 3],
    }));
    const forward = revealFarmGame(GAME_ID, uids, choices);
    const backward = revealFarmGame(GAME_ID, [...uids].reverse(), [...choices].reverse());
    expect(backward).toEqual(forward);
  });

  it("should use the last explicit choice per player when a list repeats a uid", () => {
    const uids = players(2);
    const reveal = revealFarmGame(GAME_ID, uids, [
      { uid: uids[0], field: "carrot" },
      { uid: uids[0], field: "strawberry" },
      { uid: uids[1], field: "carrot" },
    ]);
    expect(tallyOf(reveal, "strawberry").playerCount).toBe(1);
  });
});

describe("persisted result check", () => {
  it("should accept the direct winner and any wheel candidate and reject anyone else", () => {
    expect(isPersistedWinnerConsistent({ kind: "direct", winnerUid: "a" }, "a")).toBe(true);
    expect(isPersistedWinnerConsistent({ kind: "direct", winnerUid: "a" }, "b")).toBe(false);
    expect(isPersistedWinnerConsistent({ kind: "tie-wheel", candidateUids: ["a", "b"] }, "b")).toBe(true);
    expect(isPersistedWinnerConsistent({ kind: "tie-wheel", candidateUids: ["a", "b"] }, "c")).toBe(false);
  });
});

describe("farmDeadlineMillis", () => {
  it("should be 15 seconds after the start", () => {
    expect(farmDeadlineMillis(new Date(1_000))).toBe(16_000);
  });
});
