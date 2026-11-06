"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { usePlayerName, useRequireSignedIn } from "@/lib/firebase/auth";
import { createBoard, subscribeToMemberships } from "@/lib/firebase/boards";
import { describeFirebaseError } from "@/lib/firebase/client";
import { BOARD_TITLE_MAX_LENGTH, type DashboardBoard } from "@/lib/firebase/types";

/** Replaces the Dashboard (F20, D96): switch between the user's boards or start a new one. */
export function BoardSwitcher({ currentBoardId }: { currentBoardId: string }) {
  const router = useRouter();
  const user = useRequireSignedIn();
  const playerName = usePlayerName();
  const uid = user?.uid;
  const [boards, setBoards] = useState<DashboardBoard[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeToMemberships(uid, setBoards, (loadError) => setError(describeFirebaseError(loadError)));
  }, [uid]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!user || !playerName || !trimmedTitle) return;
    setIsCreating(true);
    setError(null);
    try {
      const boardId = await createBoard(user, trimmedTitle, playerName);
      setTitle("");
      setIsFormOpen(false);
      router.push(`/boards/${boardId}`);
    } catch (createError) {
      setError(describeFirebaseError(createError));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="board-switcher">
      <label htmlFor="board-switch" className="sr-only">
        เลือกบอร์ด
      </label>
      <select
        id="board-switch"
        className="board-select"
        value={boards.some((board) => board.boardId === currentBoardId) ? currentBoardId : ""}
        onChange={(event) => event.target.value && router.push(`/boards/${event.target.value}`)}
      >
        {boards.some((board) => board.boardId === currentBoardId) ? null : <option value="">บอร์ดอื่น...</option>}
        {boards.map((board) => (
          <option key={board.boardId} value={board.boardId}>
            {board.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="board-button"
        aria-expanded={isFormOpen}
        onClick={() => setIsFormOpen((open) => !open)}
      >
        + บอร์ดใหม่
      </button>
      {isFormOpen ? (
        <form onSubmit={handleCreate} className="board-new-form">
          <label className="sr-only" htmlFor="new-board-title">
            ชื่อบอร์ด
          </label>
          <input
            id="new-board-title"
            className="board-input board-new-input"
            value={title}
            maxLength={BOARD_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="ชื่อบอร์ด เช่น Sprint 12"
            autoFocus
          />
          <button type="submit" className="board-button" disabled={isCreating || !title.trim()}>
            {isCreating ? "กำลังสร้าง..." : "สร้างบอร์ด"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="board-notice">
          {error}
        </p>
      ) : null}
    </div>
  );
}
