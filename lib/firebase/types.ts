export type BoardRole = "owner" | "member";

export const BOARD_COLUMNS = [
  { id: "went-well", label: "Went Well" },
  { id: "to-improve", label: "To Improve" },
  { id: "ideas", label: "Ideas" },
] as const;

export type ColumnId = (typeof BOARD_COLUMNS)[number]["id"];

export const CARD_TEXT_MAX_LENGTH = 500;
export const BOARD_TITLE_MAX_LENGTH = 80;
export const FALLBACK_DISPLAY_NAME = "Unnamed";

/** Counted in UTF-16 units to match Firestore Rules `size()`; an emoji counts as 2. */
export const PLAYER_NAME_MAX_LENGTH = 20;

export function normalizePlayerName(rawName: string): string {
  return rawName.trim();
}

export function isValidPlayerName(name: string): boolean {
  return name.length >= 1 && name.length <= PLAYER_NAME_MAX_LENGTH && /\S/.test(name);
}

export type BoardStatus = "waiting" | "in-progress" | "completed";

export type Board = {
  id: string;
  title: string;
  ownerId: string;
  status: BoardStatus;
  /** Shared countdown (F22, D111): end time and the length it was started with, or null when no timer runs. */
  timerEndsAt: Date | null;
  timerDurationSec: number | null;
  /** Shared session step, 1 to 6 (F23, D117). */
  phase: number;
  /** Result of the next-host wheel (F29, D149): the winner's uid and when the wheel was spun, or null before any spin. */
  nextHostUid: string | null;
  nextHostSpunAt: Date | null;
  /** Crowded Farm (F30): the round in play, and the round the stored next host came from (D153, D157). */
  farmActiveGameId: string | null;
  nextHostGameId: string | null;
  /**
   * Host of this session (F30, D163): null until a Host is handed over, and then the owner hosts. `pastHostUids` lists
   * everyone who handed the role over. Both only change when the admin hands the role to the stored next Host.
   */
  hostUid: string | null;
  pastHostUids: string[];
};

export type BoardMember = {
  uid: string;
  role: BoardRole;
  displayName: string;
  /** Server time of joining; decides who plays a Crowded Farm round (D154). Null while the write is pending. */
  joinedAt: Date | null;
};

export type BoardCard = {
  id: string;
  columnId: ColumnId;
  text: string;
  authorId: string;
  hidden: boolean;
  /** Cards of one column that share a groupId form a stack (F21, D102). */
  groupId: string | null;
  createdAt: Date | null;
};

/** A board the admin can move a card into (listed with the admin-only board query). */
export type MoveTargetBoard = {
  id: string;
  title: string;
};

export type DashboardBoard = {
  boardId: string;
  title: string;
  role: BoardRole;
  joinedAt: Date | null;
};

export type FishingGameStatus =
  | "selecting-wheel"
  | "fishing"
  | "scoring"
  | "wheel"
  | "finished"
  | "cancelled";

export type WheelSegment =
  | "small-fish"
  | "big-fish"
  | "golden-fish"
  | "lucky"
  | "double-points"
  | "rare-fish";

export type PowerActionType =
  | "lucky-respin"
  | "right-neighbor"
  | "safe-catch"
  | "fishy-shuffle"
  | "golden-hook"
  | "bait-trap";

export const POWER_ACTION_COSTS: Readonly<Record<PowerActionType, number>> = {
  "lucky-respin": 30,
  "right-neighbor": 50,
  "safe-catch": 40,
  "fishy-shuffle": 20,
  "golden-hook": 150,
  "bait-trap": 60,
};

export const MAX_RESPINS = 2;

export type PowerAction = {
  uid: string;
  type: PowerActionType;
  targetUid: string | null;
  cost: number;
  submittedAt: Date | null;
  updatedAt: Date | null;
};

export type PowerPoints = {
  uid: string;
  balance: number;
  earned: number;
  updatedAt: Date | null;
};

export type ResolvedState = {
  safeCatchUids: string[];
  goldenHookWinner: string | null;
  baitTrapMap: Record<string, string>;
  finalCandidateUids: string[];
  reSpinGrantCount: number;
  resolvedAt: Date | null;
};

export type FishingGame = {
  id: string;
  gameType: "fishing";
  status: FishingGameStatus;
  startedAt: Date | null;
  wheelSegment: WheelSegment | null;
  wheelSpunAt: Date | null;
  fishingEndsAt: Date | null;
  fishingDurationSec: 30 | 45 | 60;
  ignoredUids: string[];
  powerShopEndsAt: Date | null;
  reSpinCount: number;
  resolvedState: ResolvedState | null;
  resolution: "wheel" | "golden-hook" | "none" | null;
  winnerUid: string | null;
  resolvedAt: Date | null;
};

export type FishCatch = {
  uid: string;
  catchCount: number;
  lastCatchAt: Date | null;
  updatedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Treasure Rush types
// ---------------------------------------------------------------------------

export type TreasureGameStatus = "idle" | "playing" | "scoring" | "wheel" | "finished";

export type TreasureModifier =
  | "gem-fever"
  | "coin-rain"
  | "safe-expedition"
  | "royal-treasure"
  | "lucky-explorer"
  | "double-treasure";

export type ChestType = "coins" | "gem" | "crown" | "trap" | "mystery";

export const CHEST_BASE_POINTS: Readonly<Record<ChestType, number>> = {
  coins: 30,
  gem: 100,
  crown: 150,
  trap: -50,
  mystery: 0,
};

export const MYSTERY_POOL: readonly number[] = [20, 40, 60, 80, 120];

export type TreasurePowerActionType =
  | "trap-shield"
  | "gem-bonus"
  | "double-loot"
  | "lucky-reroll"
  | "royal-bonus";

export const TREASURE_POWER_ACTION_COSTS: Readonly<Record<TreasurePowerActionType, number>> = {
  "trap-shield": 20,
  "gem-bonus": 20,
  "double-loot": 30,
  "lucky-reroll": 30,
  "royal-bonus": 50,
};

/** Points restored by Treasure Shield (trap-shield) ability. */
export const TRAP_SHIELD_RESTORE = 50;
/** Flat bonus from Gem Bonus ability (gem-bonus). */
export const GEM_BONUS_POINTS = 50;
/** Flat bonus from Royal Bonus ability (royal-bonus). */
export const ROYAL_BONUS_POINTS = 100;
export const TREASURE_MAX_RESPINS = 2;
export const TREASURE_PP_PER_100 = 10;

export type TreasurePowerAction = {
  uid: string;
  type: TreasurePowerActionType;
  cost: number;
  submittedAt: Date | null;
  updatedAt: Date | null;
};

export type TreasureChest = {
  type: ChestType;
  basePoints: number;
};

export type TreasurePlayerState = {
  uid: string;
  openedCount: number;
  currentRunPoints: number;
  currentRunGem: number;
  currentRunCoin: number;
  currentRunCrown: number;
  bankedPoints: number;
  gemBanked: number;
  coinBanked: number;
  crownBanked: number;
  bankCount: number;
  trapHit: boolean;
  /** Highest single positive chest reward opened across all runs (for double-loot ability). */
  maxSingleReward: number;
  score: number;
  lastActionAt: Date | null;
  updatedAt: Date | null;
};

export type TreasureResolvedState = {
  finalCandidateUids: string[];
  reSpinGrantCount: number;
  resolvedAt: Date | null;
};

export type TreasureGame = {
  id: string;
  gameType: "treasure";
  status: TreasureGameStatus;
  startedAt: Date | null;
  durationSec: 60 | 90 | 120 | 180;
  endsAt: Date | null;
  activityModifier: TreasureModifier | null;
  ignoredUids: string[];
  reSpinCount: number;
  resolvedState: TreasureResolvedState | null;
  resolution: "wheel" | null;
  winnerUid: string | null;
  resolvedAt: Date | null;
};
