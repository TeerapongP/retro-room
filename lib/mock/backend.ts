import { ADMIN_EMAIL } from "../firebase/admin";
import { clampPhase } from "../phases";
import {
  FARM_SELECTION_SECONDS,
  FarmError,
  excludedHostUids,
  isFarmFieldId,
  type FarmChoice,
  type FarmFieldId,
  type FarmGame,
  type FarmGameStatus,
  type FarmResolution,
} from "../crowded-farm";
import { isValidRating, type Rating } from "../ratings";
import { VOTES_PER_MEMBER, type Voter } from "../votes";
import { ACTION_ITEM_STATUSES, isValidDueDate, makeSessionSnapshot } from "../retro-analytics";
import {
  isValidPlayerName,
  normalizePlayerName,
  type AchievementResult,
  type ActionItem,
  type ActionItemStatus,
  type AttackDocument,
  type AttackStatus,
  type BattleFeedEvent,
  type BattleFeedEventType,
  type BattleItemType,
  type Board,
  type BoardCard,
  type BoardMember,
  type BoardRole,
  type BoardStatus,
  type SessionSnapshot,
  type ColumnId,
  type DashboardBoard,
  type FishCatch,
  type FishingGame,
  type FishingGameStatus,
  type InventoryState,
  type MoveTargetBoard,
  type PowerAction,
  type PowerActionType,
  type PowerPoints,
  type Reaction,
  type ReactionType,
  type ResolvedState,
  type TreasureChest,
  type TreasureGame,
  type TreasureGameStatus,
  type TreasureModifier,
  type TreasurePlayerState,
  type TreasurePowerAction,
  type TreasurePowerActionType,
  type TreasureResolvedState,
  type WheelSegment,
} from "../firebase/types";
import {
  ATTACK_WARNING_MS,
  BATTLE_ITEM_COSTS,
  BOMB_GIFT_DAMAGE,
  FINAL_RUSH_ATTACK_SHUTDOWN_MS,
  GOLDEN_PICK_BONUS,
  ICE_TRAP_DURATION_MS,
  POWER_ACTION_COSTS,
  RECOVERY_POTION_RESTORE,
  SNEAKY_THIEF_MAX_STEAL,
  TREASURE_MAX_RESPINS,
  TREASURE_POWER_ACTION_COSTS,
} from "../firebase/types";

/**
 * In-memory stand-in for Firebase Auth and Firestore (F19, D89 to D92). It does NOT run Security Rules:
 * it is for looking at and clicking through the UI only. State is kept in the given storage as JSON.
 */

export const MOCK_STATE_KEY = "retro-room:mock-state";
const MOCK_ADMIN_UID = "mock-admin";
const MOCK_PLAYERS = [
  ["mock-ploy", "Ploy"],
  ["mock-nok", "Nok"],
  ["mock-kai", "Kai"],
  ["mock-may", "May"],
  ["mock-pim", "Pim"],
  ["mock-ton", "Ton"],
] as const;

export type MockUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoURL: string | null;
};

/** A drawn avatar for the mock admin, so the account chip shows a photo like a real Google sign-in (D124). */
const MOCK_ADMIN_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#c98b4e'/><circle cx='16' cy='12' r='6' fill='#fff3df'/><rect x='6' y='21' width='20' height='11' rx='5' fill='#fff3df'/></svg>",
  );

type StoredBoard = {
  id: string;
  title: string;
  ownerId: string;
  status: BoardStatus;
  currentSessionId?: string | null;
  timerEndsAt?: string | null;
  timerDurationSec?: number | null;
  ratingRound?: { endsAt: string; durationSec: number; revealed: boolean } | null;
  phase?: number;
  nextHostUid?: string | null;
  nextHostSpunAt?: string | null;
  farmActiveGameId?: string | null;
  chaosActiveGameId?: string | null;
  nextHostGameId?: string | null;
  hostUid?: string | null;
  pastHostUids?: string[];
  createdAt: string;
};
type StoredMember = Omit<BoardMember, "joinedAt"> & { joinedAt: string };
type StoredActionItem = Omit<ActionItem, "createdAt" | "completedAt"> & { createdAt: string; completedAt: string | null };
type StoredSessionSnapshot = Omit<SessionSnapshot, "completedAt"> & { completedAt: string };
type StoredFarmGame = {
  id: string;
  startedAt: string;
  status: FarmGameStatus;
  resolution?: FarmResolution;
  winnerUid?: string;
};
type StoredCard = {
  id: string;
  columnId: ColumnId;
  text: string;
  authorId: string;
  hidden: boolean;
  groupId?: string | null;
  createdAt: string;
};
type StoredFishingGame = {
  id: string;
  startedAt: string;
  status: FishingGameStatus;
  fishingDurationSec: 30 | 45 | 60;
  ignoredUids: string[];
  wheelSegment: WheelSegment | null;
  wheelSpunAt: string | null;
  fishingEndsAt: string | null;
  powerShopEndsAt: string | null;
  reSpinCount: number;
  resolvedState: (Omit<ResolvedState, "resolvedAt"> & { resolvedAt: string | null }) | null;
  resolution: "wheel" | "golden-hook" | "none" | null;
  winnerUid: string | null;
  resolvedAt: string | null;
};

type StoredPowerPoints = { balance: number; earned: number };
type StoredPowerAction = { type: PowerActionType; targetUid: string | null; cost: number; submittedAt: string };

type StoredFishCatch = {
  catchCount: number;
  lastCatchAt: string | null;
  updatedAt: string | null;
};

type StoredTreasureGame = {
  id: string;
  status: TreasureGameStatus;
  startedAt: string;
  durationSec: 60 | 90 | 120 | 180;
  endsAt: string | null;
  activityModifier: TreasureModifier | null;
  ignoredUids: string[];
  reSpinCount: number;
  resolvedState: (Omit<TreasureResolvedState, "resolvedAt"> & { resolvedAt: string | null }) | null;
  resolution: "wheel" | null;
  winnerUid: string | null;
  resolvedAt: string | null;
  achievements: AchievementResult[] | null;
};

type StoredTreasurePlayerState = Omit<TreasurePlayerState, "lastActionAt" | "updatedAt"> & {
  lastActionAt: string | null;
  updatedAt: string | null;
};

type StoredTreasurePowerAction = { type: TreasurePowerActionType; cost: number; submittedAt: string };

type StoredAttack = {
  id: string;
  attackerUid: string;
  targetUid: string;
  itemType: BattleItemType;
  status: AttackStatus;
  tcDelta: number;
  createdAt: string;
  resolvedAt: string | null;
};

type StoredBattleFeedEvent = {
  id: string;
  type: BattleFeedEventType;
  actorUid: string;
  targetUid: string | null;
  itemType: BattleItemType | null;
  tcDelta: number | null;
  createdAt: string;
};

type StoredReaction = { id: string; uid: string; type: ReactionType; createdAt: string };

type MockState = {
  session: string | null;
  profiles: Record<string, string>;
  boards: Record<string, StoredBoard>;
  members: Record<string, Record<string, StoredMember>>;
  cards: Record<string, Record<string, StoredCard>>;
  actionItems?: Record<string, Record<string, StoredActionItem>>;
  sessionSnapshots?: Record<string, Record<string, StoredSessionSnapshot>>;
  /** Voter documents per board (F26); absent in states saved before voting existed. */
  votes?: Record<string, Record<string, string[]>>;
  /** Self ratings per board (F28); absent in states saved before ratings existed. */
  ratings?: Record<string, Record<string, number>>;
  /** Crowded Farm rounds and choices per board (F30); absent in states saved before the game existed. */
  farmGames?: Record<string, Record<string, StoredFarmGame>>;
  farmChoices?: Record<string, Record<string, Record<string, FarmFieldId>>>;
  /** Fishing Festival games per board; absent in states saved before this feature existed. */
  fishGames?: Record<string, Record<string, StoredFishingGame>>;
  fishCatches?: Record<string, Record<string, Record<string, StoredFishCatch>>>;
  fishPowerPoints?: Record<string, Record<string, Record<string, StoredPowerPoints>>>;
  fishPowerActions?: Record<string, Record<string, Record<string, StoredPowerAction>>>;
  /** Treasure Rush Chaos Battle; absent in states saved before this feature existed. */
  treasureGames?: Record<string, Record<string, StoredTreasureGame>>;
  treasurePlayerStates?: Record<string, Record<string, Record<string, StoredTreasurePlayerState>>>;
  treasureChestBoards?: Record<string, Record<string, Record<string, TreasureChest[]>>>;
  treasurePowerPoints?: Record<string, Record<string, Record<string, StoredPowerPoints>>>;
  treasurePowerActions?: Record<string, Record<string, Record<string, StoredTreasurePowerAction>>>;
  battleInventories?: Record<string, Record<string, Record<string, BattleItemType[]>>>;
  battleAttacks?: Record<string, Record<string, Record<string, StoredAttack>>>;
  battleFeed?: Record<string, Record<string, StoredBattleFeedEvent[]>>;
  battleReactions?: Record<string, Record<string, StoredReaction[]>>;
  counter: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type Unsubscribe = () => void;
type CardViewer = { uid: string; isAdmin: boolean };

export type MockBackendOptions = {
  storage?: StorageLike;
  now?: () => Date;
};

function addMockPlayers(members: Record<string, StoredMember>, joinedAt: string): void {
  if (Object.keys(members).some((uid) => uid !== MOCK_ADMIN_UID)) return;
  for (const [uid, displayName] of MOCK_PLAYERS) {
    members[uid] ??= { uid, role: "member", displayName, joinedAt };
  }
}

function seedState(): MockState {
  return {
    session: null,
    profiles: { [MOCK_ADMIN_UID]: "Aomsin", "mock-ploy": "Ploy", "mock-nok": "Nok", "mock-kai": "Kai", "mock-may": "May", "mock-pim": "Pim", "mock-ton": "Ton" },
    boards: {},
    members: {},
    cards: {},
    counter: 0,
  };
}

function isMockState(value: unknown): value is MockState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<MockState>;
  return (
    typeof state.counter === "number" &&
    typeof state.profiles === "object" && state.profiles !== null &&
    typeof state.boards === "object" && state.boards !== null &&
    typeof state.members === "object" && state.members !== null &&
    typeof state.cards === "object" && state.cards !== null
  );
}

function loadState(storage: StorageLike | undefined): MockState {
  if (!storage) return seedState();
  try {
    const raw = storage.getItem(MOCK_STATE_KEY);
    if (!raw) return seedState();
    const parsed: unknown = JSON.parse(raw);
    if (!isMockState(parsed)) return seedState();
    for (const [key, collection] of Object.entries(parsed)) {
      if (key === "profiles" || key === "session" || key === "counter") continue;
      if (collection && typeof collection === "object") {
        const boardData = collection as Record<string, unknown>;
        delete boardData.sprint23;
        delete boardData.sprint13;
      }
    }
    const fresh = seedState();
    for (const boardId of Object.keys(parsed.members)) {
      parsed.members[boardId] = { ...(fresh.members[boardId] ?? {}), ...parsed.members[boardId] };
    }
    for (const [boardId, board] of Object.entries(parsed.boards)) {
      if (board.ownerId === MOCK_ADMIN_UID) {
        addMockPlayers((parsed.members[boardId] ??= {}), board.createdAt);
      }
    }
    return parsed;
  } catch {
    return seedState();
  }
}

export function createMockBackend(options: MockBackendOptions = {}) {
  const now = options.now ?? (() => new Date());
  const state = loadState(options.storage);
  const listeners = new Set<() => void>();
  const authListeners = new Set<(user: MockUser | null) => void>();

  function save(): void {
    try {
      options.storage?.setItem(MOCK_STATE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be full or blocked; the in-memory state still works.
    }
  }

  function changed(): void {
    save();
    for (const listener of [...listeners]) listener();
  }

  function nextId(prefix: string): string {
    state.counter += 1;
    return `${prefix}${state.counter}`;
  }

  function toUser(uid: string): MockUser {
    return {
      uid,
      email: uid === MOCK_ADMIN_UID ? ADMIN_EMAIL : `${uid}@example.test`,
      emailVerified: true,
      displayName: state.profiles[uid] ?? "Mock player",
      photoURL: uid === MOCK_ADMIN_UID ? MOCK_ADMIN_PHOTO : null,
    };
  }

  function currentUser(): MockUser | null {
    return state.session ? toUser(state.session) : null;
  }

  function subscribe<T>(read: () => T, onValue: (value: T) => void, onError: (error: unknown) => void): Unsubscribe {
    let isActive = true;
    const emit = () => {
      if (!isActive) return;
      try {
        onValue(read());
      } catch (error) {
        onError(error);
      }
    };
    listeners.add(emit);
    queueMicrotask(emit);
    return () => {
      isActive = false;
      listeners.delete(emit);
    };
  }

  function toBoard(stored: StoredBoard): Board {
    return {
      id: stored.id,
      title: stored.title,
      ownerId: stored.ownerId,
      status: stored.status,
      currentSessionId: stored.currentSessionId ?? null,
      timerEndsAt: stored.timerEndsAt ? new Date(stored.timerEndsAt) : null,
      timerDurationSec: stored.timerDurationSec ?? null,
      ratingRound: stored.ratingRound && Number.isFinite(Date.parse(stored.ratingRound.endsAt)) && Number.isInteger(stored.ratingRound.durationSec) && stored.ratingRound.durationSec >= 1 && stored.ratingRound.durationSec <= 7200 && typeof stored.ratingRound.revealed === "boolean"
        ? { ...stored.ratingRound, endsAt: new Date(stored.ratingRound.endsAt) }
        : null,
      phase: clampPhase(stored.phase),
      nextHostUid: stored.nextHostUid ?? null,
      nextHostSpunAt: stored.nextHostSpunAt ? new Date(stored.nextHostSpunAt) : null,
      farmActiveGameId: stored.farmActiveGameId ?? null,
      chaosActiveGameId: stored.chaosActiveGameId ?? null,
      nextHostGameId: stored.nextHostGameId ?? null,
      hostUid: stored.hostUid ?? null,
      pastHostUids: [...(stored.pastHostUids ?? [])],
    };
  }

  function toMember(stored: StoredMember): BoardMember {
    return { uid: stored.uid, role: stored.role, displayName: stored.displayName, joinedAt: new Date(stored.joinedAt) };
  }

  function toFarmGame(stored: StoredFarmGame): FarmGame {
    return {
      id: stored.id,
      startedAt: new Date(stored.startedAt),
      status: stored.status,
      resolution: stored.resolution ?? null,
      winnerUid: stored.winnerUid ?? null,
    };
  }

  function denied(message: string): Error {
    return Object.assign(new Error(message), { code: "permission-denied" });
  }

  function farmGamesOf(boardId: string): Record<string, StoredFarmGame> {
    return ((state.farmGames ??= {})[boardId] ??= {});
  }

  function farmChoicesOf(boardId: string, gameId: string): Record<string, FarmFieldId> {
    return (((state.farmChoices ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function farmDeadline(game: StoredFarmGame): number {
    return Date.parse(game.startedAt) + FARM_SELECTION_SECONDS * 1000;
  }

  function fishGamesOf(boardId: string): Record<string, StoredFishingGame> {
    return ((state.fishGames ??= {})[boardId] ??= {});
  }

  function fishCatchesOf(boardId: string, gameId: string): Record<string, StoredFishCatch> {
    return (((state.fishCatches ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function fishPowerPointsOf(boardId: string, gameId: string): Record<string, StoredPowerPoints> {
    return (((state.fishPowerPoints ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function fishPowerActionsOf(boardId: string, gameId: string): Record<string, StoredPowerAction> {
    return (((state.fishPowerActions ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function toFishingGame(gameId: string, stored: StoredFishingGame): FishingGame {
    const rs = stored.resolvedState;
    return {
      id: gameId,
      gameType: "fishing",
      status: stored.status,
      startedAt: new Date(stored.startedAt),
      wheelSegment: stored.wheelSegment,
      wheelSpunAt: stored.wheelSpunAt ? new Date(stored.wheelSpunAt) : null,
      fishingEndsAt: stored.fishingEndsAt ? new Date(stored.fishingEndsAt) : null,
      fishingDurationSec: stored.fishingDurationSec,
      ignoredUids: [...stored.ignoredUids],
      powerShopEndsAt: stored.powerShopEndsAt ? new Date(stored.powerShopEndsAt) : null,
      reSpinCount: stored.reSpinCount,
      resolvedState: rs
        ? { ...rs, resolvedAt: rs.resolvedAt ? new Date(rs.resolvedAt) : null }
        : null,
      resolution: stored.resolution,
      winnerUid: stored.winnerUid,
      resolvedAt: stored.resolvedAt ? new Date(stored.resolvedAt) : null,
    };
  }

  function toFishCatch(uid: string, stored: StoredFishCatch): FishCatch {
    return {
      uid,
      catchCount: stored.catchCount,
      lastCatchAt: stored.lastCatchAt ? new Date(stored.lastCatchAt) : null,
      updatedAt: stored.updatedAt ? new Date(stored.updatedAt) : null,
    };
  }

  function isFarmPlayerOf(boardId: string, uid: string, game: StoredFarmGame): boolean {
    const member = state.members[boardId]?.[uid];
    return member !== undefined && Date.parse(member.joinedAt) < Date.parse(game.startedAt);
  }

  function isHostExcluded(board: StoredBoard, uid: string): boolean {
    return excludedHostUids({ ownerId: board.ownerId, hostUid: board.hostUid ?? null, pastHostUids: board.pastHostUids ?? [] }).includes(uid);
  }

  /** The board in step 5 and in progress, as the Rules require for every farm write. */
  function farmBoardOrThrow(boardId: string): StoredBoard {
    const board = boardOrThrow(boardId);
    if (board.status !== "in-progress" || clampPhase(board.phase) !== 5) {
      throw new FarmError("not-active", "The board is not in step 5");
    }
    return board;
  }

  function toCard(stored: StoredCard): BoardCard {
    return {
      id: stored.id,
      columnId: stored.columnId,
      text: stored.text,
      authorId: stored.authorId,
      hidden: stored.hidden,
      groupId: stored.groupId ?? null,
      createdAt: new Date(stored.createdAt),
    };
  }

  function boardOrThrow(boardId: string): StoredBoard {
    const board = state.boards[boardId];
    if (!board) throw new Error(`Mock board not found: ${boardId}`);
    return board;
  }

  function treasureGamesOf(boardId: string): Record<string, StoredTreasureGame> {
    return ((state.treasureGames ??= {})[boardId] ??= {});
  }

  function treasurePlayerStatesOf(boardId: string, gameId: string): Record<string, StoredTreasurePlayerState> {
    return (((state.treasurePlayerStates ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function treasureChestBoardsOf(boardId: string, gameId: string): Record<string, TreasureChest[]> {
    return (((state.treasureChestBoards ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function treasurePowerPointsOf(boardId: string, gameId: string): Record<string, StoredPowerPoints> {
    return (((state.treasurePowerPoints ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function treasurePowerActionsOf(boardId: string, gameId: string): Record<string, StoredTreasurePowerAction> {
    return (((state.treasurePowerActions ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function battleInventoriesOf(boardId: string, gameId: string): Record<string, BattleItemType[]> {
    return (((state.battleInventories ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function battleAttacksOf(boardId: string, gameId: string): Record<string, StoredAttack> {
    return (((state.battleAttacks ??= {})[boardId] ??= {})[gameId] ??= {});
  }

  function battleFeedOf(boardId: string, gameId: string): StoredBattleFeedEvent[] {
    return (((state.battleFeed ??= {})[boardId] ??= {})[gameId] ??= []);
  }

  function battleReactionsOf(boardId: string, gameId: string): StoredReaction[] {
    return (((state.battleReactions ??= {})[boardId] ??= {})[gameId] ??= []);
  }

  function emptyPlayerState(uid: string): StoredTreasurePlayerState {
    const t = now().toISOString();
    return {
      uid, openedCount: 0, currentRunPoints: 0, currentRunGem: 0, currentRunCoin: 0,
      currentRunCrown: 0, bankedPoints: 0, gemBanked: 0, coinBanked: 0, crownBanked: 0,
      bankCount: 0, trapHit: false, maxSingleReward: 0, score: 0,
      tcSpentOnItems: 0, attacksSent: 0, attacksBlocked: 0, tcLostToAttacks: 0, frozenUntilMs: null,
      lastActionAt: t, updatedAt: t,
    };
  }

  function toTreasurePlayerState(stored: StoredTreasurePlayerState): TreasurePlayerState {
    return {
      uid: stored.uid,
      openedCount: stored.openedCount,
      currentRunPoints: stored.currentRunPoints,
      currentRunGem: stored.currentRunGem,
      currentRunCoin: stored.currentRunCoin,
      currentRunCrown: stored.currentRunCrown,
      bankedPoints: stored.bankedPoints,
      gemBanked: stored.gemBanked,
      coinBanked: stored.coinBanked,
      crownBanked: stored.crownBanked,
      bankCount: stored.bankCount,
      trapHit: stored.trapHit,
      maxSingleReward: stored.maxSingleReward,
      score: stored.score,
      lastActionAt: stored.lastActionAt ? new Date(stored.lastActionAt) : null,
      updatedAt: stored.updatedAt ? new Date(stored.updatedAt) : null,
      tcSpentOnItems: stored.tcSpentOnItems ?? 0,
      attacksSent: stored.attacksSent ?? 0,
      attacksBlocked: stored.attacksBlocked ?? 0,
      tcLostToAttacks: stored.tcLostToAttacks ?? 0,
      frozenUntilMs: stored.frozenUntilMs ?? null,
    };
  }

  function toTreasureGame(gameId: string, stored: StoredTreasureGame): TreasureGame {
    const rs = stored.resolvedState;
    return {
      id: gameId,
      gameType: "treasure",
      status: stored.status,
      startedAt: stored.startedAt ? new Date(stored.startedAt) : null,
      durationSec: stored.durationSec,
      endsAt: stored.endsAt ? new Date(stored.endsAt) : null,
      activityModifier: stored.activityModifier,
      ignoredUids: [...stored.ignoredUids],
      reSpinCount: stored.reSpinCount,
      resolvedState: rs ? { ...rs, resolvedAt: rs.resolvedAt ? new Date(rs.resolvedAt) : null } : null,
      resolution: stored.resolution,
      winnerUid: stored.winnerUid,
      resolvedAt: stored.resolvedAt ? new Date(stored.resolvedAt) : null,
      achievements: stored.achievements ? [...stored.achievements] : null,
    };
  }

  /** All non-hidden cards are readable regardless of phase; phase restriction was moved to the UI layer (D126 updated). */
  function othersAreRevealed(_boardId: string): boolean {
    return true;
  }

  function cardsOf(boardId: string): Record<string, StoredCard> {
    return (state.cards[boardId] ??= {});
  }

  return {
    getCurrentUser: currentUser,

    onAuthChange(onUser: (user: MockUser | null) => void): Unsubscribe {
      authListeners.add(onUser);
      let isActive = true;
      queueMicrotask(() => isActive && onUser(currentUser()));
      return () => {
        isActive = false;
        authListeners.delete(onUser);
      };
    },

    async signIn(): Promise<MockUser> {
      state.session = MOCK_ADMIN_UID;
      save();
      const user = toUser(MOCK_ADMIN_UID);
      for (const listener of [...authListeners]) listener(user);
      return user;
    },

    async signOut(): Promise<void> {
      state.session = null;
      save();
      for (const listener of [...authListeners]) listener(null);
    },

    async getPlayerName(uid: string): Promise<string | null> {
      return state.profiles[uid] ?? null;
    },

    async savePlayerName(uid: string, rawName: string): Promise<string> {
      const playerName = normalizePlayerName(rawName);
      if (!isValidPlayerName(playerName)) throw new Error("Invalid player name");
      if (state.profiles[uid]) throw new Error("The player name can be set once");
      state.profiles[uid] = playerName;
      changed();
      return playerName;
    },

    async createBoard(uid: string, title: string, playerName: string): Promise<string> {
      const id = nextId("board");
      const createdAt = now().toISOString();
      state.boards[id] = { id, title, ownerId: uid, status: "waiting", createdAt };
      state.members[id] = { [uid]: { uid, role: "owner", displayName: playerName, joinedAt: createdAt } };
      if (uid === MOCK_ADMIN_UID) addMockPlayers(state.members[id], createdAt);
      changed();
      return id;
    },

    async startSession(boardId: string): Promise<void> {
      const board = boardOrThrow(boardId);
      board.status = "in-progress";
      board.currentSessionId = nextId("session");
      changed();
    },

    subscribeToVotes(boardId: string, onVoters: (voters: Voter[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () => Object.entries(state.votes?.[boardId] ?? {}).map(([uid, cardIds]) => ({ uid, cardIds: [...cardIds] })),
        onVoters,
        onError,
      );
    },

    subscribeToActionItems(boardId: string, cb: (items: ActionItem[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => Object.values(state.actionItems?.[boardId] ?? {}).map((item) => ({ ...item, createdAt: new Date(item.createdAt), completedAt: item.completedAt ? new Date(item.completedAt) : null })), cb, onError);
    },

    subscribeToSessionSnapshots(boardId: string, cb: (items: SessionSnapshot[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => Object.values(state.sessionSnapshots?.[boardId] ?? {}).map((item) => ({ ...item, categoryCounts: { ...item.categoryCounts }, completedAt: new Date(item.completedAt) })).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()), cb, onError);
    },

    async createActionItem(boardId: string, text: string, dueDate: string): Promise<void> {
      if (currentUser()?.uid !== MOCK_ADMIN_UID && currentUser()?.uid !== boardOrThrow(boardId).ownerId) throw denied("Only the board owner can add action items");
      if (text.trim().length === 0 || text.trim().length > 500 || !isValidDueDate(dueDate)) throw new Error("กรุณาตรวจสอบรายการและวันครบกำหนด");
      const id = nextId("action");
      ((state.actionItems ??= {})[boardId] ??= {})[id] = { id, text: text.trim(), dueDate, status: "not-started", createdAt: now().toISOString(), completedAt: null };
      changed();
    },

    async setActionItemStatus(boardId: string, itemId: string, status: ActionItemStatus): Promise<void> {
      if (currentUser()?.uid !== MOCK_ADMIN_UID && currentUser()?.uid !== boardOrThrow(boardId).ownerId) throw denied("Only the board owner can update action items");
      if (!ACTION_ITEM_STATUSES.includes(status)) throw new Error("สถานะรายการไม่ถูกต้อง");
      const item = state.actionItems?.[boardId]?.[itemId];
      if (!item) throw new Error("Action item not found");
      item.status = status;
      item.completedAt = status === "completed" ? now().toISOString() : null;
      changed();
    },

    async editActionItem(boardId: string, itemId: string, text: string, dueDate: string): Promise<void> {
      if (currentUser()?.uid !== MOCK_ADMIN_UID && currentUser()?.uid !== boardOrThrow(boardId).ownerId) throw denied("Only the board owner can edit action items");
      if (text.trim().length === 0 || text.trim().length > 500 || !isValidDueDate(dueDate)) throw new Error("กรุณาตรวจสอบรายการและวันครบกำหนด");
      const item = state.actionItems?.[boardId]?.[itemId];
      if (!item) throw new Error("Action item not found");
      item.text = text.trim();
      item.dueDate = dueDate;
      changed();
    },

    async saveMyVotes(boardId: string, uid: string, cardIds: string[]): Promise<void> {
      // Same rules as firestore.rules: member, in-progress board, step 3, at most 3 distinct ids (D135, D137).
      const board = boardOrThrow(boardId);
      const isDistinct = new Set(cardIds).size === cardIds.length;
      if (
        !state.members[boardId]?.[uid] ||
        board.status !== "in-progress" ||
        clampPhase(board.phase) !== 3 ||
        cardIds.length > VOTES_PER_MEMBER ||
        !isDistinct
      ) {
        throw Object.assign(new Error("Voting is closed or not allowed"), { code: "permission-denied" });
      }
      ((state.votes ??= {})[boardId] ??= {})[uid] = [...cardIds];
      changed();
    },

    subscribeToRatings(boardId: string, onRatings: (ratings: Rating[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () => Object.entries(state.ratings?.[boardId] ?? {}).map(([uid, score]) => ({ uid, score })),
        onRatings,
        onError,
      );
    },

    async saveMyRating(boardId: string, uid: string, score: number): Promise<void> {
      // Same rules as firestore.rules: member, in-progress board, step 4, score 1 to 5 in steps of 0.5 (D145, D146).
      const board = boardOrThrow(boardId);
      if (
        !state.members[boardId]?.[uid] ||
        board.status !== "in-progress" ||
        clampPhase(board.phase) !== 4 ||
        !isValidRating(score)
      ) {
        throw Object.assign(new Error("Rating is closed or not allowed"), { code: "permission-denied" });
      }
      ((state.ratings ??= {})[boardId] ??= {})[uid] = score;
      changed();
    },

    async setPhase(boardId: string, phase: number): Promise<void> {
      boardOrThrow(boardId).phase = clampPhase(phase);
      changed();
    },

    async spinNextHost(boardId: string, winnerUid: string): Promise<void> {
      // Same rules as firestore.rules: in-progress board, step 5, winner is a member (D149).
      const board = boardOrThrow(boardId);
      if (
        board.status !== "in-progress" ||
        clampPhase(board.phase) !== 5 ||
        board.farmActiveGameId ||
        !state.members[boardId]?.[winnerUid]
      ) {
        throw Object.assign(new Error("The wheel is closed or the winner is not a member"), { code: "permission-denied" });
      }
      board.nextHostUid = winnerUid;
      board.nextHostSpunAt = now().toISOString();
      changed();
    },

    newFarmGameId(boardId: string): string {
      boardOrThrow(boardId);
      return nextId("game");
    },

    subscribeToFarmGame(boardId: string, gameId: string, onGame: (game: FarmGame | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => {
        const stored = state.farmGames?.[boardId]?.[gameId];
        return stored ? toFarmGame(stored) : null;
      }, onGame, onError);
    },

    subscribeToMyFarmChoice(boardId: string, gameId: string, uid: string, onChoice: (field: FarmFieldId | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => state.farmChoices?.[boardId]?.[gameId]?.[uid] ?? null, onChoice, onError);
    },

    /** Like the Rules, the listing is refused until the deadline has passed. */
    subscribeToFarmChoices(boardId: string, gameId: string, onChoices: (choices: FarmChoice[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => {
        const game = state.farmGames?.[boardId]?.[gameId];
        if (!game || now().getTime() < farmDeadline(game)) throw denied("Choices are private until the deadline");
        return Object.entries(state.farmChoices?.[boardId]?.[gameId] ?? {}).map(([uid, field]) => ({ uid, field }));
      }, onChoices, onError);
    },

    async chooseFarmField(boardId: string, gameId: string, uid: string, field: FarmFieldId): Promise<void> {
      const board = boardOrThrow(boardId);
      const game = state.farmGames?.[boardId]?.[gameId];
      if (
        board.status !== "in-progress" ||
        clampPhase(board.phase) !== 5 ||
        board.farmActiveGameId !== gameId ||
        !game ||
        game.status !== "selecting" ||
        now().getTime() >= farmDeadline(game) ||
        !isFarmPlayerOf(boardId, uid, game) ||
        !isFarmFieldId(field)
      ) {
        throw denied("Choosing is closed or not allowed");
      }
      farmChoicesOf(boardId, gameId)[uid] = field;
      changed();
    },

    async startFarmGame(boardId: string, gameId: string): Promise<void> {
      const board = farmBoardOrThrow(boardId);
      const previous = board.farmActiveGameId ? farmGamesOf(boardId)[board.farmActiveGameId] : undefined;
      if (board.farmActiveGameId) {
        const mayStart =
          previous?.status === "finished" ||
          (previous?.status === "cancelled" && board.nextHostGameId === board.farmActiveGameId);
        if (!mayStart) {
          throw new FarmError(
            previous?.status === "cancelled" ? "fallback-pending" : "round-in-progress",
            "The previous round is not resolved",
          );
        }
      }
      farmGamesOf(boardId)[gameId] = { id: gameId, startedAt: now().toISOString(), status: "selecting" };
      board.farmActiveGameId = gameId;
      changed();
    },

    async finishFarmGame(boardId: string, gameId: string, winnerUid: string, resolution: FarmResolution): Promise<void> {
      const board = farmBoardOrThrow(boardId);
      const game = farmGamesOf(boardId)[gameId];
      if (board.farmActiveGameId !== gameId || !game) throw new FarmError("not-active", "This round is not the active round");
      if (board.nextHostGameId === gameId || game.status === "finished") {
        throw new FarmError("already-resolved", "This round already has a result");
      }
      if (game.status !== "selecting") throw new FarmError("not-active", "This round was cancelled");
      if (!isFarmPlayerOf(boardId, winnerUid, game)) throw new FarmError("not-eligible", "The winner did not play this round");
      if (isHostExcluded(board, winnerUid)) throw new FarmError("host-excluded", "The current or a previous Host cannot be next Host");
      if (now().getTime() < farmDeadline(game)) throw denied("The selection time has not ended");
      game.status = "finished";
      game.resolution = resolution;
      game.winnerUid = winnerUid;
      board.nextHostUid = winnerUid;
      board.nextHostGameId = gameId;
      if (resolution !== "direct") board.nextHostSpunAt = now().toISOString();
      changed();
    },

    async handOverHost(boardId: string): Promise<void> {
      const board = farmBoardOrThrow(boardId);
      const nextHostUid = board.nextHostUid;
      if (!nextHostUid || (board.farmActiveGameId && board.nextHostGameId !== board.farmActiveGameId)) {
        throw new FarmError("no-next-host", "There is no stored next Host to hand over to");
      }
      if (isHostExcluded(board, nextHostUid)) throw new FarmError("host-excluded", "This person already is or was the Host");
      board.pastHostUids = [...(board.pastHostUids ?? []), board.hostUid ?? board.ownerId];
      board.hostUid = nextHostUid;
      changed();
    },

    async cancelFarmGame(boardId: string, gameId: string): Promise<void> {
      const board = farmBoardOrThrow(boardId);
      const game = farmGamesOf(boardId)[gameId];
      if (board.farmActiveGameId !== gameId || !game) throw new FarmError("not-active", "This round is not the active round");
      if (game.status !== "selecting") throw new FarmError("already-resolved", "This round already ended");
      game.status = "cancelled";
      changed();
    },

    async storeCancelledFarmFallback(boardId: string, gameId: string, winnerUid: string): Promise<void> {
      const board = farmBoardOrThrow(boardId);
      const game = farmGamesOf(boardId)[gameId];
      if (board.farmActiveGameId !== gameId || game?.status !== "cancelled") {
        throw new FarmError("not-active", "This round is not the active cancelled round");
      }
      if (board.nextHostGameId === gameId) throw new FarmError("already-resolved", "The fallback result is already stored");
      if (!isFarmPlayerOf(boardId, winnerUid, game)) throw new FarmError("not-eligible", "The winner did not play this round");
      if (isHostExcluded(board, winnerUid)) throw new FarmError("host-excluded", "The current or a previous Host cannot be next Host");
      board.nextHostUid = winnerUid;
      board.nextHostGameId = gameId;
      board.nextHostSpunAt = now().toISOString();
      changed();
    },

    async startFishingGame(boardId: string, durationSec: 30 | 45 | 60): Promise<void> {
      const board = boardOrThrow(boardId);
      const gameId = nextId("fishgame");
      fishGamesOf(boardId)[gameId] = {
        id: gameId,
        startedAt: now().toISOString(),
        status: "selecting-wheel",
        fishingDurationSec: durationSec,
        ignoredUids: [],
        wheelSegment: null,
        wheelSpunAt: null,
        fishingEndsAt: null,
        powerShopEndsAt: null,
        reSpinCount: 0,
        resolvedState: null,
        resolution: null,
        winnerUid: null,
        resolvedAt: null,
      };
      board.farmActiveGameId = gameId;
      changed();
    },

    async spinActivityWheel(boardId: string, gameId: string, segment: WheelSegment): Promise<void> {
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      game.wheelSegment = segment;
      game.wheelSpunAt = now().toISOString();
      game.status = "fishing";
      // Base the window on the spin time, not on game creation, so the full duration is always available.
      game.fishingEndsAt = new Date(now().getTime() + game.fishingDurationSec * 1000).toISOString();
      changed();
    },

    async recordCatch(boardId: string, gameId: string, uid: string): Promise<void> {
      const catches = fishCatchesOf(boardId, gameId);
      const existing = catches[uid];
      if (existing) {
        existing.catchCount += 1;
        existing.lastCatchAt = now().toISOString();
        existing.updatedAt = now().toISOString();
      } else {
        catches[uid] = { catchCount: 1, lastCatchAt: now().toISOString(), updatedAt: now().toISOString() };
      }
      changed();
    },

    async endFishing(boardId: string, gameId: string): Promise<void> {
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      game.status = "scoring";
      changed();
    },

    async finishFishingGame(boardId: string, gameId: string, winnerUid: string): Promise<void> {
      const board = boardOrThrow(boardId);
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      game.status = "finished";
      game.resolution = "wheel";
      game.winnerUid = winnerUid;
      game.resolvedAt = now().toISOString();
      board.nextHostUid = winnerUid;
      board.nextHostGameId = gameId;
      board.nextHostSpunAt = now().toISOString();
      changed();
    },

    async setIgnoredUids(boardId: string, gameId: string, uids: string[]): Promise<void> {
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      game.ignoredUids = [...uids];
      changed();
    },

    subscribeToFishingGame(
      boardId: string,
      gameId: string,
      cb: (game: FishingGame | null) => void,
      onError: (error: unknown) => void,
    ): Unsubscribe {
      return subscribe(() => {
        const stored = state.fishGames?.[boardId]?.[gameId];
        return stored ? toFishingGame(gameId, stored) : null;
      }, cb, onError);
    },

    subscribeToFishCatches(
      boardId: string,
      gameId: string,
      cb: (catches: FishCatch[]) => void,
      onError: (error: unknown) => void,
    ): Unsubscribe {
      return subscribe(() => {
        const catchMap = state.fishCatches?.[boardId]?.[gameId] ?? {};
        return Object.entries(catchMap).map(([uid, stored]) => toFishCatch(uid, stored));
      }, cb, onError);
    },

    async lockPowerPoints(
      boardId: string,
      gameId: string,
      points: { uid: string; balance: number; earned: number }[],
    ): Promise<void> {
      const pp = fishPowerPointsOf(boardId, gameId);
      for (const p of points) pp[p.uid] = { balance: p.balance, earned: p.earned };
      changed();
    },

    async submitPowerAction(
      boardId: string,
      gameId: string,
      uid: string,
      type: PowerActionType,
      targetUid: string | null,
    ): Promise<void> {
      const pp = fishPowerPointsOf(boardId, gameId);
      const pa = fishPowerActionsOf(boardId, gameId);
      if (pa[uid]) throw denied("A Power Action was already submitted this round");
      const balance = pp[uid]?.balance ?? 0;
      const cost = POWER_ACTION_COSTS[type];
      if (balance < cost) throw denied("Insufficient Power Points");
      pa[uid] = { type, targetUid: targetUid ?? null, cost, submittedAt: now().toISOString() };
      if (pp[uid]) pp[uid].balance = balance - cost;
      changed();
    },

    async resolveAndTransitionToWheel(
      boardId: string,
      gameId: string,
      resolvedState: Omit<ResolvedState, "resolvedAt">,
    ): Promise<void> {
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      game.status = "wheel";
      game.resolvedState = { ...resolvedState, resolvedAt: now().toISOString() };
      changed();
    },

    async spinFishingHostWheel(
      boardId: string,
      gameId: string,
      winnerUid: string,
      resolution: "wheel" | "golden-hook",
    ): Promise<void> {
      const board = boardOrThrow(boardId);
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      game.status = "finished";
      game.resolution = resolution;
      game.winnerUid = winnerUid;
      game.resolvedAt = now().toISOString();
      board.nextHostUid = winnerUid;
      board.nextHostGameId = gameId;
      board.nextHostSpunAt = now().toISOString();
      changed();
    },

    async reSpinFishingHostWheel(boardId: string, gameId: string): Promise<number> {
      const game = fishGamesOf(boardId)[gameId];
      if (!game) throw denied("Fishing game not found");
      if (game.reSpinCount >= 2) throw denied("Re-spin limit reached");
      game.reSpinCount += 1;
      changed();
      return game.reSpinCount;
    },

    subscribeToFishingPowerPoints(
      boardId: string,
      gameId: string,
      cb: (points: PowerPoints[]) => void,
      onError: (error: unknown) => void,
    ): Unsubscribe {
      return subscribe(() => {
        const ppMap = state.fishPowerPoints?.[boardId]?.[gameId] ?? {};
        return Object.entries(ppMap).map(([uid, stored]) => ({
          uid,
          balance: stored.balance,
          earned: stored.earned,
          updatedAt: null,
        }));
      }, cb, onError);
    },

    subscribeToFishingPowerActions(
      boardId: string,
      gameId: string,
      cb: (actions: PowerAction[]) => void,
      onError: (error: unknown) => void,
    ): Unsubscribe {
      return subscribe(() => {
        const paMap = state.fishPowerActions?.[boardId]?.[gameId] ?? {};
        return Object.entries(paMap).map(([uid, stored]) => ({
          uid,
          type: stored.type,
          targetUid: stored.targetUid,
          cost: stored.cost,
          submittedAt: new Date(stored.submittedAt),
          updatedAt: null,
        }));
      }, cb, onError);
    },

    async startTimer(boardId: string, minutes: number): Promise<void> {
      const board = boardOrThrow(boardId);
      board.timerEndsAt = new Date(now().getTime() + minutes * 60_000).toISOString();
      board.timerDurationSec = Math.round(minutes * 60);
      changed();
    },

    async stopTimer(boardId: string): Promise<void> {
      const board = boardOrThrow(boardId);
      board.timerEndsAt = null;
      board.timerDurationSec = null;
      changed();
    },

    async startRatingTimer(boardId: string, minutes: number): Promise<void> {
      const board = boardOrThrow(boardId);
      if (currentUser()?.uid !== MOCK_ADMIN_UID || board.status !== "in-progress" || clampPhase(board.phase) !== 4 || !Number.isInteger(minutes) || minutes < 1 || minutes > 120 || board.ratingRound?.revealed) throw denied("ไม่สามารถเริ่มจับเวลาคะแนนได้");
      board.ratingRound = { endsAt: new Date(now().getTime() + minutes * 60_000).toISOString(), durationSec: minutes * 60, revealed: false };
      changed();
    },

    async stopRatingTimer(boardId: string): Promise<void> {
      const board = boardOrThrow(boardId);
      if (currentUser()?.uid !== MOCK_ADMIN_UID || board.status !== "in-progress" || clampPhase(board.phase) !== 4 || !board.ratingRound || board.ratingRound.revealed || Date.parse(board.ratingRound.endsAt) <= now().getTime()) throw denied("ไม่สามารถยกเลิกเวลาคะแนนได้");
      board.ratingRound = null;
      changed();
    },

    async revealRatings(boardId: string): Promise<void> {
      const board = boardOrThrow(boardId);
      if (currentUser()?.uid !== MOCK_ADMIN_UID || board.status !== "in-progress" || clampPhase(board.phase) !== 4 || !board.ratingRound || board.ratingRound.revealed || Date.parse(board.ratingRound.endsAt) > now().getTime()) throw denied("คะแนนจะเปิดได้เมื่อหมดเวลาและแอดมินอนุมัติเท่านั้น");
      board.ratingRound.revealed = true;
      changed();
    },

    async completeSession(boardId: string): Promise<void> {
      const board = boardOrThrow(boardId);
      const completedAt = now();
      const sessionId = board.currentSessionId ?? nextId("session");
      const cards: BoardCard[] = Object.values(state.cards[boardId] ?? {}).filter((card) => !card.hidden).map((card) => ({ id: card.id, columnId: card.columnId, text: card.text, authorId: card.authorId, hidden: false, groupId: card.groupId ?? null, createdAt: new Date(card.createdAt) }));
      const items: ActionItem[] = Object.values(state.actionItems?.[boardId] ?? {}).map((item) => ({ ...item, createdAt: new Date(item.createdAt), completedAt: item.completedAt ? new Date(item.completedAt) : null }));
      const snapshot = makeSessionSnapshot(cards, items, sessionId, completedAt);
      ((state.sessionSnapshots ??= {})[boardId] ??= {})[sessionId] = { ...snapshot, completedAt: completedAt.toISOString() };
      board.currentSessionId = sessionId;
      board.status = "completed";
      changed();
    },

    async resetBoard(boardId: string): Promise<void> {
      const board = boardOrThrow(boardId);
      board.status = "waiting";
      board.phase = 1;
      board.timerEndsAt = null;
      board.timerDurationSec = null;
      board.ratingRound = null;
      board.nextHostUid = null;
      board.nextHostSpunAt = null;
      board.farmActiveGameId = null;
      board.chaosActiveGameId = null;
      board.nextHostGameId = null;
      board.hostUid = null;
      board.pastHostUids = [];
      changed();
    },

    async clearBoard(boardId: string): Promise<void> {
      boardOrThrow(boardId);
      delete state.cards[boardId];
      if (state.votes) delete state.votes[boardId];
      if (state.ratings) delete state.ratings[boardId];
      boardOrThrow(boardId).phase = 1;
      boardOrThrow(boardId).ratingRound = null;
      changed();
    },

    async joinBoard(boardId: string, uid: string, playerName: string): Promise<void> {
      boardOrThrow(boardId);
      (state.members[boardId] ??= {})[uid] = {
        uid,
        role: "member",
        displayName: playerName,
        joinedAt: now().toISOString(),
      };
      changed();
    },

    async getOwnMembership(boardId: string, uid: string): Promise<BoardMember | null> {
      const member = state.members[boardId]?.[uid];
      return member ? toMember(member) : null;
    },

    subscribeToBoard(boardId: string, onBoard: (board: Board | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => (state.boards[boardId] ? toBoard(state.boards[boardId]) : null), onBoard, onError);
    },

    setChaosActiveGameId(boardId: string, gameId: string): void {
      const board = boardOrThrow(boardId);
      if (board.phase !== 5 || !currentUser() || currentUser()?.uid !== MOCK_ADMIN_UID) throw new Error("Only the admin can create a Chaos game in phase 5");
      board.chaosActiveGameId = gameId;
      changed();
    },

    getChaosBoard(boardId: string): Board {
      return toBoard(boardOrThrow(boardId));
    },

    confirmChaosHost(boardId: string, hostUid: string): void {
      const board = boardOrThrow(boardId);
      if (board.phase !== 5 || currentUser()?.uid !== MOCK_ADMIN_UID || !state.members[boardId]?.[hostUid]) throw new Error("Invalid Chaos host confirmation");
      const oldHost = board.hostUid ?? board.ownerId;
      if (hostUid === oldHost) throw new Error("Current host is ineligible");
      board.nextHostUid = hostUid;
      board.nextHostSpunAt = new Date().toISOString();
      board.nextHostGameId = board.chaosActiveGameId ?? null;
      changed();
    },

    subscribeToMembers(boardId: string, onMembers: (members: BoardMember[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () =>
          Object.values(state.members[boardId] ?? {})
            .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
            .map(toMember),
        onMembers,
        onError,
      );
    },

    subscribeToMemberships(uid: string, onBoards: (boards: DashboardBoard[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () =>
          Object.entries(state.members)
            .filter(([boardId, members]) => members[uid] && state.boards[boardId])
            .map(([boardId, members]) => ({
              boardId,
              title: state.boards[boardId].title,
              role: members[uid].role as BoardRole,
              joinedAt: new Date(members[uid].joinedAt),
            }))
            .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime()),
        onBoards,
        onError,
      );
    },

    subscribeToCards(boardId: string, viewer: CardViewer, onCards: (cards: BoardCard[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () =>
          Object.values(cardsOf(boardId))
            .filter((card) => viewer.isAdmin || card.authorId === viewer.uid || (!card.hidden && othersAreRevealed(boardId)))
            .map(toCard)
            .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id)),
        onCards,
        onError,
      );
    },

    async addCard(boardId: string, uid: string, columnId: ColumnId, text: string): Promise<void> {
      // Same rule as firestore.rules: new cards only in step 1 of an in-progress board (D131).
      const board = boardOrThrow(boardId);
      if (board.status !== "in-progress" || clampPhase(board.phase) !== 1) {
        throw Object.assign(new Error("Adding cards is closed"), { code: "permission-denied" });
      }
      const id = nextId("card");
      cardsOf(boardId)[id] = { id, columnId, text, authorId: uid, hidden: false, createdAt: now().toISOString() };
      changed();
    },

    async editCard(boardId: string, cardId: string, text: string): Promise<void> {
      const card = cardsOf(boardId)[cardId];
      if (card) card.text = text;
      changed();
    },

    async deleteCard(boardId: string, cardId: string): Promise<void> {
      delete cardsOf(boardId)[cardId];
      changed();
    },

    async setCardHidden(boardId: string, cardId: string, hidden: boolean): Promise<void> {
      const card = cardsOf(boardId)[cardId];
      if (card) card.hidden = hidden;
      changed();
    },

    async setCardColumn(boardId: string, cardId: string, columnId: ColumnId): Promise<void> {
      const card = cardsOf(boardId)[cardId];
      if (card) card.columnId = columnId;
      changed();
    },

    async stackCards(boardId: string, draggedId: string, targetId: string): Promise<void> {
      const cards = cardsOf(boardId);
      const dragged = cards[draggedId];
      const target = cards[targetId];
      if (!dragged || !target || dragged.id === target.id) return;
      const groupId = target.groupId ?? target.id;
      target.groupId = groupId;
      dragged.groupId = groupId;
      dragged.columnId = target.columnId;
      changed();
    },

    async unstackCard(boardId: string, cardId: string): Promise<void> {
      const card = cardsOf(boardId)[cardId];
      if (card) card.groupId = null;
      changed();
    },

    async listMoveTargetBoards(currentBoardId: string): Promise<MoveTargetBoard[]> {
      return Object.values(state.boards)
        .filter((board) => board.id !== currentBoardId && board.status === "in-progress")
        .map((board) => ({ id: board.id, title: board.title }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    async moveCard(sourceBoardId: string, card: BoardCard, destinationBoardId: string): Promise<void> {
      const source = boardOrThrow(sourceBoardId);
      const destination = boardOrThrow(destinationBoardId);
      if (source.status !== "in-progress" || destination.status !== "in-progress") {
        throw new Error("Cards can only move between in-progress boards");
      }
      const id = nextId("card");
      cardsOf(destinationBoardId)[id] = {
        id,
        columnId: card.columnId,
        text: card.text,
        authorId: card.authorId,
        hidden: card.hidden,
        createdAt: now().toISOString(),
      };
      delete cardsOf(sourceBoardId)[card.id];
      changed();
    },

    // ---- Treasure Rush Chaos Battle ----

    async startTreasureRush(boardId: string, durationSec: 60 | 90 | 120 | 180): Promise<string> {
      const board = boardOrThrow(boardId);
      const gameId = nextId("tgame");
      treasureGamesOf(boardId)[gameId] = {
        id: gameId, status: "preparation", startedAt: now().toISOString(), durationSec,
        endsAt: null, activityModifier: null, ignoredUids: [], reSpinCount: 0,
        resolvedState: null, resolution: null, winnerUid: null, resolvedAt: null, achievements: null,
      };
      board.farmActiveGameId = gameId;
      changed();
      return gameId;
    },

    async spinTreasureWheel(boardId: string, gameId: string, modifier: TreasureModifier): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game) throw denied("Treasure game not found");
      if (game.status !== "preparation") throw denied("Game not in preparation");
      game.activityModifier = modifier;
      game.status = "playing";
      game.endsAt = new Date(now().getTime() + game.durationSec * 1000).toISOString();
      changed();
    },

    async writeChestBoards(boardId: string, gameId: string, boards: { uid: string; chests: TreasureChest[] }[]): Promise<void> {
      const cb = treasureChestBoardsOf(boardId, gameId);
      for (const { uid, chests } of boards) cb[uid] = [...chests];
      changed();
    },

    subscribeToMyChestBoard(boardId: string, gameId: string, uid: string, cb: (chests: TreasureChest[] | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => treasureChestBoardsOf(boardId, gameId)[uid] ?? null, cb, onError);
    },

    async openChest(boardId: string, gameId: string, uid: string, chestIndex: number): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game || game.status !== "playing") throw denied("Game not in playing state");
      if (game.endsAt && now().getTime() >= new Date(game.endsAt).getTime()) throw denied("Game has ended");
      const chests = treasureChestBoardsOf(boardId, gameId)[uid];
      if (!chests || chestIndex < 0 || chestIndex >= chests.length) throw denied("Invalid chest index");
      const ps = treasurePlayerStatesOf(boardId, gameId);
      const existing = ps[uid] ?? emptyPlayerState(uid);
      if (chestIndex !== existing.openedCount) throw denied("Chests must be opened sequentially");
      const chest = chests[chestIndex];
      const isTrap = chest.type === "trap";
      const newRunPoints = Math.max(0, existing.currentRunPoints + chest.basePoints);
      ps[uid] = {
        ...existing,
        openedCount: existing.openedCount + 1,
        currentRunPoints: newRunPoints,
        currentRunGem: existing.currentRunGem + (chest.type === "gem" ? chest.basePoints : 0),
        currentRunCoin: existing.currentRunCoin + (chest.type === "coins" ? chest.basePoints : 0),
        currentRunCrown: existing.currentRunCrown + (chest.type === "crown" ? chest.basePoints : 0),
        trapHit: existing.trapHit || isTrap,
        maxSingleReward: Math.max(existing.maxSingleReward, Math.max(0, chest.basePoints)),
        lastActionAt: now().toISOString(),
        updatedAt: now().toISOString(),
      };
      changed();
    },

    async bankTreasure(boardId: string, gameId: string, uid: string): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game || game.status !== "playing") throw denied("Game not in playing state");
      const ps = treasurePlayerStatesOf(boardId, gameId);
      const existing = ps[uid] ?? emptyPlayerState(uid);
      if (existing.currentRunPoints === 0) return;
      ps[uid] = {
        ...existing,
        bankedPoints: existing.bankedPoints + existing.currentRunPoints,
        gemBanked: existing.gemBanked + existing.currentRunGem,
        coinBanked: existing.coinBanked + existing.currentRunCoin,
        crownBanked: existing.crownBanked + existing.currentRunCrown,
        currentRunPoints: 0, currentRunGem: 0, currentRunCoin: 0, currentRunCrown: 0,
        bankCount: existing.bankCount + 1,
        updatedAt: now().toISOString(),
      };
      changed();
    },

    async endTreasureRush(boardId: string, gameId: string): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game) throw denied("Treasure game not found");
      game.status = "settlement";
      changed();
    },

    subscribeToTreasureGame(boardId: string, gameId: string, cb: (game: TreasureGame | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => {
        const stored = treasureGamesOf(boardId)[gameId];
        return stored ? toTreasureGame(gameId, stored) : null;
      }, cb, onError);
    },

    subscribeToTreasurePlayerStates(boardId: string, gameId: string, cb: (states: TreasurePlayerState[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => Object.values(treasurePlayerStatesOf(boardId, gameId)).map(toTreasurePlayerState), cb, onError);
    },

    async lockTreasureScores(boardId: string, gameId: string, scores: { uid: string; score: number }[]): Promise<void> {
      const ps = treasurePlayerStatesOf(boardId, gameId);
      for (const { uid, score } of scores) {
        const existing = ps[uid] ?? emptyPlayerState(uid);
        ps[uid] = { ...existing, score, updatedAt: now().toISOString() };
      }
      changed();
    },

    async submitTreasurePowerAction(boardId: string, gameId: string, uid: string, type: TreasurePowerActionType): Promise<void> {
      const pp = treasurePowerPointsOf(boardId, gameId);
      const pa = treasurePowerActionsOf(boardId, gameId);
      if (pa[uid]) throw denied("A Power Action was already submitted this round");
      const cost = TREASURE_POWER_ACTION_COSTS[type];
      const balance = pp[uid]?.balance ?? 0;
      if (balance < cost) throw denied("Insufficient Power Points");
      pa[uid] = { type, cost, submittedAt: now().toISOString() };
      if (pp[uid]) pp[uid].balance = balance - cost;
      changed();
    },

    subscribeToTreasurePowerActions(boardId: string, gameId: string, cb: (actions: TreasurePowerAction[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => Object.entries(treasurePowerActionsOf(boardId, gameId)).map(([uid, stored]) => ({
        uid, type: stored.type, cost: stored.cost, submittedAt: new Date(stored.submittedAt), updatedAt: null,
      })), cb, onError);
    },

    async resolveAndTransitionTreasureToWheel(boardId: string, gameId: string, resolvedState: Omit<TreasureResolvedState, "resolvedAt">): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game) throw denied("Treasure game not found");
      game.status = "host_selection";
      game.resolvedState = { ...resolvedState, resolvedAt: now().toISOString() };
      changed();
    },

    async spinTreasureHostWheel(boardId: string, gameId: string, winnerUid: string): Promise<void> {
      const board = boardOrThrow(boardId);
      const game = treasureGamesOf(boardId)[gameId];
      if (!game) throw denied("Treasure game not found");
      game.status = "finished";
      game.resolution = "wheel";
      game.winnerUid = winnerUid;
      game.resolvedAt = now().toISOString();
      board.nextHostUid = winnerUid;
      board.nextHostGameId = gameId;
      board.nextHostSpunAt = now().toISOString();
      changed();
    },

    async reSpinTreasureHostWheel(boardId: string, gameId: string): Promise<number> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game) throw denied("Treasure game not found");
      if (game.reSpinCount >= TREASURE_MAX_RESPINS) throw denied("Re-spin limit reached");
      game.reSpinCount += 1;
      changed();
      return game.reSpinCount;
    },

    async buyBattleItem(boardId: string, gameId: string, uid: string, itemType: BattleItemType): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game || game.status !== "playing") throw denied("Game not in playing state");
      const ps = treasurePlayerStatesOf(boardId, gameId);
      const existing = ps[uid] ?? emptyPlayerState(uid);
      if (existing.frozenUntilMs !== null && existing.frozenUntilMs > now().getTime()) throw denied("Player is frozen");
      const cost = BATTLE_ITEM_COSTS[itemType];
      if (existing.currentRunPoints < cost) throw denied("Insufficient TC");
      const isInstant = itemType === "recovery-potion" || itemType === "golden-pick";
      const inv = battleInventoriesOf(boardId, gameId);
      const slots = inv[uid] ?? [];
      if (!isInstant && slots.length >= 3) throw denied("Inventory is full");
      let newRunPoints = existing.currentRunPoints - cost;
      if (itemType === "recovery-potion") newRunPoints += RECOVERY_POTION_RESTORE;
      if (itemType === "golden-pick") newRunPoints += GOLDEN_PICK_BONUS;
      ps[uid] = { ...existing, currentRunPoints: Math.max(0, newRunPoints), tcSpentOnItems: existing.tcSpentOnItems + cost, updatedAt: now().toISOString() };
      if (!isInstant) inv[uid] = [...slots, itemType];
      battleFeedOf(boardId, gameId).push({ id: nextId("bf"), type: "item-bought", actorUid: uid, targetUid: null, itemType, tcDelta: -cost, createdAt: now().toISOString() });
      changed();
    },

    async useOffensiveItem(boardId: string, gameId: string, attackerUid: string, targetUid: string, itemType: BattleItemType): Promise<string> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game || game.status !== "playing") throw denied("Game not in playing state");
      if (game.endsAt) {
        const timeLeft = new Date(game.endsAt).getTime() - now().getTime();
        if (timeLeft <= FINAL_RUSH_ATTACK_SHUTDOWN_MS) throw denied("Attacks shut down");
      }
      const ps = treasurePlayerStatesOf(boardId, gameId);
      const attacker = ps[attackerUid] ?? emptyPlayerState(attackerUid);
      if (attacker.frozenUntilMs !== null && attacker.frozenUntilMs > now().getTime()) throw denied("Player is frozen");
      const inv = battleInventoriesOf(boardId, gameId);
      const slots = inv[attackerUid] ?? [];
      const idx = slots.indexOf(itemType);
      if (idx === -1) throw denied("Item not in inventory");
      inv[attackerUid] = slots.filter((_, i) => i !== idx);
      ps[attackerUid] = { ...attacker, attacksSent: attacker.attacksSent + 1, updatedAt: now().toISOString() };
      const attackId = nextId("atk");
      battleAttacksOf(boardId, gameId)[attackId] = { id: attackId, attackerUid, targetUid, itemType, status: "warning", tcDelta: 0, createdAt: now().toISOString(), resolvedAt: null };
      battleFeedOf(boardId, gameId).push({ id: nextId("bf"), type: "attack-sent", actorUid: attackerUid, targetUid, itemType, tcDelta: null, createdAt: now().toISOString() });
      changed();
      return attackId;
    },

    async resolveAttack(boardId: string, gameId: string, attackId: string): Promise<void> {
      const attacks = battleAttacksOf(boardId, gameId);
      const attack = attacks[attackId];
      if (!attack) throw denied("Attack not found");
      if (attack.status !== "warning") throw denied("Attack already resolved");
      if (now().getTime() < new Date(attack.createdAt).getTime() + ATTACK_WARNING_MS) throw denied("Warning window still open");
      const ps = treasurePlayerStatesOf(boardId, gameId);
      const target = ps[attack.targetUid] ?? emptyPlayerState(attack.targetUid);
      const attacker = ps[attack.attackerUid] ?? emptyPlayerState(attack.attackerUid);
      let tcDelta = 0;
      if (attack.itemType === "bomb-gift") {
        tcDelta = -Math.min(target.currentRunPoints, BOMB_GIFT_DAMAGE);
        ps[attack.targetUid] = { ...target, currentRunPoints: Math.max(0, target.currentRunPoints + tcDelta), tcLostToAttacks: target.tcLostToAttacks + Math.abs(tcDelta), updatedAt: now().toISOString() };
      } else if (attack.itemType === "sneaky-thief") {
        const steal = Math.min(target.currentRunPoints, SNEAKY_THIEF_MAX_STEAL);
        tcDelta = -steal;
        ps[attack.targetUid] = { ...target, currentRunPoints: Math.max(0, target.currentRunPoints - steal), tcLostToAttacks: target.tcLostToAttacks + steal, updatedAt: now().toISOString() };
        ps[attack.attackerUid] = { ...attacker, currentRunPoints: attacker.currentRunPoints + steal, updatedAt: now().toISOString() };
      } else if (attack.itemType === "ice-trap") {
        ps[attack.targetUid] = { ...target, frozenUntilMs: now().getTime() + ICE_TRAP_DURATION_MS, updatedAt: now().toISOString() };
      } else if (attack.itemType === "chaos-swap") {
        tcDelta = target.currentRunPoints - attacker.currentRunPoints;
        ps[attack.targetUid] = { ...target, currentRunPoints: attacker.currentRunPoints, updatedAt: now().toISOString() };
        ps[attack.attackerUid] = { ...attacker, currentRunPoints: target.currentRunPoints, updatedAt: now().toISOString() };
      }
      attacks[attackId] = { ...attack, status: "resolved", tcDelta, resolvedAt: now().toISOString() };
      battleFeedOf(boardId, gameId).push({ id: nextId("bf"), type: "attack-resolved", actorUid: attack.attackerUid, targetUid: attack.targetUid, itemType: attack.itemType, tcDelta, createdAt: now().toISOString() });
      changed();
    },

    async useDefensiveItemAgainstAttack(boardId: string, gameId: string, uid: string, attackId: string, defenseItemType: BattleItemType): Promise<void> {
      const attacks = battleAttacksOf(boardId, gameId);
      const attack = attacks[attackId];
      if (!attack) throw denied("Attack not found");
      if (attack.status !== "warning") throw denied("Warning window closed");
      if (attack.targetUid !== uid) throw denied("Not the attack target");
      const inv = battleInventoriesOf(boardId, gameId);
      const slots = inv[uid] ?? [];
      const idx = slots.indexOf(defenseItemType);
      if (idx === -1) throw denied("Defense item not in inventory");
      inv[uid] = slots.filter((_, i) => i !== idx);
      const ps = treasurePlayerStatesOf(boardId, gameId);
      const defender = ps[uid] ?? emptyPlayerState(uid);
      ps[uid] = { ...defender, attacksBlocked: defender.attacksBlocked + 1, updatedAt: now().toISOString() };
      const isReflect = defenseItemType === "mirror-shield";
      attacks[attackId] = { ...attack, status: isReflect ? "reflected" : "blocked", resolvedAt: now().toISOString() };
      battleFeedOf(boardId, gameId).push({ id: nextId("bf"), type: isReflect ? "attack-reflected" : "attack-blocked", actorUid: uid, targetUid: attack.attackerUid, itemType: defenseItemType, tcDelta: null, createdAt: now().toISOString() });
      if (isReflect) {
        const attackerPs = ps[attack.attackerUid] ?? emptyPlayerState(attack.attackerUid);
        if (attack.itemType === "bomb-gift") {
          const dmg = Math.min(attackerPs.currentRunPoints, BOMB_GIFT_DAMAGE);
          ps[attack.attackerUid] = { ...attackerPs, currentRunPoints: Math.max(0, attackerPs.currentRunPoints - dmg), tcLostToAttacks: attackerPs.tcLostToAttacks + dmg, updatedAt: now().toISOString() };
        } else if (attack.itemType === "ice-trap") {
          ps[attack.attackerUid] = { ...attackerPs, frozenUntilMs: now().getTime() + ICE_TRAP_DURATION_MS, updatedAt: now().toISOString() };
        }
      }
      changed();
    },

    async sendReaction(boardId: string, gameId: string, uid: string, type: ReactionType): Promise<void> {
      battleReactionsOf(boardId, gameId).push({ id: nextId("rxn"), uid, type, createdAt: now().toISOString() });
      changed();
    },

    async lockSettlement(boardId: string, gameId: string, achievements: AchievementResult[], scores: { uid: string; score: number }[], resolvedState: Omit<TreasureResolvedState, "resolvedAt">): Promise<void> {
      const game = treasureGamesOf(boardId)[gameId];
      if (!game) throw denied("Treasure game not found");
      game.status = "host_selection";
      game.achievements = [...achievements];
      game.resolvedState = { ...resolvedState, resolvedAt: now().toISOString() };
      const ps = treasurePlayerStatesOf(boardId, gameId);
      for (const { uid, score } of scores) {
        const existing = ps[uid] ?? emptyPlayerState(uid);
        ps[uid] = { ...existing, score, updatedAt: now().toISOString() };
      }
      changed();
    },

    subscribeToInventory(boardId: string, gameId: string, uid: string, cb: (inventory: InventoryState | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => {
        const slots = battleInventoriesOf(boardId, gameId)[uid] ?? [];
        return { uid, slots: slots.map((itemType) => ({ itemType, boughtAt: null })), updatedAt: null };
      }, cb, onError);
    },

    subscribeToAttacks(boardId: string, gameId: string, cb: (attacks: AttackDocument[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => Object.values(battleAttacksOf(boardId, gameId)).map((a) => ({
        id: a.id, attackerUid: a.attackerUid, targetUid: a.targetUid, itemType: a.itemType,
        status: a.status, tcDelta: a.tcDelta, createdAt: new Date(a.createdAt), resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : null,
      })), cb, onError);
    },

    subscribeToBattleFeed(boardId: string, gameId: string, cb: (events: BattleFeedEvent[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => battleFeedOf(boardId, gameId).map((e) => ({
        id: e.id, type: e.type, actorUid: e.actorUid, targetUid: e.targetUid,
        itemType: e.itemType, tcDelta: e.tcDelta, createdAt: new Date(e.createdAt),
      })), cb, onError);
    },

    subscribeToReactions(boardId: string, gameId: string, cb: (reactions: Reaction[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => battleReactionsOf(boardId, gameId).map((r) => ({
        id: r.id, uid: r.uid, type: r.type, createdAt: new Date(r.createdAt),
      })), cb, onError);
    },
  };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
