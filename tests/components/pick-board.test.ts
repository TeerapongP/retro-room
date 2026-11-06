import { describe, expect, it } from "vitest";
import { pickBoardToOpen } from "../../lib/pick-board";

const boards = [
  { boardId: "newest" },
  { boardId: "middle" },
  { boardId: "oldest" },
];

describe("pickBoardToOpen", () => {
  it("should open the last opened board when the user is still a member of it", () => {
    expect(pickBoardToOpen(boards, "middle")).toBe("middle");
  });

  it("should open the most recently joined board when there is no remembered board", () => {
    expect(pickBoardToOpen(boards, null)).toBe("newest");
  });

  it("should open the most recently joined board when the remembered board is not in the list", () => {
    expect(pickBoardToOpen(boards, "deleted")).toBe("newest");
  });

  it("should return null when the user has no boards", () => {
    expect(pickBoardToOpen([], "anything")).toBeNull();
  });
});
