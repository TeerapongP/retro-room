"use client";

import { useState, type ReactNode } from "react";
import type { BoardCard } from "@/lib/firebase/types";

type CardStackProps = {
  cards: BoardCard[];
  /** Renders one card. The first card is the top of the pile. */
  renderCard: (card: BoardCard) => ReactNode;
};

/** A pile of cards about the same topic (F21, D103): folded it shows the top card, a count and layered edges; opened it lists every card. */
export function CardStack({ cards, renderCard }: CardStackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const stackId = `stack-${cards[0].id}`;
  return (
    <li className={`board-stack board-stack-${cards[0].columnId}`}>
      <ul id={stackId} className={isOpen ? "board-stack-open" : "board-stack-pile"}>
        {isOpen ? cards.map((card) => renderCard(card)) : renderCard(cards[0])}
      </ul>
      <button
        type="button"
        className="board-stack-toggle"
        aria-expanded={isOpen}
        aria-controls={stackId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "พับกอง" : `กองการ์ด ×${cards.length}`}
      </button>
    </li>
  );
}
