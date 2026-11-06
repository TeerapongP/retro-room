"use client";

import { useEffect, useState } from "react";
import { DialogueBox } from "@/components/DialogueBox";
import { describeFirebaseError } from "@/lib/firebase/client";
import { listMoveTargetBoards, moveCard } from "@/lib/firebase/cards";
import type { BoardCard, MoveTargetBoard } from "@/lib/firebase/types";

type MoveCardDialogProps = {
  sourceBoardId: string;
  card: BoardCard;
  onClose: () => void;
  onMoved: (destinationTitle: string) => void;
};

/** Confirmation step for the admin-only move (D77). The move is one atomic batch checked by Rules. */
export function MoveCardDialog({ sourceBoardId, card, onClose, onMoved }: MoveCardDialogProps) {
  const [targets, setTargets] = useState<MoveTargetBoard[] | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    listMoveTargetBoards(sourceBoardId)
      .then((boards) => {
        if (!isCurrent) return;
        setTargets(boards);
        setDestinationId(boards[0]?.id ?? "");
      })
      .catch((loadError) => {
        if (isCurrent) setError(describeFirebaseError(loadError));
      });
    return () => {
      isCurrent = false;
    };
  }, [sourceBoardId]);

  async function handleMove() {
    const destination = targets?.find((board) => board.id === destinationId);
    if (!destination) return;
    setIsMoving(true);
    setError(null);
    try {
      await moveCard(sourceBoardId, card, destination.id);
      onMoved(destination.title);
    } catch (moveError) {
      setError(describeFirebaseError(moveError));
      setIsMoving(false);
    }
  }

  const hasTargets = targets !== null && targets.length > 0;

  return (
    <DialogueBox
      title="Move card?"
      actions={
        <>
          <button
            type="button"
            className="pixel-button"
            onClick={handleMove}
            disabled={!hasTargets || isMoving}
          >
            {isMoving ? "กำลังย้าย..." : "ย้ายการ์ด"}
          </button>
          <button type="button" className="pixel-button pixel-button-gold" onClick={onClose} disabled={isMoving}>
            ยกเลิก
          </button>
        </>
      }
    >
      <p className="pixel-note p-3 whitespace-pre-wrap break-words">{card.text}</p>
      {targets === null && !error ? <p role="status">กำลังโหลดรายการบอร์ด...</p> : null}
      {targets !== null && targets.length === 0 ? (
        <p>ไม่มีบอร์ดอื่นที่กำลังดำเนินการ (IN PROGRESS) ให้ย้ายไป</p>
      ) : null}
      {hasTargets ? (
        <>
          <label htmlFor={`move-target-${card.id}`} className="block text-sm font-medium">
            ย้ายไปที่บอร์ด
          </label>
          <select
            id={`move-target-${card.id}`}
            className="pixel-input"
            value={destinationId}
            onChange={(event) => setDestinationId(event.target.value)}
            disabled={isMoving}
          >
            {targets.map((board) => (
              <option key={board.id} value={board.id}>
                {board.title}
              </option>
            ))}
          </select>
          <p className="text-sm">
            การ์ดจะถูกลบออกจากบอร์ดนี้และไปต่อท้ายบอร์ดที่เลือก ข้อความ ผู้เขียน และสถานะซ่อนจะคงเดิม
          </p>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </DialogueBox>
  );
}
