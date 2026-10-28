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
  createdAt: Date | null;
};

export type DashboardBoard = {
  boardId: string;
  title: string;
  role: BoardRole;
  joinedAt: Date | null;
};
