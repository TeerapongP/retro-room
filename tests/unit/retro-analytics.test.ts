import { describe, expect, it } from "vitest";
import type { ActionItem, BoardCard, SessionSnapshot } from "@/lib/firebase/types";
import type { Voter } from "@/lib/votes";
import { calculateRetroAnalytics, countCategories, getDueCompletion, isValidDueDate, makeSessionSnapshot, rankTopLiked } from "@/lib/retro-analytics";
import { buildExcelXml } from "@/lib/retro-report";

const cards: BoardCard[] = [
  { id: "a", columnId: "went-well", text: "ทีมช่วยกัน", authorId: "secret-a", hidden: false, groupId: null, createdAt: null },
  { id: "b", columnId: "to-improve", text: "ลดงานซ้ำ", authorId: "secret-b", hidden: false, groupId: null, createdAt: null },
  { id: "c", columnId: "ideas", text: "ทำคู่มือ", authorId: "secret-c", hidden: false, groupId: null, createdAt: null },
  { id: "private", columnId: "ideas", text: "private", authorId: "secret-d", hidden: true, groupId: null, createdAt: null },
];
const actions: ActionItem[] = [
  { id: "a1", text: "คู่มือ", status: "completed", dueDate: "2026-11-10", createdAt: new Date("2026-11-01T00:00:00Z"), completedAt: new Date("2026-11-09T00:00:00Z") },
  { id: "a2", text: "อัปเดต flow", status: "in-progress", dueDate: "2026-11-12", createdAt: new Date("2026-11-01T00:00:00Z"), completedAt: null },
  { id: "a3", text: "งานใหม่", status: "not-started", dueDate: "2026-11-30", createdAt: new Date("2026-11-14T00:00:00Z"), completedAt: null },
];
const voters: Voter[] = [
  { uid: "one", cardIds: ["a", "a", "c"] },
  { uid: "two", cardIds: ["a", "b"] },
  { uid: "three", cardIds: ["b"] },
];
const snapshots: SessionSnapshot[] = [
  { id: "s1", completedAt: new Date("2026-11-10T00:00:00Z"), categoryCounts: { "went-well": 3, "to-improve": 1, ideas: 2 }, dueActionCount: 2, completedDueActionCount: 1 },
  { id: "s2", completedAt: new Date("2026-11-15T00:00:00Z"), categoryCounts: { "went-well": 2, "to-improve": 3, ideas: 2 }, dueActionCount: 3, completedDueActionCount: 2 },
];

describe("retrospective analytics", () => {
  it("counts current non-hidden cards by category", () => {
    expect(countCategories(cards)).toEqual({ "went-well": 1, "to-improve": 1, ideas: 1 });
  });

  it("ranks top cards globally across categories using like totals, not unique people", () => {
    expect(rankTopLiked(cards, voters).map(({ id, likes }) => [id, likes])).toEqual([["a", 2], ["b", 2], ["c", 1]]);
  });

  it("includes zero-like cards to fill three places and orders ties consistently", () => {
    expect(rankTopLiked(cards.slice(0, 3), []).map((card) => card.id)).toEqual(["a", "b", "c"]);
  });

  it("totals all action item statuses without omitting open work", () => {
    const analytics = calculateRetroAnalytics(cards, voters, actions, [], new Date("2026-11-15T00:00:00Z"));
    expect(analytics.actionStatuses.map(({ status, count }) => [status, count])).toEqual([["not-started", 1], ["in-progress", 1], ["completed", 1]]);
    expect(analytics.topLiked.map(({ id }) => id)).toEqual(rankTopLiked(cards, voters).map(({ id }) => id));
  });

  it("shows no historical trends before two genuine session snapshots", () => {
    expect(calculateRetroAnalytics(cards, [], [], [snapshots[0]], new Date()).trends).toBeNull();
    expect(calculateRetroAnalytics([], [], [], [], new Date()).trends).toBeNull();
  });

  it("sorts historical sessions and calculates each completion rate from stored cutoff counts", () => {
    const trend = calculateRetroAnalytics(cards, [], [], [...snapshots].reverse(), new Date()).trends;
    expect(trend?.map((item) => [item.sessionId, item.completionRate])).toEqual([["s1", 0.5], ["s2", 2 / 3]]);
  });

  it("uses due items as denominator and completion by the same cutoff as numerator", () => {
    expect(getDueCompletion(actions, new Date("2026-11-12T12:00:00Z"))).toEqual({ due: 2, completed: 1, rate: 0.5 });
    expect(getDueCompletion(actions, new Date("2026-11-01T00:00:00Z"))).toEqual({ due: 0, completed: 0, rate: null });
    expect(makeSessionSnapshot(cards, actions, "s", new Date("2026-11-12T12:00:00Z"))).toMatchObject({ dueActionCount: 2, completedDueActionCount: 1 });
  });

  it("requires valid due dates and a known creation time for completion denominators", () => {
    expect(isValidDueDate("2026-02-28")).toBe(true);
    expect(isValidDueDate("2026-02-31")).toBe(false);
    expect(isValidDueDate("2026-13-01")).toBe(false);
    expect(getDueCompletion([
      { ...actions[0], createdAt: null },
      { ...actions[0], id: "bad-date", dueDate: "2026-02-31" },
    ], new Date("2026-11-15T00:00:00Z"))).toMatchObject({ due: 0, completed: 0, rate: null });
  });

  it("exports the same Thai labels, top three, totals, and history as the UI model", () => {
    const analytics = calculateRetroAnalytics(cards, voters, actions, snapshots, new Date("2026-11-15T00:00:00Z"));
    const workbook = buildExcelXml(analytics);
    expect(workbook).toContain("<Worksheet ss:Name=\"จำนวนการ์ด\">");
    expect(workbook).toContain("<Worksheet ss:Name=\"สามการ์ดไลก์สูงสุด\">");
    expect(workbook).toContain("<Worksheet ss:Name=\"รายการที่ต้องทำ\">");
    expect(workbook).toContain("ทีมช่วยกัน");
    expect(workbook).toContain("สิ่งที่ทำได้ดี");
    expect(workbook).toContain("2026-11-10T00:00:00.000Z");
    expect(workbook).not.toContain("secret-a");
    expect(workbook).not.toContain("private");
  });
});
