"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DialogueBox } from "@/components/DialogueBox";
import { AuthLoadingNotice, LoadingNotice } from "@/components/LoadingNotice";
import { usePlayerName, useRequireSignedIn } from "@/lib/firebase/auth";
import { createBoard, subscribeToMemberships } from "@/lib/firebase/boards";
import { describeFirebaseError } from "@/lib/firebase/client";
import { readLastBoard } from "@/lib/last-board";
import { pickBoardToOpen } from "@/lib/pick-board";

const DEFAULT_BOARD_TITLE = "My Retro";

/** Invisible launcher (F20, D94, D95): opens the user's board, or creates the first one. There is no board list page. */
export default function OpenBoardPage() {
  const router = useRouter();
  const user = useRequireSignedIn();
  const playerName = usePlayerName();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !playerName) return;
    let isCancelled = false;
    let hasHandled = false;
    const stop = subscribeToMemberships(
      user.uid,
      (boards) => {
        if (isCancelled || hasHandled) return;
        hasHandled = true;
        const boardId = pickBoardToOpen(boards, readLastBoard());
        if (boardId) {
          router.replace(`/boards/${boardId}`);
          return;
        }
        createBoard(user, DEFAULT_BOARD_TITLE, playerName)
          .then((createdId) => {
            if (!isCancelled) router.replace(`/boards/${createdId}`);
          })
          .catch((createError) => {
            if (!isCancelled) setError(describeFirebaseError(createError));
          });
      },
      (loadError) => {
        if (!isCancelled) setError(describeFirebaseError(loadError));
      },
    );
    return () => {
      isCancelled = true;
      stop();
    };
  }, [user, playerName, router]);

  if (error) {
    return (
      <main className="flex flex-1 items-center p-4">
        <DialogueBox
          title="Error"
          tone="error"
          actions={
            <button type="button" className="pixel-button" onClick={() => window.location.reload()}>
              ลองใหม่
            </button>
          }
        >
          <p>{error}</p>
        </DialogueBox>
      </main>
    );
  }
  return user ? <LoadingNotice scene /> : <AuthLoadingNotice />;
}
