const LAST_BOARD_KEY = "retro-room:last-board";

/** The board last opened on this device, used by the launcher (F20, D95). Storage can be blocked, so every access is guarded. */
export function readLastBoard(): string | null {
  try {
    return localStorage.getItem(LAST_BOARD_KEY);
  } catch {
    return null;
  }
}

export function rememberLastBoard(boardId: string): void {
  try {
    localStorage.setItem(LAST_BOARD_KEY, boardId);
  } catch {
    // The launcher then falls back to the most recently joined board.
  }
}
