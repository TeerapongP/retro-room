/** Crowded Farm (F30, D153 to D162): pure rules of the step 5 mini-game. No Firebase and no React in this file. */

export type FarmFieldId = "carrot" | "corn" | "strawberry";

export type FarmField = { id: FarmFieldId; label: string; baseYield: number };

export const FARM_FIELDS: readonly FarmField[] = [
  { id: "carrot", label: "แครอท", baseYield: 6 },
  { id: "corn", label: "ข้าวโพด", baseYield: 7 },
  { id: "strawberry", label: "สตรอว์เบอร์รี", baseYield: 8 },
];

/** Must equal the 15 seconds written in firestore.rules (the deadline is startedAt + 15 seconds). */
export const FARM_SELECTION_SECONDS = 15;

/** The local clock may be ahead of the server, so choices are read a little after the local deadline. */
export const FARM_REVEAL_DELAY_MS = 500;

export type FarmResolution = "direct" | "tie-wheel" | "all-wheel";

export type FarmGameStatus = "selecting" | "finished" | "cancelled";

export type FarmGame = {
  id: string;
  startedAt: Date | null;
  status: FarmGameStatus;
  resolution: FarmResolution | null;
  winnerUid: string | null;
};

export type FarmChoice = { uid: string; field: FarmFieldId };

export type FieldTally = {
  field: FarmField;
  playerCount: number;
  /** Score rounded to two decimals, in hundredths. For display only; never used to pick the winner. */
  scoreHundredths: number;
  isBest: boolean;
};

export type FarmOutcome =
  | { kind: "direct"; winnerUid: string }
  | { kind: "tie-wheel"; candidateUids: string[] }
  | { kind: "all-wheel"; candidateUids: string[] };

export type FarmReveal = {
  outcome: FarmOutcome;
  tallies: FieldTally[];
  /** True when at least one player chose a field themselves. */
  hasExplicitChoice: boolean;
};

export type FarmErrorCode =
  | "round-in-progress"
  | "fallback-pending"
  | "already-resolved"
  | "not-active"
  | "not-eligible";

/** A business reason why a Crowded Farm action cannot happen now. Thrown inside transactions, so it never retries. */
export class FarmError extends Error {
  readonly code: FarmErrorCode;

  constructor(code: FarmErrorCode, message: string) {
    super(message);
    this.name = "FarmError";
    this.code = code;
  }
}

export function isFarmError(error: unknown, code?: FarmErrorCode): error is FarmError {
  return error instanceof FarmError && (code === undefined || error.code === code);
}

/**
 * A player is a member who joined before the game started (D154). The Rules use joinedAt <= startedAt on exact
 * timestamps. Dates only hold milliseconds, so equal milliseconds count as not joined: the client may leave out a
 * player the Rules would allow but never lists one the Rules would reject.
 */
export function isFarmPlayer(joinedAt: Date | null, startedAt: Date | null): boolean {
  return joinedAt !== null && startedAt !== null && joinedAt.getTime() < startedAt.getTime();
}

export function isFarmFieldId(value: unknown): value is FarmFieldId {
  return FARM_FIELDS.some((field) => field.id === value);
}

export function farmDeadlineMillis(startedAt: Date): number {
  return startedAt.getTime() + FARM_SELECTION_SECONDS * 1000;
}

/** FNV-1a, 32 bit, over the UTF-8 bytes of the text. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The field given to a player who did not choose: hash of "gameId:uid" mod 3. */
export function autoAssignedField(gameId: string, uid: string): FarmFieldId {
  return FARM_FIELDS[fnv1a32(`${gameId}:${uid}`) % FARM_FIELDS.length].id;
}

/** True when a field with `countA` players is strictly better than one with `countB`. Exact: no division. */
export function isBetterScore(baseA: number, countA: number, baseB: number, countB: number): boolean {
  return baseA * countB > baseB * countA;
}

/** base / count rounded half up to two decimals, as an integer number of hundredths. */
export function scoreHundredths(baseYield: number, playerCount: number): number {
  return Math.floor((baseYield * 200 + playerCount) / (2 * playerCount));
}

export function formatScore(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

/**
 * Works out the result of a round from the revealed choices. Players are the members who joined before the game
 * started. Choices of other users are ignored. Every client runs this and must reach the same answer.
 */
export function revealFarmGame(
  gameId: string,
  playerUids: ReadonlyArray<string>,
  choices: ReadonlyArray<FarmChoice>,
): FarmReveal {
  const sortedPlayerUids = [...playerUids].sort();
  const explicitFieldByUid = new Map<string, FarmFieldId>();
  for (const choice of choices) {
    if (sortedPlayerUids.includes(choice.uid) && isFarmFieldId(choice.field)) {
      explicitFieldByUid.set(choice.uid, choice.field);
    }
  }

  if (explicitFieldByUid.size === 0) {
    const emptyTallies = FARM_FIELDS.map((field) => ({ field, playerCount: 0, scoreHundredths: 0, isBest: false }));
    return {
      outcome: { kind: "all-wheel", candidateUids: sortedPlayerUids },
      tallies: emptyTallies,
      hasExplicitChoice: false,
    };
  }

  const fieldByUid = new Map<string, FarmFieldId>();
  for (const uid of sortedPlayerUids) {
    fieldByUid.set(uid, explicitFieldByUid.get(uid) ?? autoAssignedField(gameId, uid));
  }

  const counts = FARM_FIELDS.map((field) => ({
    field,
    playerCount: sortedPlayerUids.filter((uid) => fieldByUid.get(uid) === field.id).length,
  }));
  const occupied = counts.filter((entry) => entry.playerCount > 0);
  const best = occupied.reduce((leader, entry) =>
    isBetterScore(entry.field.baseYield, entry.playerCount, leader.field.baseYield, leader.playerCount)
      ? entry
      : leader,
  );
  const isBest = (entry: { field: FarmField; playerCount: number }) =>
    entry.playerCount > 0 &&
    !isBetterScore(best.field.baseYield, best.playerCount, entry.field.baseYield, entry.playerCount) &&
    !isBetterScore(entry.field.baseYield, entry.playerCount, best.field.baseYield, best.playerCount);

  const tallies: FieldTally[] = counts.map((entry) => ({
    field: entry.field,
    playerCount: entry.playerCount,
    scoreHundredths: entry.playerCount > 0 ? scoreHundredths(entry.field.baseYield, entry.playerCount) : 0,
    isBest: isBest(entry),
  }));

  const bestFieldIds = new Set(tallies.filter((tally) => tally.isBest).map((tally) => tally.field.id));
  const candidateUids = sortedPlayerUids.filter((uid) => bestFieldIds.has(fieldByUid.get(uid) as FarmFieldId));
  const outcome: FarmOutcome =
    candidateUids.length === 1
      ? { kind: "direct", winnerUid: candidateUids[0] }
      : { kind: "tie-wheel", candidateUids };
  return { outcome, tallies, hasExplicitChoice: true };
}

/** Whoever may win the wheel for this outcome; a direct winner is a list of one. */
export function candidateUidsOf(outcome: FarmOutcome): string[] {
  return outcome.kind === "direct" ? [outcome.winnerUid] : outcome.candidateUids;
}

/** Compares the winner stored by the admin with the result every client works out itself (D161, trusted admin). */
export function isPersistedWinnerConsistent(outcome: FarmOutcome, persistedWinnerUid: string): boolean {
  return candidateUidsOf(outcome).includes(persistedWinnerUid);
}
