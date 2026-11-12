"use client";

import { useState, type FormEvent } from "react";
import { CardMenu } from "@/components/CardMenu";
import { IconEyeOff, IconThumb } from "@/components/CardMenuIcons";
import { formatRelativeTime } from "@/lib/relative-time";
import { CARD_TEXT_MAX_LENGTH, type BoardCard, type ColumnId } from "@/lib/firebase/types";

type StickyNoteProps = {
  card: BoardCard;
  authorName: string;
  canEdit: boolean;
  canDelete: boolean;
  showAdminMenu: boolean;
  onToggleHidden: () => void;
  onMove: () => void;
  onMoveToColumn: (columnId: ColumnId) => void;
  isStacked: boolean;
  onStackWith: () => void;
  onUnstack: () => void;
  /** Admin drag and drop (F21, D104): called with the id of the card dropped onto this one. */
  onStackDrop: (draggedCardId: string) => void;
  vote: CardVoteInfo;
  onAdminDelete: () => void;
  /** True in step 1 for cards not written by the current user; content is blurred (D126 updated). */
  blurred: boolean;
  onEdit: (cardId: string, text: string) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<boolean>;
};

/** Voting state of one card (F26, D139). */
export type CardVoteInfo = {
  count: number;
  /** Counts are shown from step 3 on. */
  showCount: boolean;
  /** Voting is open (step 3, in progress). */
  isOpen: boolean;
  hasVoted: boolean;
  /** No votes left and this card is not one of the member's votes. */
  isDisabled: boolean;
  onToggle: () => void;
};

export function StickyNote({
  card,
  authorName,
  canEdit,
  canDelete,
  blurred,
  showAdminMenu,
  onToggleHidden,
  onMove,
  onMoveToColumn,
  isStacked,
  onStackWith,
  onUnstack,
  onStackDrop,
  vote,
  onAdminDelete,
  onEdit,
  onDelete,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Editing is locked outside step 1 (D143): a form that was open when the step moved closes and stays closed.
  if (isEditing && !canEdit) setIsEditing(false);
  const [draft, setDraft] = useState(card.text);
  const [isDropTarget, setIsDropTarget] = useState(false);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (await onEdit(card.id, text)) setIsEditing(false);
  }

  return (
    <li
      className={`board-card board-card-${card.columnId} ${card.hidden ? "board-card-hidden" : ""} ${blurred ? "board-card-blurred" : ""} ${showAdminMenu && !isEditing ? "board-card-draggable" : ""} ${isDropTarget ? "board-card-drop" : ""}`}
      draggable={showAdminMenu && !isEditing}
      onDragStart={(event) => {
        if (!showAdminMenu || isEditing) return;
        event.dataTransfer.setData("text/plain", card.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!showAdminMenu) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        if (!showAdminMenu) return;
        event.preventDefault();
        setIsDropTarget(false);
        const draggedId = event.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== card.id) onStackDrop(draggedId);
      }}
    >
      {showAdminMenu && !isEditing ? (
        <CardMenu
          cardId={card.id}
          hidden={card.hidden}
          columnId={card.columnId}
          onMoveToColumn={onMoveToColumn}
          isStacked={isStacked}
          onStackWith={onStackWith}
          onUnstack={onUnstack}
          onToggleHidden={onToggleHidden}
          onMove={onMove}
          onDelete={onAdminDelete}
        />
      ) : null}
      {isEditing ? (
        <form onSubmit={handleSave} className="board-card-form">
          <label htmlFor={`edit-${card.id}`} className="sr-only">
            แก้ไขโน้ต
          </label>
          <textarea
            id={`edit-${card.id}`}
            className="board-input"
            value={draft}
            maxLength={CARD_TEXT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="board-card-actions">
            <button type="submit" className="board-button" disabled={!draft.trim()}>
              บันทึก
            </button>
            <button
              type="button"
              className="board-button board-button-quiet"
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
          {card.hidden ? (
            <p className="board-card-hidden-label">
              <IconEyeOff />
              ซ่อนจากสมาชิกคนอื่น
            </p>
          ) : null}
          <p className={`board-card-text ${showAdminMenu ? "board-card-text-menu" : ""}`}>{card.text}</p>
          <p className="board-card-meta">
            <span className="board-card-author">{authorName}</span>
            {card.createdAt ? <span aria-hidden="true">·</span> : null}
            <time dateTime={card.createdAt?.toISOString()}>{formatRelativeTime(card.createdAt)}</time>
          </p>
          {canEdit || canDelete || vote.showCount ? (
            <div className="board-card-foot">
              {canEdit || canDelete ? (
                <div className="board-card-actions">
                  {canEdit ? (
                    <button type="button" className="board-button board-button-quiet" onClick={() => setIsEditing(true)}>
                      แก้ไข
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="board-button board-button-danger"
                      onClick={() => onDelete(card.id)}
                    >
                      ลบ
                    </button>
                  ) : null}
                </div>
              ) : null}
              {vote.showCount ? (
                vote.isOpen ? (
                  <button
                    type="button"
                    className={`board-vote ${vote.hasVoted ? "board-vote-on" : ""}`}
                    aria-pressed={vote.hasVoted}
                    aria-label={vote.hasVoted ? `เอาโหวตออก (ตอนนี้ ${vote.count} โหวต)` : `โหวตการ์ดนี้ (ตอนนี้ ${vote.count} โหวต)`}
                    disabled={vote.isDisabled}
                    onClick={vote.onToggle}
                  >
                    <IconThumb />
                    {vote.count}
                  </button>
                ) : (
                  <span className={`board-vote board-vote-static ${vote.hasVoted ? "board-vote-on" : ""}`} aria-label={`${vote.count} โหวต`}>
                    <IconThumb />
                    {vote.count}
                  </span>
                )
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
