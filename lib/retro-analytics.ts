import type { ActionItem, ActionItemStatus, BoardCard, ColumnId, SessionSnapshot } from "@/lib/firebase/types";
import type { Voter } from "@/lib/votes";
import { countVotes } from "@/lib/votes";

export const CATEGORY_LABELS: Readonly<Record<ColumnId, string>> = {
  "went-well": "สิ่งที่ทำได้ดี",
  "to-improve": "สิ่งที่อยากปรับปรุง",
  ideas: "ไอเดีย",
};

export const CATEGORY_COLORS: Readonly<Record<ColumnId, string>> = {
  "went-well": "#52784f",
  "to-improve": "#bf7951",
  ideas: "#66869a",
};

export const ACTION_ITEM_STATUSES = ["not-started", "in-progress", "completed"] as const;

export function isValidDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const ACTION_STATUS_LABELS: Readonly<Record<ActionItemStatus, string>> = {
  "not-started": "ยังไม่เริ่ม",
  "in-progress": "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
};

export type CategoryCount = { id: ColumnId; label: string; color: string; count: number };
export type TopLikedCard = { id: string; text: string; category: ColumnId; likes: number };
export type ActionStatusCount = { status: ActionItemStatus; label: string; count: number; color: string };
export type TrendPoint = { sessionId: string; completedAt: Date; categories: Record<ColumnId, number>; completionRate: number | null; dueActionCount: number };

export type RetroAnalytics = {
  categories: CategoryCount[];
  topLiked: TopLikedCard[];
  actionStatuses: ActionStatusCount[];
  actionItems: ActionItem[];
  trends: TrendPoint[] | null;
  currentCompletionRate: number | null;
  dueActionCount: number;
};

export function countCategories(cards: ReadonlyArray<BoardCard>): Record<ColumnId, number> {
  const counts: Record<ColumnId, number> = { "went-well": 0, "to-improve": 0, ideas: 0 };
  for (const card of cards) if (!card.hidden) counts[card.columnId] += 1;
  return counts;
}

export function rankTopLiked(cards: ReadonlyArray<BoardCard>, voters: ReadonlyArray<Voter>): TopLikedCard[] {
  const counts = countVotes(voters);
  return cards
    .filter((card) => !card.hidden)
    .map((card) => ({ id: card.id, text: card.text, category: card.columnId, likes: counts.get(card.id) ?? 0 }))
    .sort((a, b) => b.likes - a.likes || a.id.localeCompare(b.id))
    .slice(0, 3);
}

export function getDueCompletion(actions: ReadonlyArray<ActionItem>, cutoff: Date): { due: number; completed: number; rate: number | null } {
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const due = actions.filter((item) => isValidDueDate(item.dueDate) && item.createdAt !== null && item.createdAt <= cutoff && item.dueDate <= cutoffDate);
  const completed = due.filter((item) => item.status === "completed" && item.completedAt !== null && item.completedAt <= cutoff).length;
  return { due: due.length, completed, rate: due.length ? completed / due.length : null };
}

export function completionRate(snapshot: Pick<SessionSnapshot, "dueActionCount" | "completedDueActionCount">): number | null {
  if (snapshot.dueActionCount <= 0) return null;
  return snapshot.completedDueActionCount / snapshot.dueActionCount;
}

export function makeSessionSnapshot(cards: ReadonlyArray<BoardCard>, items: ReadonlyArray<ActionItem>, id: string, completedAt: Date): SessionSnapshot {
  const due = getDueCompletion(items, completedAt);
  return { id, completedAt, categoryCounts: countCategories(cards), dueActionCount: due.due, completedDueActionCount: due.completed };
}

export function calculateRetroAnalytics(
  cards: ReadonlyArray<BoardCard>,
  voters: ReadonlyArray<Voter>,
  actions: ReadonlyArray<ActionItem>,
  sessions: ReadonlyArray<SessionSnapshot>,
  cutoff: Date,
): RetroAnalytics {
  const categoryCounts = countCategories(cards);
  const due = getDueCompletion(actions, cutoff);
  const actionStatusColors: Readonly<Record<ActionItemStatus, string>> = {
    "not-started": "#bf7951",
    "in-progress": "#d3a94e",
    completed: "#52784f",
  };
  const trends = sessions.length >= 2
    ? [...sessions]
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        .map((session) => ({
          sessionId: session.id,
          completedAt: session.completedAt,
          categories: session.categoryCounts,
          completionRate: completionRate(session),
          dueActionCount: session.dueActionCount,
        }))
    : null;
  return {
    categories: (Object.keys(CATEGORY_LABELS) as ColumnId[]).map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      color: CATEGORY_COLORS[id],
      count: categoryCounts[id],
    })),
    topLiked: rankTopLiked(cards, voters),
    actionStatuses: ACTION_ITEM_STATUSES.map((status) => ({
      status,
      label: ACTION_STATUS_LABELS[status],
      count: actions.filter((item) => item.status === status).length,
      color: actionStatusColors[status],
    })),
    actionItems: [...actions],
    trends,
    currentCompletionRate: due.rate,
    dueActionCount: due.due,
  };
}
