import { describe, expect, it } from "vitest";
import { PHASES, clampPhase, nextPhase, phaseState } from "../../lib/phases";

describe("PHASES", () => {
  it("should list the six steps in order", () => {
    expect(PHASES.map((phase) => phase.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(PHASES.map((phase) => phase.label)).toEqual([
      "เขียน",
      "ทบทวน",
      "โหวต",
      "ให้คะแนนตัวเอง",
      "โฮสต์คนถัดไป",
      "สรุป",
    ]);
  });

  it("should mark only steps 1 to 3 as built", () => {
    expect(PHASES.filter((phase) => phase.isBuilt).map((phase) => phase.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("clampPhase", () => {
  it("should default to step 1 when the value is missing or not a whole number", () => {
    expect(clampPhase(undefined)).toBe(1);
    expect(clampPhase(null)).toBe(1);
    expect(clampPhase("3")).toBe(1);
    expect(clampPhase(2.5)).toBe(1);
  });

  it("should keep a valid step and pull others into the range 1 to 6", () => {
    expect(clampPhase(4)).toBe(4);
    expect(clampPhase(0)).toBe(1);
    expect(clampPhase(9)).toBe(6);
  });
});

describe("phaseState", () => {
  it("should mark earlier steps done, the current step current and later steps upcoming", () => {
    expect(phaseState(1, 3)).toBe("done");
    expect(phaseState(3, 3)).toBe("current");
    expect(phaseState(5, 3)).toBe("upcoming");
  });
});

describe("nextPhase", () => {
  it("should return the following step and null after the last one", () => {
    expect(nextPhase(1)).toBe(2);
    expect(nextPhase(5)).toBe(6);
    expect(nextPhase(6)).toBeNull();
  });
});
