/** Which board the launcher opens (F20, D95). `boards` is newest joined first; `lastBoardId` is the board opened last on this device. */
export function pickBoardToOpen(boards: ReadonlyArray<{ boardId: string }>, lastBoardId: string | null): string | null {
  if (lastBoardId && boards.some((board) => board.boardId === lastBoardId)) return lastBoardId;
  return boards[0]?.boardId ?? null;
}
