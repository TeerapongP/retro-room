"use client";

import { useState, type FormEvent } from "react";
import { CardMenu } from "@/components/CardMenu";
import { IconEyeOff } from "@/components/CardMenuIcons";
import { formatRelativeTime } from "@/lib/relative-time";
import { CARD_TEXT_MAX_LENGTH, type BoardCard } from "@/lib/firebase/types";

type StickyNoteProps = {
  card: BoardCard;
  authorName: string;
  canEdit: boolean;
  canDelete: boolean;
  showAdminMenu: boolean;
  onToggleHidden: () => void;
  onMove: () => void;
  onEdit: (cardId: string, text: string) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<boolean>;
};

export function StickyNote({
  card,
  authorName,
  canEdit,
  canDelete,
  showAdminMenu,
  onToggleHidden,
  onMove,
  onEdit,
  onDelete,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (await onEdit(card.id, text)) setIsEditing(false);
  }

  return (
    <li className={`board-card board-card-${card.columnId} ${card.hidden ? "board-card-hidden" : ""}`}>
      {showAdminMenu && !isEditing ? (
        <CardMenu
          cardId={card.id}
          hidden={card.hidden}
          onToggleHidden={onToggleHidden}
          onMove={onMove}
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
        </>
      )}
    </li>
  );
}
