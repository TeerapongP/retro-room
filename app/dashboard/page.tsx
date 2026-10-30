"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DashboardSprout } from "@/components/DashboardSprout";
import { DashboardHeader } from "@/components/DashboardHeader";
import { IconCalendar, IconDocument, IconPlus, SleepingCat } from "@/components/DashboardIcons";
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
    <div className="dashboard-scene">
      <div aria-hidden="true" className="dashboard-backdrop">
        <div className="dashboard-backdrop-art" />
      </div>
      <DashboardHeader />
      <main className="dashboard-content">
        <section className="dashboard-panel dashboard-create" aria-labelledby="create-board-heading">
          <h1 id="create-board-heading" className="font-pixel dashboard-create-title"><DashboardSprout /> Start a New Day</h1>
          <form onSubmit={handleCreate} className="dashboard-form">
            <label className="sr-only" htmlFor="board-title">ชื่อบอร์ด</label>
            <div className="dashboard-field">
              <IconDocument className="dashboard-field-icon" />
              <input
                id="board-title"
                className="input dashboard-input"
                value={title}
                maxLength={BOARD_TITLE_MAX_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="ชื่อบอร์ด เช่น Sprint 12"
              />
            </div>
            <button type="submit" className="btn dashboard-create-button" disabled={isCreating || !title.trim()}>
              {isCreating ? (
                "กำลังสร้าง..."
              ) : (
                <>
                  <IconPlus />
                  สร้างบอร์ด
                </>
              )}
            </button>
          </form>
          {createError ? <p role="alert">{createError}</p> : null}
        </section>

        <section id="retro" className="dashboard-retro" aria-labelledby="retro-heading" tabIndex={-1}>
          <h2 id="retro-heading" className="dashboard-retro-heading">
            <IconCalendar />
            Retro
          </h2>
          {loadError ? (
            <DialogueBox title="Error" tone="error"><p>{loadError}</p></DialogueBox>
          ) : boards === null ? (
            <LoadingNotice />
          ) : boards.length === 0 ? (
            <div className="dashboard-panel dashboard-empty">
              <div className="dashboard-sleeper" aria-hidden="true">
                <span className="dashboard-zzz font-pixel">Zzz</span>
                <SleepingCat />
              </div>
              <h3>ยังไม่มีบอร์ด</h3>
              <p>สร้างบอร์ดแรกของคุณเพื่อเริ่ม Retro กันเลย!</p>
            </div>
          ) : (
            <ul className="dashboard-board-list">
              {boards.map((board) => (
                <li key={board.boardId}>
                  <Link href={`/boards/${board.boardId}`} className="dashboard-panel dashboard-board">
                    <span className="block text-lg font-bold">{board.title}</span>
                    <span className="mt-1 block text-sm">{board.role === "owner" ? "Owner" : "Member"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
