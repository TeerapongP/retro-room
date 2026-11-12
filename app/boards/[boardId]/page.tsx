"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BoardColumn } from "@/components/BoardColumn";
import { BoardTimer } from "@/components/BoardTimer";
import { CenterAlert } from "@/components/CenterAlert";
import { AccountChip } from "@/components/AccountChip";
import { DashboardSprout } from "@/components/DashboardSprout";
import { DialogueBox } from "@/components/DialogueBox";
import { AuthLoadingNotice, LoadingNotice } from "@/components/LoadingNotice";
import { ModalDialog } from "@/components/ModalDialog";
import { MoveCardDialog } from "@/components/MoveCardDialog";
import { CrowdedFarm } from "@/components/CrowdedFarm";
import { RatingPanel } from "@/components/RatingPanel";
import { PhaseStepper } from "@/components/PhaseStepper";
import { StackCardDialog } from "@/components/StackCardDialog";
import { TitleScreen } from "@/components/TitleScreen";
import { isAdminUser } from "@/lib/firebase/admin";
import { saveMyRating, subscribeToRatings } from "@/lib/firebase/ratings";
import { saveMyVotes, subscribeToVotes } from "@/lib/firebase/votes";
import type { Rating } from "@/lib/ratings";
import { VOTES_PER_MEMBER, countVotes, toggleVote, votesLeft, type Voter } from "@/lib/votes";
import { rememberLastBoard } from "@/lib/last-board";
import { usePlayerName, useRequireSignedIn } from "@/lib/firebase/auth";
import {
  completeSession,
  resetBoard,
  getOwnMembership,
  joinBoard,
  setPhase,
  startSession,
  startTimer,
  stopTimer,
  subscribeToBoard,
  subscribeToMembers,
} from "@/lib/firebase/boards";
import {
  addCard,
  deleteCard,
  editCard,
  setCardColumn,
  setCardHidden,
  stackCards,
  subscribeToCards,
  unstackCard,
} from "@/lib/firebase/cards";
import { describeFirebaseError } from "@/lib/firebase/client";
import {
  BOARD_COLUMNS,
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

  useEffect(() => {
    if (membership.status === "member") rememberLastBoard(boardId);
  }, [boardId, membership.status]);

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
    <div className="dashboard-scene board-scene">
      <div aria-hidden="true" className="dashboard-backdrop">
        <div className="dashboard-backdrop-art" />
      </div>
      <AccountChip />
      <main className="board-content">{content}</main>
    </div>
  );
}

function BackToDashboard() {
  return (
    <Link href="/boards" className="pixel-button pixel-button-gold">
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
  const [notice, setNotice] = useState<string | null>(null);
  const [movingCard, setMovingCard] = useState<BoardCard | null>(null);
  const [deletingCard, setDeletingCard] = useState<BoardCard | null>(null);
  const [stackingCard, setStackingCard] = useState<BoardCard | null>(null);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const [isConfirmingComplete, setIsConfirmingComplete] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const isWaiting = board.status === "waiting";
  const isCompleted = board.status === "completed";
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    return subscribeToMembers(board.id, setMembers, (error) =>
      setLiveError(describeFirebaseError(error)),
    );
  }, [board.id]);

  useEffect(() => {
    if (isWaiting) return;
    return subscribeToCards(
      board.id,
      { uid, isAdmin, seesOthers: board.phase >= 2 || board.status === "completed" },
      (nextCards) => {
        setLiveError(null);
        setCards(nextCards);
      },
      (error) => setLiveError(describeFirebaseError(error)),
    );
  }, [board.id, board.phase, board.status, isWaiting, uid, isAdmin]);

  const showVotes = board.phase >= 3 || isCompleted;
  useEffect(() => {
    if (!showVotes) return;
    return subscribeToVotes(board.id, setVoters, (error) => setLiveError(describeFirebaseError(error)));
  }, [board.id, showVotes]);

  const isRatingStep = board.phase === 4 && !isCompleted;
  useEffect(() => {
    if (!isRatingStep) return;
    return subscribeToRatings(board.id, setRatings, (error) => setLiveError(describeFirebaseError(error)));
  }, [board.id, isRatingStep]);

  const voteCounts = countVotes(voters);
  const myVotes = voters.find((voter) => voter.uid === uid)?.cardIds ?? [];
  const isVotingOpen = board.phase === 3 && !isCompleted;

  const authorNames = new Map(members.map((member) => [member.uid, member.displayName]));
  const isOwner = role === "owner";

  async function runAction(action: () => Promise<void>): Promise<boolean> {
    setActionError(null);
    setNotice(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(describeFirebaseError(error));
      return false;
    }
  }

  async function handleToggleHidden(card: BoardCard) {
    const nextHidden = !card.hidden;
    if (await runAction(() => setCardHidden(board.id, card.id, nextHidden))) {
      setNotice(nextHidden ? "ซ่อนการ์ดแล้ว สมาชิกคนอื่นจะไม่เห็นการ์ดนี้" : "แสดงการ์ดแล้ว");
    }
  }

  async function handleChangeColumn(card: BoardCard, columnId: ColumnId) {
    if (await runAction(() => setCardColumn(board.id, card.id, columnId))) {
      const label = BOARD_COLUMNS.find((column) => column.id === columnId)?.label ?? columnId;
      setNotice(`ย้ายการ์ดไปที่ ${label} แล้ว`);
    }
  }

  async function handleStack(dragged: BoardCard, target: BoardCard) {
    if (await runAction(() => stackCards(board.id, dragged, target))) setNotice("ซ้อนการ์ดแล้ว");
  }

  async function handleUnstack(card: BoardCard) {
    if (await runAction(() => unstackCard(board.id, card.id))) setNotice("แยกการ์ดออกจากกองแล้ว");
  }

  async function handleToggleVote(cardId: string) {
    const next = toggleVote(myVotes, cardId);
    if (next) await runAction(() => saveMyVotes(board.id, uid, next));
  }

  async function handleRate(score: number) {
    await runAction(() => saveMyRating(board.id, uid, score));
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
        {actionError ? <CenterAlert tone="error" message={actionError} onClose={() => setActionError(null)} /> : null}
        <TitleScreen
          board={board}
          isAdmin={isAdmin}
          members={members}
          onStart={() => runAction(() => startSession(board.id))}
        />
      </>
    );
  }

  return (
    <>
      <PhaseStepper
        phase={board.phase}
        isAdmin={isAdmin}
        isLocked={isCompleted}
        onChange={(phase) => void runAction(() => setPhase(board.id, phase))}
        boardInfo={
          <>
            <DashboardSprout />
            <div>
              <h1>{board.title}</h1>
              <p>
                {isOwner ? "Owner" : "Member"} · {members.length} คน · {isCompleted ? "COMPLETED" : "IN PROGRESS"}
              </p>
            </div>
          </>
        }
        actions={
          <>
            {isVotingOpen ? (
              <span className="vote-meter" role="status">
                โหวตเหลือ {votesLeft(myVotes)}/{VOTES_PER_MEMBER}
              </span>
            ) : null}
            {isCompleted || board.phase !== 1 ? null : (
              <BoardTimer
                board={board}
                isAdmin={isAdmin}
                onStart={(minutes) => void runAction(() => startTimer(board.id, minutes))}
                onStop={() => void runAction(() => stopTimer(board.id))}
              />
            )}
            <button type="button" className="board-button board-button-quiet" onClick={handleCopyLink}>
              {copyState === "copied"
                ? "คัดลอกลิงก์แล้ว"
                : copyState === "failed"
                  ? "คัดลอกไม่สำเร็จ"
                  : "คัดลอกลิงก์แชร์"}
            </button>
            {isAdmin && !isCompleted ? (
              <button type="button" className="board-button board-button-danger" onClick={() => setIsConfirmingComplete(true)}>
                จบเซสชัน
              </button>
            ) : null}
            {isAdmin && isCompleted ? (
              <button type="button" className="board-button" onClick={() => setIsConfirmingReset(true)}>
                เริ่มใหม่
              </button>
            ) : null}
          </>
        }
      />

      {isConfirmingComplete ? (
        <ModalDialog
          title="End session?"
          onClose={() => setIsConfirmingComplete(false)}
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
        </ModalDialog>
      ) : null}

      {isConfirmingReset ? (
        <ModalDialog
          title="เริ่มเซสชันใหม่?"
          onClose={() => setIsConfirmingReset(false)}
          actions={
            <>
              <button
                type="button"
                className="pixel-button"
                onClick={async () => {
                  if (await runAction(() => resetBoard(board.id))) {
                    setIsConfirmingReset(false);
                  }
                }}
              >
                เริ่มใหม่
              </button>
              <button
                type="button"
                className="pixel-button pixel-button-gold"
                onClick={() => setIsConfirmingReset(false)}
              >
                ยกเลิก
              </button>
            </>
          }
        >
          <p>บอร์ดจะกลับไปสถานะก่อนเริ่ม การ์ด โหวต และคะแนนทั้งหมดยังอยู่</p>
        </ModalDialog>
      ) : null}

      {isCompleted ? (
        <p role="status" className="board-notice">
          เซสชันนี้จบแล้ว บอร์ดเป็นแบบอ่านอย่างเดียว
        </p>
      ) : null}

      {liveError ? (
        <DialogueBox title="Error" tone="error">
          <p>{liveError}</p>
        </DialogueBox>
      ) : null}
      {actionError ? <CenterAlert tone="error" message={actionError} onClose={() => setActionError(null)} /> : null}
      {notice ? <CenterAlert tone="success" message={notice} onClose={() => setNotice(null)} /> : null}

      {movingCard ? (
        <MoveCardDialog
          sourceBoardId={board.id}
          card={movingCard}
          onClose={() => setMovingCard(null)}
          onMoved={(destinationTitle) => {
            setMovingCard(null);
            setNotice(`ย้ายการ์ดไปที่บอร์ด "${destinationTitle}" แล้ว`);
          }}
        />
      ) : null}

      {stackingCard ? (
        <StackCardDialog
          card={stackingCard}
          candidates={(cards ?? []).filter((candidate) => candidate.id !== stackingCard.id)}
          onClose={() => setStackingCard(null)}
          onConfirm={(target) => {
            const dragged = stackingCard;
            setStackingCard(null);
            void handleStack(dragged, target);
          }}
        />
      ) : null}

      {deletingCard ? (
        <ModalDialog
          title="Delete card?"
          onClose={() => setDeletingCard(null)}
          actions={
            <>
              <button
                type="button"
                className="pixel-button pixel-button-danger"
                onClick={async () => {
                  const card = deletingCard;
                  if (await runAction(() => deleteCard(board.id, card.id))) {
                    setDeletingCard(null);
                    setNotice("ลบการ์ดแล้ว");
                  }
                }}
              >
                ลบการ์ด
              </button>
              <button type="button" className="pixel-button pixel-button-gold" onClick={() => setDeletingCard(null)}>
                ยกเลิก
              </button>
            </>
          }
        >
          <p className="board-card-preview">{deletingCard.text}</p>
          <p>การ์ดนี้จะถูกลบถาวรและกู้คืนไม่ได้</p>
        </ModalDialog>
      ) : null}

      {board.phase === 5 && !isCompleted ? (
        <CrowdedFarm board={board} members={members} uid={uid} isAdmin={isAdmin} runAction={runAction} />
      ) : isRatingStep ? (
        <RatingPanel ratings={ratings} members={members} uid={uid} onRate={(score) => void handleRate(score)} />
      ) : cards === null && !liveError ? (
        <LoadingNotice />
      ) : (
        <div className="board-columns">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.id}
              columnId={column.id}
              label={column.label}
              cards={(cards ?? []).filter((card) => card.columnId === column.id)}
              authorNames={authorNames}
              uid={uid}
              isOwner={isOwner}
              isAdmin={isAdmin}
              readOnly={isCompleted}
              canAdd={!isCompleted && board.phase === 1}
              onToggleHidden={handleToggleHidden}
              voteInfoFor={(card) => ({
                count: voteCounts.get(card.id) ?? 0,
                showCount: showVotes,
                isOpen: isVotingOpen,
                hasVoted: myVotes.includes(card.id),
                isDisabled: votesLeft(myVotes) === 0 && !myVotes.includes(card.id),
                onToggle: () => void handleToggleVote(card.id),
              })}
              onChangeColumn={handleChangeColumn}
              onStackWith={(card) => {
                setNotice(null);
                setActionError(null);
                setStackingCard(card);
              }}
              onUnstack={handleUnstack}
              onStackDrop={(draggedCardId, target) => {
                const dragged = (cards ?? []).find((candidate) => candidate.id === draggedCardId);
                if (dragged) void handleStack(dragged, target);
              }}
              onAdminDelete={(card) => {
                setNotice(null);
                setActionError(null);
                setDeletingCard(card);
              }}
              onMove={(card) => {
                setNotice(null);
                setActionError(null);
                setMovingCard(card);
              }}
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
