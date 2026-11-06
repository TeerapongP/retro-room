import { describe, expect, it } from "vitest";
import { groupCards } from "../../lib/card-groups";
import type { BoardCard } from "../../lib/firebase/types";

let counter = 0;
function card(overrides: Partial<BoardCard> & { id: string }): BoardCard {
  counter += 1;
  return {
    columnId: "ideas",
    text: `text ${overrides.id}`,
    authorId: "alice",
    hidden: false,
    groupId: null,
    createdAt: new Date(2026, 10, 6, 10, counter),
    ...overrides,
  };
}

describe("groupCards", () => {
  it("should keep cards without a group as single items in order", () => {
    const items = groupCards([card({ id: "a" }), card({ id: "b" })]);

    expect(items.map((item) => item.cards.map((c) => c.id))).toEqual([["a"], ["b"]]);
    expect(items.every((item) => !item.isStack)).toBe(true);
  });

  it("should gather cards that share a group into one stack at the place of the first card", () => {
    const items = groupCards([
      card({ id: "a", groupId: "g1" }),
      card({ id: "b" }),
      card({ id: "c", groupId: "g1" }),
    ]);

    expect(items.map((item) => item.cards.map((c) => c.id))).toEqual([["a", "c"], ["b"]]);
    expect(items[0]).toMatchObject({ isStack: true, key: "g1" });
    expect(items[1].isStack).toBe(false);
  });

  it("should show a group with only one card as a normal card", () => {
    const items = groupCards([card({ id: "a", groupId: "alone" })]);

    expect(items).toHaveLength(1);
    expect(items[0].isStack).toBe(false);
  });

  it("should keep two groups with different ids apart", () => {
    const items = groupCards([
      card({ id: "a", groupId: "g1" }),
      card({ id: "b", groupId: "g2" }),
      card({ id: "c", groupId: "g1" }),
      card({ id: "d", groupId: "g2" }),
    ]);

    expect(items.map((item) => item.cards.map((c) => c.id))).toEqual([["a", "c"], ["b", "d"]]);
  });

  it("should return no items for no cards", () => {
    expect(groupCards([])).toEqual([]);
  });
});
