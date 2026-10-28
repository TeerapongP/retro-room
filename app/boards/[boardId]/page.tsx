"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DialogueBox } from "@/components/DialogueBox";
import { AuthLoadingNotice, LoadingNotice } from "@/components/LoadingNotice";
import { TitleScreen } from "@/components/TitleScreen";
import { usePlayerName, useRequireSignedIn } from "@/lib/firebase/auth";
import {
  completeSession,
  getOwnMembership,
  joinBoard,
  startSession,
  subscribeToBoard,
  subscribeToMembers,
} from "@/lib/firebase/boards";
import { addCard, deleteCard, editCard, subscribeToCards } from "@/lib/firebase/cards";
import { describeFirebaseError } from "@/lib/firebase/client";
import {
  BOARD_COLUMNS,
  CARD_TEXT_MAX_LENGTH,
  FALLBACK_DISPLAY_NAME,
  type Board,
  type BoardCard,
  type BoardMember,
  type BoardRole,
  type ColumnId,
} from "@/lib/firebase/types";

type MembershipState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "member"; role: BoardRole };

export default function BoardPage() {
  return (
    <Suspense fallback={<LoadingNotice scene />}>
      <BoardPageContent />
    </Suspense>
  );
}

function BoardPageContent() {
  const { boardId } = useParams<{ boardId: string }>();
  const user = useRequireSignedIn();
  const playerName = usePlayerName();
  const uid = user?.uid;

  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [membership, setMembership] = useState<MembershipState>({ status: "loading" });
  const [boardError, setBoardError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return subscribeToBoard(
      boardId,
      (nextBoard) => {
        setBoardError(null);
        setBoard(nextBoard);
      },
      (error) => setBoardError(describeFirebaseError(error)),
    );
  }, [boardId, uid]);

  useEffect(() => {
    if (!uid) return;
    let isCurrent = true;
    getOwnMembership(boardId, uid)
      .then((ownMembership) => {
        if (!isCurrent) return;
        setMembership(
          ownMembership ? { status: "member", role: ownMembership.role } : { status: "none" },
        );
      })
      .catch((error) => {
        if (isCurrent) setBoardError(describeFirebaseError(error));
      });
    return () => {
      isCurrent = false;
    };
  }, [boardId, uid]);

  async function handleJoin() {
    if (!user || !playerName) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      await joinBoard(boardId, user, playerName);
      setMembership({ status: "member", role: "member" });
    } catch (error) {
      setJoinError(describeFirebaseError(error));
    } finally {
      setIsJoining(false);
    }
  }

  if (!user) return <AuthLoadingNotice />;

  let content: React.ReactNode;
  if (boardError) {
    content = (
      <DialogueBox title="Error" tone="error" actions={<BackToDashboard />}>
        <p>{boardError}</p>
      </DialogueBox>
    );
  } else if (board === undefined || membership.status === "loading") {
    content = <LoadingNotice />;
  } else if (board === null) {
    content = (
      <DialogueBox title="Board not found" actions={<BackToDashboard />}>
        <p>ไม่พบบอร์ดนี้ ลิงก์อาจไม่ถูกต้อง</p>
      </DialogueBox>
    );
  } else if (membership.status === "none") {
    content = (
      <DialogueBox
        title="Join this board?"
        actions={
          <>
            <button type="button" className="pixel-button" onClick={handleJoin} disabled={isJoining}>
              {isJoining ? "กำลังเข้าร่วม..." : "เข้าร่วมบอร์ด"}
            </button>
            <BackToDashboard />
          </>
        }
      >
        <p>
          คุณต้องการเข้าร่วมบอร์ด <strong>{board.title}</strong> ใช่หรือไม่
        </p>
        {joinError ? <p role="alert">{joinError}</p> : null}
      </DialogueBox>
    );
  } else {
    content = <LiveBoard board={board} role={membership.role} uid={user.uid} user={user} />;
  }

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{content}</main>
    </>
  );
}

function BackToDashboard() {
  return (
    <Link href="/dashboard" className="pixel-button pixel-button-gold">
      กลับหน้าหลัก
    </Link>
  );
}

type LiveBoardProps = {
  board: Board;
  role: BoardRole;
  uid: string;
  user: NonNullable<ReturnType<typeof useRequireSignedIn>>;
};

function LiveBoard({ board, role, uid, user }: LiveBoardProps) {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const [isConfirmingComplete, setIsConfirmingComplete] = useState(false);
  const isWaiting = board.status === "waiting";
  const isCompleted = board.status === "completed";

  useEffect(() => {
    return subscribeToMembers(board.id, setMembers, (error) =>
      setLiveError(describeFirebaseError(error)),
    );
  }, [board.id]);

  useEffect(() => {
    if (isWaiting) return;
    return subscribeToCards(
      board.id,
      (nextCards) => {
        setLiveError(null);
        setCards(nextCards);
      },
      (error) => setLiveError(describeFirebaseError(error)),
    );
  }, [board.id, isWaiting]);

  const authorNames = new Map(members.map((member) => [member.uid, member.displayName]));
  const isOwner = role === "owner";

  async function runAction(action: () => Promise<void>): Promise<boolean> {
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(describeFirebaseError(error));
      return false;
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  if (isWaiting) {
    return (
      <>
        {liveError ? (
          <DialogueBox title="Error" tone="error">
            <p>{liveError}</p>
          </DialogueBox>
        ) : null}
        {actionError ? (
          <p role="alert" className="pixel-panel p-3">
            {actionError}
          </p>
        ) : null}
        <TitleScreen
          board={board}
          isOwner={isOwner}
          members={members}
          onStart={() => runAction(() => startSession(board.id))}
        />
      </>
    );
  }

  return (
    <>
      <div className="pixel-sign flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="text-xl font-bold">{board.title}</h1>
          <p className="text-sm">
            {isOwner ? "Owner" : "Member"} · {members.length} คน ·{" "}
            {isCompleted ? "COMPLETED" : "IN PROGRESS"}
          </p>
        </div>
        <button type="button" className="pixel-button pixel-button-gold" onClick={handleCopyLink}>
          {copyState === "copied"
            ? "คัดลอกลิงก์แล้ว"
            : copyState === "failed"
              ? "คัดลอกไม่สำเร็จ"
              : "คัดลอกลิงก์แชร์"}
        </button>
        {isOwner && !isCompleted ? (
          <button
            type="button"
            className="pixel-button pixel-button-danger"
            onClick={() => setIsConfirmingComplete(true)}
          >
            จบเซสชัน
          </button>
        ) : null}
      </div>

      {isConfirmingComplete ? (
        <DialogueBox
          title="End session?"
          actions={
            <>
              <button
                type="button"
                className="pixel-button pixel-button-danger"
                onClick={async () => {
                  if (await runAction(() => completeSession(board.id))) {
                    setIsConfirmingComplete(false);
                  }
                }}
              >
                จบเซสชัน
              </button>
              <button
                type="button"
                className="pixel-button pixel-button-gold"
                onClick={() => setIsConfirmingComplete(false)}
              >
                ยกเลิก
              </button>
            </>
          }
        >
          <p>เมื่อจบแล้ว บอร์ดจะเป็นแบบอ่านอย่างเดียวและเริ่มใหม่ไม่ได้</p>
        </DialogueBox>
      ) : null}

      {isCompleted ? (
        <p role="status" className="pixel-panel p-3">
          เซสชันนี้จบแล้ว บอร์ดเป็นแบบอ่านอย่างเดียว
        </p>
      ) : null}

      {liveError ? (
        <DialogueBox title="Error" tone="error">
          <p>{liveError}</p>
        </DialogueBox>
      ) : null}
      {actionError ? (
        <p role="alert" className="pixel-panel p-3">
          {actionError}
        </p>
      ) : null}

      {cards === null && !liveError ? (
        <LoadingNotice />
      ) : (
        <div className="grid flex-1 gap-6 lg:grid-cols-3">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.id}
              columnId={column.id}
              label={column.label}
              cards={(cards ?? []).filter((card) => card.columnId === column.id)}
              authorNames={authorNames}
              uid={uid}
              isOwner={isOwner}
              readOnly={isCompleted}
              onAdd={(text) => runAction(() => addCard(board.id, user, column.id, text))}
              onEdit={(cardId, text) => runAction(() => editCard(board.id, cardId, text))}
              onDelete={(cardId) => runAction(() => deleteCard(board.id, cardId))}
            />
          ))}
        </div>
      )}
    </>
  );
}

type BoardColumnProps = {
  columnId: ColumnId;
  label: string;
  cards: BoardCard[];
  authorNames: Map<string, string>;
  uid: string;
  isOwner: boolean;
  readOnly: boolean;
  onAdd: (text: string) => Promise<boolean>;
  onEdit: (cardId: string, text: string) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<boolean>;
};

function BoardColumn({
  columnId,
  label,
  cards,
  authorNames,
  uid,
  isOwner,
  readOnly,
  onAdd,
  onEdit,
  onDelete,
}: BoardColumnProps) {
  const [draft, setDraft] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputId = `new-card-${columnId}`;

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setIsAdding(true);
    if (await onAdd(text)) setDraft("");
    setIsAdding(false);
  }

  return (
    <section aria-labelledby={`column-${columnId}`} className="pixel-panel flex flex-col gap-4 p-4">
      <h2 id={`column-${columnId}`} className="font-pixel pixel-sign px-3 py-2 text-xs">
        {label}
      </h2>
      {readOnly ? null : (
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          เพิ่มโน้ตใน {label}
        </label>
        <textarea
          id={inputId}
          className="pixel-input min-h-20"
          value={draft}
          maxLength={CARD_TEXT_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="เขียนความเห็น..."
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs">
            {draft.length}/{CARD_TEXT_MAX_LENGTH}
          </span>
          <button type="submit" className="pixel-button" disabled={isAdding || !draft.trim()}>
            เพิ่มโน้ต
          </button>
        </div>
      </form>
      )}
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <StickyNote
            key={card.id}
            card={card}
            authorName={authorNames.get(card.authorId) ?? FALLBACK_DISPLAY_NAME}
            canEdit={!readOnly && card.authorId === uid}
            canDelete={!readOnly && (card.authorId === uid || isOwner)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </section>
  );
}

type StickyNoteProps = {
  card: BoardCard;
  authorName: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (cardId: string, text: string) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<boolean>;
};

function StickyNote({ card, authorName, canEdit, canDelete, onEdit, onDelete }: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (await onEdit(card.id, text)) setIsEditing(false);
  }

  return (
    <li className="pixel-note p-3">
      {isEditing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <label htmlFor={`edit-${card.id}`} className="sr-only">
            แก้ไขโน้ต
          </label>
          <textarea
            id={`edit-${card.id}`}
            className="pixel-input min-h-20"
            value={draft}
            maxLength={CARD_TEXT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className="pixel-button" disabled={!draft.trim()}>
              บันทึก
            </button>
            <button
              type="button"
              className="pixel-button pixel-button-gold"
              onClick={() => {
                setDraft(card.text);
                setIsEditing(false);
              }}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">{card.text}</p>
          <p className="mt-2 text-xs font-medium">— {authorName}</p>
          {canEdit || canDelete ? (
            <div className="mt-2 flex gap-2">
              {canEdit ? (
                <button
                  type="button"
                  className="pixel-button pixel-button-gold"
                  onClick={() => setIsEditing(true)}
                >
                  แก้ไข
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="pixel-button pixel-button-danger"
                  onClick={() => onDelete(card.id)}
                >
                  ลบ
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
