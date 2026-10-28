"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DialogueBox } from "@/components/DialogueBox";
import { AuthLoadingNotice, LoadingNotice } from "@/components/LoadingNotice";
import { usePlayerName, useRequireSignedIn } from "@/lib/firebase/auth";
import { createBoard, subscribeToMemberships } from "@/lib/firebase/boards";
import { describeFirebaseError } from "@/lib/firebase/client";
import { BOARD_TITLE_MAX_LENGTH, type DashboardBoard } from "@/lib/firebase/types";

export default function DashboardPage() {
  const router = useRouter();
  const user = useRequireSignedIn();
  const playerName = usePlayerName();
  const uid = user?.uid;
  const [boards, setBoards] = useState<DashboardBoard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeToMemberships(
      uid,
      (nextBoards) => {
        setLoadError(null);
        setBoards(nextBoards);
      },
      (error) => setLoadError(describeFirebaseError(error)),
    );
  }, [uid]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!user || !playerName || !trimmedTitle) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const boardId = await createBoard(user, trimmedTitle, playerName);
      router.push(`/boards/${boardId}`);
    } catch (error) {
      setCreateError(describeFirebaseError(error));
      setIsCreating(false);
    }
  }

  if (!user) return <AuthLoadingNotice />;

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 sm:p-6">
        <DialogueBox title="Start a New Day">
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="board-title">
              ชื่อบอร์ด
            </label>
            <input
              id="board-title"
              className="pixel-input"
              value={title}
              maxLength={BOARD_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="ชื่อบอร์ด เช่น Sprint 12"
            />
            <button
              type="submit"
              className="pixel-button shrink-0"
              disabled={isCreating || !title.trim()}
            >
              {isCreating ? "กำลังสร้าง..." : "สร้างบอร์ด"}
            </button>
          </form>
          {createError ? <p role="alert">{createError}</p> : null}
        </DialogueBox>

        <section aria-labelledby="my-boards">
          <h2 id="my-boards" className="font-pixel pixel-sign mb-4 inline-block px-3 py-2 text-xs">
            My Boards
          </h2>
          {loadError ? (
            <DialogueBox title="Error" tone="error">
              <p>{loadError}</p>
            </DialogueBox>
          ) : boards === null ? (
            <LoadingNotice />
          ) : boards.length === 0 ? (
            <p className="pixel-panel p-4">ยังไม่มีบอร์ด สร้างบอร์ดใหม่หรือเปิดลิงก์ที่เพื่อนแชร์มา</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {boards.map((board) => (
                <li key={board.boardId}>
                  <Link href={`/boards/${board.boardId}`} className="pixel-panel block p-4">
                    <span className="block text-lg font-bold">{board.title}</span>
                    <span className="mt-1 block text-sm">
                      {board.role === "owner" ? "Owner" : "Member"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
