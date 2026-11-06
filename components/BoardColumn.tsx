"use client";

import { useState, type FormEvent } from "react";
import { ColumnIcon } from "@/components/BoardIcons";
import { IconPlus } from "@/components/DashboardIcons";
import { CardStack } from "@/components/CardStack";
import { StickyNote } from "@/components/StickyNote";
import { groupCards } from "@/lib/card-groups";
import {
  CARD_TEXT_MAX_LENGTH,
  FALLBACK_DISPLAY_NAME,
  type BoardCard,
  type ColumnId,
} from "@/lib/firebase/types";

type BoardColumnProps = {
  columnId: ColumnId;
  label: string;
  cards: BoardCard[];
  authorNames: Map<string, string>;
  uid: string;
  isOwner: boolean;
  isAdmin: boolean;
  readOnly: boolean;
  onToggleHidden: (card: BoardCard) => void;
  onMove: (card: BoardCard) => void;
  onAdminDelete: (card: BoardCard) => void;
  onChangeColumn: (card: BoardCard, columnId: ColumnId) => void;
  onStackWith: (card: BoardCard) => void;
  onUnstack: (card: BoardCard) => void;
  onStackDrop: (draggedCardId: string, target: BoardCard) => void;
  onAdd: (text: string) => Promise<boolean>;
  onEdit: (cardId: string, text: string) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<boolean>;
};

export function BoardColumn({
  columnId,
  label,
  cards,
  authorNames,
  uid,
  isOwner,
  isAdmin,
  readOnly,
  onToggleHidden,
  onMove,
  onAdminDelete,
  onChangeColumn,
  onStackWith,
  onUnstack,
  onStackDrop,
  onAdd,
  onEdit,
  onDelete,
}: BoardColumnProps) {
  const [draft, setDraft] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const inputId = `new-card-${columnId}`;
  const composerId = `composer-${columnId}`;

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setIsAdding(true);
    if (await onAdd(text)) {
      setDraft("");
      setIsComposerOpen(false);
    }
    setIsAdding(false);
  }

  return (
    <section aria-labelledby={`column-${columnId}`} className="board-column">
      <header className={`board-column-head board-column-head-${columnId}`}>
        <ColumnIcon columnId={columnId} />
        <h2 id={`column-${columnId}`}>{label}</h2>
        <span className="board-count" aria-label={`${cards.length} การ์ด`}>
          {cards.length}
        </span>
        {readOnly ? null : (
          <button
            type="button"
            className="board-add"
            aria-label={`เพิ่มโน้ตใน ${label}`}
            aria-expanded={isComposerOpen}
            aria-controls={composerId}
            onClick={() => setIsComposerOpen((open) => !open)}
          >
            <IconPlus />
          </button>
        )}
      </header>
      {!readOnly && isComposerOpen ? (
        <form id={composerId} onSubmit={handleAdd} className="board-composer">
          <label htmlFor={inputId} className="sr-only">
            เพิ่มโน้ตใน {label}
          </label>
          <textarea
            id={inputId}
            className="board-input"
            value={draft}
            maxLength={CARD_TEXT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="เขียนความเห็น..."
            autoFocus
          />
          <div className="board-composer-row">
            <span>
              {draft.length}/{CARD_TEXT_MAX_LENGTH}
            </span>
            <button type="submit" className="board-button" disabled={isAdding || !draft.trim()}>
              เพิ่มโน้ต
            </button>
          </div>
        </form>
      ) : null}
      <ul className="board-cards">
        {groupCards(cards).map((item) => {
          const renderCard = (card: BoardCard) => (
            <StickyNote
              key={card.id}
              card={card}
              authorName={authorNames.get(card.authorId) ?? FALLBACK_DISPLAY_NAME}
              canEdit={!readOnly && card.authorId === uid}
              canDelete={!readOnly && (card.authorId === uid || isOwner)}
              showAdminMenu={isAdmin && !readOnly}
              onToggleHidden={() => onToggleHidden(card)}
              onMove={() => onMove(card)}
              onAdminDelete={() => onAdminDelete(card)}
              onMoveToColumn={(targetColumnId) => onChangeColumn(card, targetColumnId)}
              isStacked={item.isStack}
              onStackWith={() => onStackWith(card)}
              onUnstack={() => onUnstack(card)}
              onStackDrop={(draggedCardId) => onStackDrop(draggedCardId, card)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );
          return item.isStack ? (
            <CardStack key={item.key} cards={item.cards} renderCard={renderCard} />
          ) : (
            renderCard(item.cards[0])
          );
        })}
      </ul>
    </section>
  );
}
