export type BoardRole = "owner" | "member";

export const BOARD_COLUMNS = [
  { id: "went-well", label: "Went Well" },
  { id: "to-improve", label: "To Improve" },
  { id: "ideas", label: "Ideas" },
] as const;

export type ColumnId = (typeof BOARD_COLUMNS)[number]["id"];

export const CARD_TEXT_MAX_LENGTH = 500;
export const BOARD_TITLE_MAX_LENGTH = 80;
export const FALLBACK_DISPLAY_NAME = "Unnamed";

/** Counted in UTF-16 units to match Firestore Rules `size()`; an emoji counts as 2. */
export const PLAYER_NAME_MAX_LENGTH = 20;

export function normalizePlayerName(rawName: string): string {
  return rawName.trim();
}

export function isValidPlayerName(name: string): boolean {
  return name.length >= 1 && name.length <= PLAYER_NAME_MAX_LENGTH && /\S/.test(name);
}

export type BoardStatus = "waiting" | "in-progress" | "completed";

export type Board = {
  id: string;
  title: string;
  ownerId: string;
  status: BoardStatus;
  /** Shared countdown (F22, D111): end time and the length it was started with, or null when no timer runs. */
  timerEndsAt: Date | null;
  timerDurationSec: number | null;
  /** Shared session step, 1 to 6 (F23, D117). */
  phase: number;
  /** Result of the next-host wheel (F29, D149): the winner's uid and when the wheel was spun, or null before any spin. */
  nextHostUid: string | null;
  nextHostSpunAt: Date | null;
};

export type BoardMember = {
  uid: string;
  role: BoardRole;
  displayName: string;
};

export type BoardCard = {
  id: string;
  columnId: ColumnId;
  text: string;
  authorId: string;
  hidden: boolean;
  /** Cards of one column that share a groupId form a stack (F21, D102). */
  groupId: string | null;
  createdAt: Date | null;
};

/** A board the admin can move a card into (listed with the admin-only board query). */
export type MoveTargetBoard = {
  id: string;
  title: string;
};

export type DashboardBoard = {
  boardId: string;
  title: string;
  role: BoardRole;
  joinedAt: Date | null;
};
