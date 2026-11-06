"use client";

import { useState } from "react";
import { DialogueBox } from "@/components/DialogueBox";
import { BOARD_COLUMNS, type BoardCard } from "@/lib/firebase/types";

type StackCardDialogProps = {
  card: BoardCard;
  candidates: BoardCard[];
  onClose: () => void;
  onConfirm: (target: BoardCard) => void;
};

/** Menu fallback for stacking on touch and keyboard (F21, D105): pick the card to stack onto. */
export function StackCardDialog({ card, candidates, onClose, onConfirm }: StackCardDialogProps) {
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? "");
  const target = candidates.find((candidate) => candidate.id === targetId);
  const columnLabel = (columnId: string) => BOARD_COLUMNS.find((column) => column.id === columnId)?.label ?? columnId;

  return (
    <DialogueBox
      title="Stack card?"
      actions={
        <>
          <button type="button" className="pixel-button" disabled={!target} onClick={() => target && onConfirm(target)}>
            ซ้อนการ์ด
          </button>
          <button type="button" className="pixel-button pixel-button-gold" onClick={onClose}>
            ยกเลิก
          </button>
        </>
      }
    >
      <p className="board-card-preview">{card.text}</p>
      {candidates.length === 0 ? (
        <p>ไม่มีการ์ดอื่นในบอร์ดนี้ให้ซ้อน</p>
      ) : (
        <>
          <label htmlFor={`stack-target-${card.id}`} className="block text-sm font-medium">
            ซ้อนกับการ์ด
          </label>
          <select
            id={`stack-target-${card.id}`}
            className="pixel-input"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {columnLabel(candidate.columnId)} · {candidate.text.slice(0, 60)}
              </option>
            ))}
          </select>
          <p className="text-sm">การ์ดจะย้ายไปอยู่คอลัมน์เดียวกับการ์ดที่เลือกและซ้อนเป็นกองเดียวกัน</p>
        </>
      )}
    </DialogueBox>
  );
}
