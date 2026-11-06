/** Voting (F26, D135): at most 3 votes per member per board, one vote per card. */
export const VOTES_PER_MEMBER = 3;

export type Voter = { uid: string; cardIds: string[] };

/** How many voters chose each card. A card listed twice by one voter counts once. */
export function countVotes(voters: ReadonlyArray<Voter>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const voter of voters) {
    for (const cardId of new Set(voter.cardIds)) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  return counts;
}

export function votesLeft(cardIds: ReadonlyArray<string>): number {
  return Math.max(0, VOTES_PER_MEMBER - cardIds.length);
}

/** The member's next list of voted cards after pressing the button of `cardId`, or null when no votes are left. */
export function toggleVote(cardIds: ReadonlyArray<string>, cardId: string): string[] | null {
  if (cardIds.includes(cardId)) return cardIds.filter((id) => id !== cardId);
  return cardIds.length >= VOTES_PER_MEMBER ? null : [...cardIds, cardId];
}
