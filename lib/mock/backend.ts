import { ADMIN_EMAIL } from "../firebase/admin";
import { clampPhase } from "../phases";
import { isValidRating, type Rating } from "../ratings";
import { VOTES_PER_MEMBER, type Voter } from "../votes";
import {
  isValidPlayerName,
  normalizePlayerName,
  type Board,
  type BoardCard,
  type BoardMember,
  type BoardRole,
  type BoardStatus,
  type ColumnId,
  type DashboardBoard,
  type MoveTargetBoard,
} from "../firebase/types";

/**
 * In-memory stand-in for Firebase Auth and Firestore (F19, D89 to D92). It does NOT run Security Rules:
 * it is for looking at and clicking through the UI only. State is kept in the given storage as JSON.
 */

export const MOCK_STATE_KEY = "retro-room:mock-state";
const MOCK_ADMIN_UID = "mock-admin";

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
  timerEndsAt?: string | null;
  timerDurationSec?: number | null;
  phase?: number;
  createdAt: string;
};
type StoredMember = BoardMember & { joinedAt: string };
type StoredCard = {
  id: string;
  columnId: ColumnId;
  text: string;
  authorId: string;
  hidden: boolean;
  groupId?: string | null;
  createdAt: string;
};
type MockState = {
  session: string | null;
  profiles: Record<string, string>;
  boards: Record<string, StoredBoard>;
  members: Record<string, Record<string, StoredMember>>;
  cards: Record<string, Record<string, StoredCard>>;
  /** Voter documents per board (F26); absent in states saved before voting existed. */
  votes?: Record<string, Record<string, string[]>>;
  /** Self ratings per board (F28); absent in states saved before ratings existed. */
  ratings?: Record<string, Record<string, number>>;
  counter: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type Unsubscribe = () => void;
type CardViewer = { uid: string; isAdmin: boolean; seesOthers?: boolean };

export type MockBackendOptions = {
  storage?: StorageLike;
  now?: () => Date;
};

function seedState(): MockState {
  const at = (minute: number) => `2026-11-06T09:0${minute}:00.000Z`;
  const board = (id: string, title: string): StoredBoard => ({
    id,
    title,
    ownerId: "mock-ploy",
    status: "in-progress",
    createdAt: at(0),
  });
  const members = (): Record<string, StoredMember> => ({
    "mock-ploy": { uid: "mock-ploy", role: "owner", displayName: "Ploy", joinedAt: at(0) },
    "mock-nok": { uid: "mock-nok", role: "member", displayName: "Nok", joinedAt: at(1) },
    [MOCK_ADMIN_UID]: { uid: MOCK_ADMIN_UID, role: "member", displayName: "Aomsin", joinedAt: at(2) },
  });
  const card = (id: string, columnId: ColumnId, text: string, authorId: string, hidden: boolean, minute: number): StoredCard => ({
    id,
    columnId,
    text,
    authorId,
    hidden,
    createdAt: at(minute),
  });
  return {
    session: null,
    profiles: { [MOCK_ADMIN_UID]: "Aomsin", "mock-ploy": "Ploy", "mock-nok": "Nok" },
    boards: { sprint23: board("sprint23", "Sprint 23"), sprint13: board("sprint13", "Sprint 13") },
    members: { sprint23: members(), sprint13: members() },
    cards: {
      sprint23: {
        a: card("a", "went-well", "Deploy was smooth this sprint", "mock-ploy", false, 1),
        b: card("b", "to-improve", "Stand-ups run too long", "mock-nok", false, 2),
        c: card("c", "to-improve", "Private feedback about the review process", "mock-nok", true, 3),
        d: card("d", "ideas", "Try a demo day on Fridays", "mock-ploy", false, 4),
      },
      sprint13: {
        e: card("e", "ideas", "Pair on the release checklist", "mock-ploy", false, 5),
      },
    },
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
    return isMockState(parsed) ? parsed : seedState();
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
      timerEndsAt: stored.timerEndsAt ? new Date(stored.timerEndsAt) : null,
      timerDurationSec: stored.timerDurationSec ?? null,
      phase: clampPhase(stored.phase),
    };
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

  /** Same rule as firestore.rules: other members' cards show from step 2 on, or when the board is completed (D126, D129). */
  function othersAreRevealed(boardId: string): boolean {
    const board = state.boards[boardId];
    return board?.status === "completed" || clampPhase(board?.phase) >= 2;
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
      changed();
      return id;
    },

    async startSession(boardId: string): Promise<void> {
      boardOrThrow(boardId).status = "in-progress";
      changed();
    },

    subscribeToVotes(boardId: string, onVoters: (voters: Voter[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () => Object.entries(state.votes?.[boardId] ?? {}).map(([uid, cardIds]) => ({ uid, cardIds: [...cardIds] })),
        onVoters,
        onError,
      );
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

    async completeSession(boardId: string): Promise<void> {
      boardOrThrow(boardId).status = "completed";
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
      return member ? { uid: member.uid, role: member.role, displayName: member.displayName } : null;
    },

    subscribeToBoard(boardId: string, onBoard: (board: Board | null) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(() => (state.boards[boardId] ? toBoard(state.boards[boardId]) : null), onBoard, onError);
    },

    subscribeToMembers(boardId: string, onMembers: (members: BoardMember[]) => void, onError: (error: unknown) => void): Unsubscribe {
      return subscribe(
        () =>
          Object.values(state.members[boardId] ?? {})
            .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
            .map((member) => ({ uid: member.uid, role: member.role, displayName: member.displayName })),
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
  };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
