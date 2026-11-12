/** Fishing Festival mini-game (pure logic, no Firebase imports). */
import type { BoardMember, WheelSegment } from "./firebase/types";
import { sortCandidates, type WheelCandidate } from "./wheel";

/** Minimal catch input needed for scoring (a subset of FishCatch). */
type FishCatchInput = {
  uid: string;
  catchCount: number;
  lastCatchAt: Date | null;
};

export type ScoredParticipant = {
  uid: string;
  catchCount: number;
  score: number;
  rank: number;
  /** Populated when members are supplied to calcScores; absent in the two-argument form. */
  displayName?: string;
};

function computeScores(
  catches: FishCatchInput[],
  wheelSegment: WheelSegment | null,
  memberMap: Map<string, string>,
): ScoredParticipant[] {
  // Identify special recipients before scoring
  let goldenFishUid: string | null = null;
  let rareFishUid: string | null = null;

  if (wheelSegment === "golden-fish") {
    // Player with earliest lastCatchAt among those with catchCount > 0
    let earliest: number | null = null;
    for (const c of catches) {
      if (c.catchCount > 0 && c.lastCatchAt !== null) {
        const ms = c.lastCatchAt.getTime();
        if (earliest === null || ms < earliest) {
          earliest = ms;
          goldenFishUid = c.uid;
        }
      }
    }
  }

  if (wheelSegment === "rare-fish") {
    // Player with catchCount >= 3 AND earliest lastCatchAt among those
    let earliest: number | null = null;
    for (const c of catches) {
      if (c.catchCount >= 3 && c.lastCatchAt !== null) {
        const ms = c.lastCatchAt.getTime();
        if (earliest === null || ms < earliest) {
          earliest = ms;
          rareFishUid = c.uid;
        }
      }
    }
  }

  function scoreFor(c: FishCatchInput): number {
    const base = c.catchCount * 10;
    if (base === 0) return 0;
    switch (wheelSegment) {
      case "small-fish":
        return base;
      case "big-fish":
        return base * 2;
      case "golden-fish":
        return base + (c.uid === goldenFishUid ? 50 : 0);
      case "lucky":
        return base + c.catchCount * 20;
      case "double-points":
        return base * 2;
      case "rare-fish":
        return base + (c.uid === rareFishUid ? 100 : 0);
      default:
        return base;
    }
  }

  const participants: Omit<ScoredParticipant, "rank">[] = catches.map((c) => ({
    uid: c.uid,
    catchCount: c.catchCount,
    score: scoreFor(c),
    ...(memberMap.size > 0 ? { displayName: memberMap.get(c.uid) } : {}),
  }));

  // Sort by score desc, then uid asc for stable ordering
  participants.sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));

  // Assign ranks (ties share the same rank)
  const ranked: ScoredParticipant[] = [];
  for (let i = 0; i < participants.length; i++) {
    const prev = ranked[i - 1];
    const rank = prev !== undefined && prev.score === participants[i].score ? prev.rank : i + 1;
    ranked.push({ ...participants[i], rank });
  }

  return ranked;
}

/** Two-argument form: scoring from catches alone (used in unit tests). */
export function calcScores(catches: FishCatchInput[], wheelSegment: WheelSegment | null): ScoredParticipant[];
/** Three-argument form: scoring enriched with member display names (used in the UI). */
export function calcScores(catches: FishCatchInput[], members: BoardMember[], wheelSegment: WheelSegment | null): ScoredParticipant[];
export function calcScores(
  catches: FishCatchInput[],
  membersOrSegment: BoardMember[] | WheelSegment | null,
  maybeSegment?: WheelSegment | null,
): ScoredParticipant[] {
  const memberMap = new Map<string, string>();
  let wheelSegment: WheelSegment | null;
  if (Array.isArray(membersOrSegment)) {
    for (const m of membersOrSegment) {
      memberMap.set(m.uid, m.displayName);
    }
    wheelSegment = maybeSegment ?? null;
  } else {
    wheelSegment = membersOrSegment;
  }
  return computeScores(catches, wheelSegment, memberMap);
}

/** Two-argument form: returns UIDs (used in unit tests). */
export function buildCandidates(members: string[], ignoredUids: string[], excludedUids: string[]): string[];
/** Three-argument form: returns WheelCandidates (used in the UI). */
export function buildCandidates(members: BoardMember[], ignoredUids: string[], excludedUids: string[]): WheelCandidate[];
export function buildCandidates(
  members: string[] | BoardMember[],
  ignoredUids: string[],
  excludedUids: string[],
): string[] | WheelCandidate[] {
  const ignoredSet = new Set(ignoredUids);
  const excludedSet = new Set(excludedUids);
  if (members.length === 0) return [];
  if (typeof members[0] === "string") {
    const uids = members as string[];
    return uids
      .filter((uid) => !ignoredSet.has(uid) && !excludedSet.has(uid))
      .sort((a, b) => a.localeCompare(b));
  }
  const boardMembers = members as BoardMember[];
  const candidates: WheelCandidate[] = boardMembers
    .filter((m) => !ignoredSet.has(m.uid) && !excludedSet.has(m.uid))
    .map((m) => ({ uid: m.uid, name: m.displayName }));
  return sortCandidates(candidates);
}
