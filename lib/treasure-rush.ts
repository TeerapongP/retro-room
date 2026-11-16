/** Treasure Rush mini-game (pure logic, no Firebase imports). */
import type {
  BoardMember,
  ChestType,
  TreasureChest,
  TreasureModifier,
  TreasurePowerAction,
  TreasurePlayerState,
} from "./firebase/types";
import {
  CHEST_BASE_POINTS,
  GEM_BONUS_POINTS,
  MYSTERY_POOL,
  ROYAL_BONUS_POINTS,
  TRAP_SHIELD_RESTORE,
  TREASURE_PP_PER_100,
} from "./firebase/types";
import { sortCandidates, type WheelCandidate } from "./wheel";

export type ScoredTreasureParticipant = {
  uid: string;
  score: number;
  rank: number;
  displayName?: string;
};

export type TreasureResolveResult = {
  finalCandidateUids: string[];
  reSpinGrantCount: number;
  noEligibleCandidates: boolean;
  resolvedAt: null;
};

function lcgNext(state: number): number {
  return ((state * 1664525 + 1013904223) & 0xffff_ffff) >>> 0;
}

const CHEST_THRESHOLDS: ReadonlyArray<{ type: ChestType; threshold: number }> = [
  { type: "coins", threshold: 40 },   // 0–39 = coins (40%)
  { type: "gem", threshold: 65 },     // 40–64 = gem (25%)
  { type: "crown", threshold: 75 },   // 65–74 = crown (10%)
  { type: "trap", threshold: 95 },    // 75–94 = trap (20%)
  { type: "mystery", threshold: 100 }, // 95–99 = mystery (5%)
];

export function generateChestBoard(seed: number, count: number = 12): TreasureChest[] {
  let state = seed >>> 0;
  const chests: TreasureChest[] = [];
  for (let i = 0; i < count; i++) {
    state = lcgNext(state);
    const r = state % 100;
    let type: ChestType = "mystery";
    for (const entry of CHEST_THRESHOLDS) {
      if (r < entry.threshold) {
        type = entry.type;
        break;
      }
    }
    let basePoints: number;
    if (type === "mystery") {
      state = lcgNext(state);
      basePoints = MYSTERY_POOL[state % MYSTERY_POOL.length] as number;
    } else {
      basePoints = CHEST_BASE_POINTS[type];
    }
    chests.push({ type, basePoints });
  }
  return chests;
}

export function applyModifier(state: TreasurePlayerState, modifier: TreasureModifier | null): number {
  const { bankedPoints, gemBanked, coinBanked, crownBanked, bankCount } = state;
  let score: number;
  switch (modifier) {
    case "gem-fever":
      score = bankedPoints + gemBanked;
      break;
    case "coin-rain":
      score = bankedPoints + coinBanked;
      break;
    case "safe-expedition":
      score = bankedPoints + 50;
      break;
    case "royal-treasure":
      score = bankedPoints + crownBanked;
      break;
    case "lucky-explorer":
      score = bankedPoints + bankCount * 20;
      break;
    case "double-treasure":
      score = bankedPoints * 2;
      break;
    default:
      score = bankedPoints;
  }
  return Math.max(0, score);
}

function computeTreasureScores(
  states: TreasurePlayerState[],
  modifier: TreasureModifier | null,
  actions: TreasurePowerAction[],
  memberMap: Map<string, string>,
): ScoredTreasureParticipant[] {
  const trapShieldUids = new Set(actions.filter((a) => a.type === "trap-shield").map((a) => a.uid));
  const gemBonusUids = new Set(actions.filter((a) => a.type === "gem-bonus").map((a) => a.uid));
  const doubleLootUids = new Set(actions.filter((a) => a.type === "double-loot").map((a) => a.uid));
  const royalBonusUids = new Set(actions.filter((a) => a.type === "royal-bonus").map((a) => a.uid));

  const participants: Omit<ScoredTreasureParticipant, "rank">[] = states.map((s) => {
    let score = applyModifier(s, modifier);
    if (trapShieldUids.has(s.uid) && s.trapHit) score += TRAP_SHIELD_RESTORE;
    if (gemBonusUids.has(s.uid) && s.gemBanked > 0) score += GEM_BONUS_POINTS;
    if (doubleLootUids.has(s.uid)) score += s.maxSingleReward;
    if (royalBonusUids.has(s.uid) && s.crownBanked > 0) score += ROYAL_BONUS_POINTS;
    return {
      uid: s.uid,
      score: Math.max(0, score),
      ...(memberMap.size > 0 ? { displayName: memberMap.get(s.uid) } : {}),
    };
  });

  participants.sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));

  const ranked: ScoredTreasureParticipant[] = [];
  for (let i = 0; i < participants.length; i++) {
    const prev = ranked[i - 1];
    const rank =
      prev !== undefined && prev.score === participants[i].score ? prev.rank : i + 1;
    ranked.push({ ...participants[i], rank });
  }
  return ranked;
}

/** Two-argument form: no members, no actions (unit tests). */
export function calcTreasureScores(
  states: TreasurePlayerState[],
  modifier: TreasureModifier | null,
): ScoredTreasureParticipant[];
/** Three-argument form: with power actions applied, no member names. */
export function calcTreasureScores(
  states: TreasurePlayerState[],
  modifier: TreasureModifier | null,
  actions: TreasurePowerAction[],
): ScoredTreasureParticipant[];
/** Four-argument form: enriched with member display names and power actions (UI). */
export function calcTreasureScores(
  states: TreasurePlayerState[],
  members: BoardMember[],
  modifier: TreasureModifier | null,
  actions?: TreasurePowerAction[],
): ScoredTreasureParticipant[];
export function calcTreasureScores(
  states: TreasurePlayerState[],
  membersOrModifier: BoardMember[] | TreasureModifier | null,
  maybeModifierOrActions?: TreasureModifier | TreasurePowerAction[] | null,
  maybeActions?: TreasurePowerAction[],
): ScoredTreasureParticipant[] {
  const memberMap = new Map<string, string>();
  let modifier: TreasureModifier | null;
  let actions: TreasurePowerAction[];
  if (Array.isArray(membersOrModifier)) {
    for (const m of membersOrModifier as BoardMember[]) {
      memberMap.set(m.uid, m.displayName);
    }
    modifier = (maybeModifierOrActions as TreasureModifier | null) ?? null;
    actions = maybeActions ?? [];
  } else {
    modifier = membersOrModifier;
    actions = Array.isArray(maybeModifierOrActions) ? maybeModifierOrActions : [];
  }
  return computeTreasureScores(states, modifier, actions, memberMap);
}

export function buildTreasureCandidates(
  members: BoardMember[],
  ignoredUids: string[],
  excludedUids: string[],
): WheelCandidate[] {
  const ignoredSet = new Set(ignoredUids);
  const excludedSet = new Set(excludedUids);
  if (members.length === 0) return [];
  const candidates: WheelCandidate[] = members
    .filter((m) => !ignoredSet.has(m.uid) && !excludedSet.has(m.uid))
    .map((m) => ({ uid: m.uid, name: m.displayName }));
  return sortCandidates(candidates);
}

export function resolveTreasureActions(input: {
  actions: TreasurePowerAction[];
  allMemberUids: string[];
  ignoredUids: string[];
  hostExcludedUids: string[];
}): TreasureResolveResult {
  const { actions, allMemberUids, ignoredUids, hostExcludedUids } = input;
  const ignoredSet = new Set(ignoredUids);
  const hostExcludedSet = new Set(hostExcludedUids);

  const finalCandidateUids = allMemberUids
    .filter((uid) => !ignoredSet.has(uid) && !hostExcludedSet.has(uid))
    .sort((a, b) => a.localeCompare(b));

  const reSpinGrantCount = actions.filter((a) => a.type === "lucky-reroll").length;

  return {
    finalCandidateUids,
    reSpinGrantCount,
    noEligibleCandidates: finalCandidateUids.length === 0,
    resolvedAt: null,
  };
}

export function earnedPP(bankedPoints: number): number {
  return Math.max(0, Math.floor(bankedPoints / 100) * TREASURE_PP_PER_100);
}
