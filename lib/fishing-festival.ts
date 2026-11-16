/** Fishing Festival mini-game (pure logic, no Firebase imports). */
import type { BoardMember, PowerAction, PowerActionType, ResolvedState, WheelSegment } from "./firebase/types";
import { POWER_ACTION_COSTS } from "./firebase/types";
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

// ---------------------------------------------------------------------------
// Power action resolution (pure — no Firebase)
// ---------------------------------------------------------------------------

/** Actions requiring a targetUid. */
const TARGETED_ACTIONS: ReadonlySet<PowerActionType> = new Set(["golden-hook", "bait-trap", "right-neighbor"]);

/** Whether an action type requires a targetUid. */
export function actionRequiresTarget(type: PowerActionType): boolean {
  return TARGETED_ACTIONS.has(type);
}

/**
 * Returns the uid of the next eligible candidate in clockwise (ascending uid) order starting
 * from the position immediately after `startUid` in the full member list.
 * Returns null when no eligible candidate exists.
 */
export function computeRightNeighbor(
  allMemberUids: string[],
  startUid: string,
  eligibleUids: ReadonlySet<string>,
): string | null {
  if (allMemberUids.length === 0) return null;
  const sorted = [...allMemberUids].sort((a, b) => a.localeCompare(b));
  const startIndex = sorted.indexOf(startUid);
  const offset = startIndex === -1 ? 0 : startIndex + 1;
  for (let step = 0; step < sorted.length; step += 1) {
    const uid = sorted[(offset + step) % sorted.length];
    if (uid !== startUid && eligibleUids.has(uid)) return uid;
  }
  return null;
}

/**
 * Follows the Bait Trap redirect chain: given the initial wheel winner uid, returns the final
 * winner uid after all applicable redirects. Detects loops and falls back to `initialWinner`.
 */
export function resolveBaitTrap(
  initialWinner: string,
  baitTrapMap: Readonly<Record<string, string>>,
  eligibleUids: ReadonlySet<string>,
): string {
  const visited = new Set<string>();
  let current = initialWinner;
  while (baitTrapMap[current] !== undefined && !visited.has(current)) {
    visited.add(current);
    const next = baitTrapMap[current];
    if (eligibleUids.has(next)) {
      current = next;
    } else {
      break;
    }
  }
  return current;
}

export type ResolveActionsInput = {
  actions: PowerAction[];
  allMemberUids: string[];
  currentHostUid: string;
  ignoredUids: string[];
  hostExcludedUids: string[];
};

export type ResolveActionsResult = ResolvedState & {
  /** True when no eligible candidates remain after all exclusions. */
  noEligibleCandidates: boolean;
};

/**
 * Deterministic action resolution. Applies all submitted actions and produces a ResolvedState.
 * This is a pure function: trusted-admin calls it, then persists the result.
 */
export function resolveActions({
  actions,
  allMemberUids,
  ignoredUids,
  hostExcludedUids,
}: ResolveActionsInput): ResolveActionsResult {
  const ignoredSet = new Set(ignoredUids);
  const hostExcludedSet = new Set(hostExcludedUids);

  // Safe Catch: all submitters are excluded from candidates.
  const safeCatchUids = actions
    .filter((a) => a.type === "safe-catch")
    .map((a) => a.uid);
  const safeCatchSet = new Set(safeCatchUids);

  // Build base eligible set (before Safe Catch).
  const baseEligible = new Set(
    allMemberUids.filter(
      (uid) => !ignoredSet.has(uid) && !hostExcludedSet.has(uid),
    ),
  );

  // Apply Safe Catch.
  const finalEligibleSet = new Set(
    [...baseEligible].filter((uid) => !safeCatchSet.has(uid)),
  );

  // Bait Trap map: target → redirect. All entries applied regardless of eligibility at resolution
  // (a Bait Trap targeting an ineligible player simply never fires).
  const baitTrapMap: Record<string, string> = {};
  for (const a of actions) {
    if (a.type === "bait-trap" && a.targetUid !== null) {
      baitTrapMap[a.targetUid] = a.targetUid; // placeholder; resolve redirect below
    }
  }
  // For each bait trap target, find the next eligible clockwise neighbor as the redirect destination.
  for (const a of actions) {
    if (a.type === "bait-trap" && a.targetUid !== null) {
      const redirect = computeRightNeighbor(
        [...finalEligibleSet].sort((x, y) => x.localeCompare(y)),
        a.targetUid,
        finalEligibleSet,
      );
      if (redirect !== null && redirect !== a.targetUid) {
        baitTrapMap[a.targetUid] = redirect;
      } else {
        // No valid redirect: remove the bait trap entry so it doesn't redirect to itself.
        delete baitTrapMap[a.targetUid];
      }
    }
  }

  // Golden Hook: first-submitted (by submittedAt) wins when multiple are present.
  const goldenHookActions = actions
    .filter((a) => a.type === "golden-hook" && a.targetUid !== null && finalEligibleSet.has(a.targetUid))
    .sort((a, b) => {
      const ta = a.submittedAt?.getTime() ?? 0;
      const tb = b.submittedAt?.getTime() ?? 0;
      return ta - tb;
    });
  const goldenHookWinner = goldenHookActions[0]?.targetUid ?? null;

  // Final candidate list: eligible UIDs sorted (stable order for the wheel).
  const finalCandidateUids = [...finalEligibleSet].sort((a, b) => a.localeCompare(b));

  // Lucky Re-spin grant count: one grant per buyer, capped at MAX_RESPINS (applied at wheel time).
  const reSpinGrantCount = actions.filter((a) => a.type === "lucky-respin").length;

  // Right Neighbor: handled separately by the UI (it's a forced wheel result, not a candidate filter).
  // The resolved right-neighbor uid is computed by the admin at wheel time using computeRightNeighbor().

  return {
    safeCatchUids,
    goldenHookWinner,
    baitTrapMap,
    finalCandidateUids,
    reSpinGrantCount,
    resolvedAt: null,
    noEligibleCandidates: finalCandidateUids.length === 0 && goldenHookWinner === null,
  };
}

/** Returns the cost of a Power Action type. */
export function powerActionCost(type: PowerActionType): number {
  return POWER_ACTION_COSTS[type];
}
