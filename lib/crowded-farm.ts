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
  /** The best score of all players, excluded Hosts included. */
  isBest: boolean;
  /** The best score among the fields that hold at least one player who may become the next Host. */
  isBestEligible: boolean;
};

export type FarmOutcome =
  | { kind: "direct"; winnerUid: string }
  | { kind: "tie-wheel"; candidateUids: string[] }
  | { kind: "all-wheel"; candidateUids: string[] }
  /** Nobody who may become the next Host is left (every player is the current or a previous Host). */
  | { kind: "none" };

export type FarmReveal = {
  outcome: FarmOutcome;
  tallies: FieldTally[];
  /** True when at least one player chose a field themselves. */
  hasExplicitChoice: boolean;
  /** The field of every player, chosen or assigned. Empty when nobody chose. */
  fieldByUid: Record<string, FarmFieldId>;
  /** Players who may become the next Host, and players who may not. Both groups play and score. */
  eligibleUids: string[];
  excludedUids: string[];
};

/** What the board stores about who hosts (D163): the Host of now and everyone who handed the role over. */
export type FarmHostInfo = { ownerId: string; hostUid: string | null; pastHostUids: ReadonlyArray<string> };

/** The current Host; a board whose Host was never handed over is hosted by its owner (D163). */
export function currentHostUid(info: FarmHostInfo): string {
  return info.hostUid ?? info.ownerId;
}

/** Everyone who may not become the next Host: the current Host and every previous Host of this board. */
export function excludedHostUids(info: FarmHostInfo): string[] {
  return [...new Set([currentHostUid(info), ...info.pastHostUids])].sort();
}

export type FarmErrorCode =
  | "round-in-progress"
  | "fallback-pending"
  | "already-resolved"
  | "not-active"
  | "not-eligible"
  | "host-excluded"
  | "no-next-host";

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
 *
 * Every player counts for the field populations and the scores, the excluded Hosts too (D164). `excludedUids` only
 * narrows who may become the next Host: the winner comes from the best score group that holds an eligible player.
 */
export function revealFarmGame(
  gameId: string,
  playerUids: ReadonlyArray<string>,
  choices: ReadonlyArray<FarmChoice>,
  excludedUids: ReadonlyArray<string>,
): FarmReveal {
  const sortedPlayerUids = [...playerUids].sort();
  const excluded = new Set(excludedUids);
  const eligibleUids = sortedPlayerUids.filter((uid) => !excluded.has(uid));
  const excludedPlayerUids = sortedPlayerUids.filter((uid) => excluded.has(uid));
  const explicitFieldByUid = new Map<string, FarmFieldId>();
  for (const choice of choices) {
    if (sortedPlayerUids.includes(choice.uid) && isFarmFieldId(choice.field)) {
      explicitFieldByUid.set(choice.uid, choice.field);
    }
  }

  if (explicitFieldByUid.size === 0) {
    const emptyTallies = FARM_FIELDS.map((field) => ({
      field,
      playerCount: 0,
      scoreHundredths: 0,
      isBest: false,
      isBestEligible: false,
    }));
    return {
      outcome: eligibleUids.length === 0 ? { kind: "none" } : { kind: "all-wheel", candidateUids: eligibleUids },
      tallies: emptyTallies,
      hasExplicitChoice: false,
      fieldByUid: {},
      eligibleUids,
      excludedUids: excludedPlayerUids,
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
  // Best score first. Fields with an equal score (exact cross-multiplication) share one group.
  const ranked = [...occupied].sort((left, right) => {
    if (isBetterScore(left.field.baseYield, left.playerCount, right.field.baseYield, right.playerCount)) return -1;
    if (isBetterScore(right.field.baseYield, right.playerCount, left.field.baseYield, left.playerCount)) return 1;
    return 0;
  });
  const groups: (typeof ranked)[] = [];
  for (const entry of ranked) {
    const group = groups[groups.length - 1];
    const isSameScore =
      group !== undefined &&
      !isBetterScore(group[0].field.baseYield, group[0].playerCount, entry.field.baseYield, entry.playerCount);
    if (isSameScore) group.push(entry);
    else groups.push([entry]);
  }

  const bestFieldIds = new Set(groups[0].map((entry) => entry.field.id));
  const bestEligibleGroup = groups.find((group) =>
    eligibleUids.some((uid) => group.some((entry) => entry.field.id === fieldByUid.get(uid))),
  );
  const bestEligibleFieldIds = new Set(bestEligibleGroup?.map((entry) => entry.field.id));

  const tallies: FieldTally[] = counts.map((entry) => ({
    field: entry.field,
    playerCount: entry.playerCount,
    scoreHundredths: entry.playerCount > 0 ? scoreHundredths(entry.field.baseYield, entry.playerCount) : 0,
    isBest: bestFieldIds.has(entry.field.id),
    isBestEligible: bestEligibleFieldIds.has(entry.field.id),
  }));

  const candidateUids = eligibleUids.filter((uid) => bestEligibleFieldIds.has(fieldByUid.get(uid) as FarmFieldId));
  let outcome: FarmOutcome;
  if (candidateUids.length === 0) outcome = { kind: "none" };
  else if (candidateUids.length === 1) outcome = { kind: "direct", winnerUid: candidateUids[0] };
  else outcome = { kind: "tie-wheel", candidateUids };
  return {
    outcome,
    tallies,
    hasExplicitChoice: true,
    fieldByUid: Object.fromEntries(fieldByUid),
    eligibleUids,
    excludedUids: excludedPlayerUids,
  };
}

/** Whoever may win the wheel for this outcome; a direct winner is a list of one. */
export function candidateUidsOf(outcome: FarmOutcome): string[] {
  if (outcome.kind === "direct") return [outcome.winnerUid];
  return outcome.kind === "none" ? [] : outcome.candidateUids;
}

/** Compares the winner stored by the admin with the result every client works out itself (D161, trusted admin). */
export function isPersistedWinnerConsistent(outcome: FarmOutcome, persistedWinnerUid: string): boolean {
  return candidateUidsOf(outcome).includes(persistedWinnerUid);
}
