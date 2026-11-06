import type { BoardCard } from "./firebase/types";

/** One thing shown in a column: a single card, or a stack of cards that share a groupId (F21, D102). */
export type CardItem = {
  key: string;
  isStack: boolean;
  cards: BoardCard[];
};

/**
 * Groups the cards of one column. A stack sits where its first card is; a group of one card is a normal card.
 * `cards` must already be in display order (oldest first).
 */
export function groupCards(cards: ReadonlyArray<BoardCard>): CardItem[] {
  const items: CardItem[] = [];
  const stacksByGroup = new Map<string, CardItem>();
  for (const card of cards) {
    const existing = card.groupId ? stacksByGroup.get(card.groupId) : undefined;
    if (existing) {
      existing.cards.push(card);
      continue;
    }
    const item: CardItem = { key: card.groupId ?? card.id, isStack: false, cards: [card] };
    if (card.groupId) stacksByGroup.set(card.groupId, item);
    items.push(item);
  }
  for (const item of items) item.isStack = item.cards.length > 1;
  return items;
}
