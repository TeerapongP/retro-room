import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, isAdminUser } from "@/lib/firebase/admin";
import {
  completeSession,
  createBoard,
  joinBoard,
  setPhase,
  startSession,
  startTimer,
  stopTimer,
  subscribeToBoard,
} from "@/lib/firebase/boards";
import {
  addCard,
  deleteCard,
  listMoveTargetBoards,
  moveCard,
  setCardColumn,
  setCardHidden,
  stackCards,
  subscribeToCards,
  unstackCard,
} from "@/lib/firebase/cards";
import { saveMyRating, subscribeToRatings } from "@/lib/firebase/ratings";
import { saveMyVotes, subscribeToVotes } from "@/lib/firebase/votes";
import type { Rating } from "@/lib/ratings";
import type { Board, BoardCard } from "@/lib/firebase/types";
import { countVotes, type Voter } from "@/lib/votes";
import { createTestUser, pause, resetEmulators, waitUntil, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let admin: TestUser;

beforeEach(async () => {
  await resetEmulators();
  owner = await createTestUser("owner", "Owner");
  member = await createTestUser("member", "Member");
  admin = await createTestUser("admin", "Admin", { email: ADMIN_EMAIL });
});

afterEach(async () => {
  await resetEmulators();
});

const fail = (error: unknown) => {
  throw error;
};

async function liveBoard(title: string): Promise<string> {
  const boardId = await createBoard(owner.user, title, owner.name, owner.db);
  await joinBoard(boardId, member.user, member.name, member.db);
  await startSession(boardId, owner.db);
  return boardId;
}

function watch(boardId: string, user: TestUser, isAdmin = false) {
  const state = { cards: undefined as BoardCard[] | undefined };
  const stop = subscribeToCards(
    boardId,
    { uid: user.uid, isAdmin, seesOthers: true },
    (next) => (state.cards = next),
    fail,
    user.db,
  );
  return { state, stop };
}

describe("admin identity on the client", () => {
  it(`should treat only a verified account with the admin email as admin`, () => {
    expect(isAdminUser(admin.user)).toBe(true);
    expect(isAdminUser({ email: ADMIN_EMAIL, emailVerified: false })).toBe(false);
    expect(isAdminUser({ email: ADMIN_EMAIL.toUpperCase(), emailVerified: true })).toBe(false);
    expect(isAdminUser(owner.user)).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
});

describe("hide and unhide", () => {
  it(`should hide a card from other members, keep it for its author and the admin, and restore it on unhide`, async () => {
    const boardId = await liveBoard("Hide board");
    await addCard(boardId, member.user, "ideas", "Secret idea", member.db);
    await addCard(boardId, owner.user, "ideas", "Open idea", owner.db);
    await setPhase(boardId, 2, admin.db); // others' cards show from step 2; writing is already done (D126, D131)
    const ownerView = watch(boardId, owner);
    const memberView = watch(boardId, member);
    const adminView = watch(boardId, admin, true);
    await waitUntil(() => ownerView.state.cards?.length === 2 && adminView.state.cards?.length === 2);
    const secret = adminView.state.cards!.find((card) => card.text === "Secret idea")!;

    await setCardHidden(boardId, secret.id, true, admin.db);

    await waitUntil(() => ownerView.state.cards?.length === 1);
    expect(ownerView.state.cards?.map((card) => card.text)).toEqual(["Open idea"]);
    expect(memberView.state.cards?.map((card) => card.text).sort()).toEqual(["Open idea", "Secret idea"]);
    expect(adminView.state.cards?.find((card) => card.id === secret.id)?.hidden).toBe(true);

    await setCardHidden(boardId, secret.id, false, admin.db);
    await waitUntil(() => ownerView.state.cards?.length === 2);
    for (const view of [ownerView, memberView, adminView]) view.stop();
  });

  it(`should deny hiding by the owner and the author`, async () => {
    const boardId = await liveBoard("Deny hide");
    await addCard(boardId, member.user, "ideas", "Card", member.db);
    const adminView = watch(boardId, admin, true);
    await waitUntil(() => adminView.state.cards?.length === 1);
    const cardId = adminView.state.cards![0].id;
    adminView.stop();

    for (const user of [owner, member]) {
      await expect(setCardHidden(boardId, cardId, true, user.db)).rejects.toMatchObject({
        code: "permission-denied",
      });
    }
  });

  it(`should never return a hidden card through a member's own queries`, async () => {
    const boardId = await liveBoard("No leak");
    await addCard(boardId, member.user, "ideas", "Hidden soon", member.db);
    const adminView = watch(boardId, admin, true);
    await waitUntil(() => adminView.state.cards?.length === 1);
    await setCardHidden(boardId, adminView.state.cards![0].id, true, admin.db);
    adminView.stop();

    await setPhase(boardId, 2, admin.db); // others' cards show from step 2; writing is already done (D126, D131)
    const ownerView = watch(boardId, owner);
    await waitUntil(() => ownerView.state.cards !== undefined);
    ownerView.stop();

    expect(ownerView.state.cards).toEqual([]);
  });
});

describe("move to another board", () => {
  it(`should move a card with its content, author and hidden state to the end of another in-progress board`, async () => {
    const source = await liveBoard("Source");
    const destination = await liveBoard("Destination");
    await addCard(destination, owner.user, "ideas", "Already there", owner.db);
    await addCard(source, member.user, "to-improve", "Move me", member.db);
    const sourceAdmin = watch(source, admin, true);
    await waitUntil(() => sourceAdmin.state.cards?.length === 1);
    const card = sourceAdmin.state.cards![0];
    await setCardHidden(source, card.id, true, admin.db);
    await waitUntil(() => sourceAdmin.state.cards?.[0]?.hidden === true);

    const targets = await listMoveTargetBoards(source, admin.db);
    expect(targets.map((board) => board.title)).toEqual(["Destination"]);

    await moveCard(source, sourceAdmin.state.cards![0], destination, admin.db);

    const destinationAdmin = watch(destination, admin, true);
    await waitUntil(() => destinationAdmin.state.cards?.length === 2);
    await waitUntil(() => sourceAdmin.state.cards?.length === 0);
    const moved = destinationAdmin.state.cards![1];
    expect(destinationAdmin.state.cards![0].text).toBe("Already there");
    expect(moved).toMatchObject({
      text: "Move me",
      columnId: "to-improve",
      authorId: member.uid,
      hidden: true,
    });
    sourceAdmin.stop();
    destinationAdmin.stop();
  });

  it(`should deny moving by the owner and a member`, async () => {
    const source = await liveBoard("Source");
    const destination = await liveBoard("Destination");
    await addCard(source, member.user, "ideas", "Stay", member.db);
    const adminView = watch(source, admin, true);
    await waitUntil(() => adminView.state.cards?.length === 1);
    const card = adminView.state.cards![0];
    adminView.stop();

    for (const user of [owner, member]) {
      await expect(moveCard(source, card, destination, user.db)).rejects.toMatchObject({
        code: "permission-denied",
      });
    }
  });

  it(`should not offer or allow a completed board as a destination or a source`, async () => {
    const source = await liveBoard("Source");
    const finished = await liveBoard("Finished");
    await addCard(source, member.user, "ideas", "Stay", member.db);
    await addCard(finished, member.user, "ideas", "Frozen", member.db);
    const sourceView = watch(source, admin, true);
    const finishedView = watch(finished, admin, true);
    await waitUntil(() => sourceView.state.cards?.length === 1 && finishedView.state.cards?.length === 1);
    await completeSession(finished, owner.db);

    expect((await listMoveTargetBoards(source, admin.db)).map((board) => board.title)).toEqual([]);
    await expect(
      moveCard(source, sourceView.state.cards![0], finished, admin.db),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      moveCard(finished, finishedView.state.cards![0], source, admin.db),
    ).rejects.toMatchObject({ code: "permission-denied" });
    sourceView.stop();
    finishedView.stop();
  });

  it(`should keep the source card and create no copy when a move is rejected`, async () => {
    const source = await liveBoard("Source");
    const destination = await liveBoard("Destination");
    await addCard(source, member.user, "ideas", "Stay", member.db);
    const sourceView = watch(source, admin, true);
    await waitUntil(() => sourceView.state.cards?.length === 1);
    await expect(
      moveCard(source, sourceView.state.cards![0], destination, member.db),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const destinationView = watch(destination, admin, true);
    await waitUntil(() => destinationView.state.cards !== undefined);
    expect(destinationView.state.cards).toEqual([]);
    expect(sourceView.state.cards?.map((card) => card.text)).toEqual(["Stay"]);
    sourceView.stop();
    destinationView.stop();
  });
});

describe("voting (D135 to D142)", () => {
  it(`should let members place up to 3 votes in step 3 only, and show everyone the counts`, async () => {
    const boardId = await liveBoard("Vote board");
    await expect(saveMyVotes(boardId, member.uid, ["a"], member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });

    await setPhase(boardId, 3, admin.db);
    await saveMyVotes(boardId, member.uid, ["a", "b", "c"], member.db);
    await saveMyVotes(boardId, owner.uid, ["a"], owner.db);
    const seen = { voters: undefined as Voter[] | undefined };
    const stop = subscribeToVotes(boardId, (next) => (seen.voters = next), fail, owner.db);
    await waitUntil(() => seen.voters?.length === 2);
    const counts = countVotes(seen.voters!);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    stop();

    await expect(saveMyVotes(boardId, member.uid, ["a", "b", "c", "d"], member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(saveMyVotes(boardId, owner.uid, ["z"], member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });

    await setPhase(boardId, 4, admin.db);
    await expect(saveMyVotes(boardId, member.uid, ["a"], member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("self rating (D145 to D148)", () => {
  it(`should let members rate themselves in step 4 only and show everyone every score`, async () => {
    const boardId = await liveBoard("Rating board");
    await setPhase(boardId, 3, admin.db);
    await expect(saveMyRating(boardId, member.uid, 3, member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });

    await setPhase(boardId, 4, admin.db);
    await saveMyRating(boardId, member.uid, 4.5, member.db);
    await saveMyRating(boardId, owner.uid, 3, owner.db);
    const seen = { ratings: undefined as Rating[] | undefined };
    const stop = subscribeToRatings(boardId, (next) => (seen.ratings = next), fail, owner.db);
    await waitUntil(() => seen.ratings?.length === 2);
    expect(seen.ratings?.find((rating) => rating.uid === member.uid)?.score).toBe(4.5);
    stop();

    await expect(saveMyRating(boardId, member.uid, 5.5, member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(saveMyRating(boardId, owner.uid, 3, member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });

    await setPhase(boardId, 5, admin.db);
    await expect(saveMyRating(boardId, member.uid, 2, member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("private writing step (D126 to D130)", () => {
  async function stepOneBoard(title: string): Promise<string> {
    const boardId = await createBoard(owner.user, title, owner.name, owner.db);
    await joinBoard(boardId, member.user, member.name, member.db);
    await startSession(boardId, owner.db);
    return boardId;
  }

  it(`should show each member only their own cards in step 1 and everyone's from step 2`, async () => {
    const boardId = await stepOneBoard("Private board");
    await addCard(boardId, owner.user, "ideas", "Owner idea", owner.db);
    await addCard(boardId, member.user, "ideas", "Member idea", member.db);
    const ownerSeen = { cards: undefined as BoardCard[] | undefined };
    const ownerView = subscribeToCards(boardId, { uid: owner.uid, isAdmin: false, seesOthers: false }, (next) => (ownerSeen.cards = next), fail, owner.db);
    const adminView = watch(boardId, admin, true);
    await waitUntil(() => ownerSeen.cards !== undefined && adminView.state.cards?.length === 2);
    expect(ownerSeen.cards!.map((card) => card.text)).toEqual(["Owner idea"]);
    ownerView();

    await setPhase(boardId, 2, admin.db);
    const revealed = { cards: undefined as BoardCard[] | undefined };
    const stop = subscribeToCards(boardId, { uid: owner.uid, isAdmin: false, seesOthers: true }, (next) => (revealed.cards = next), fail, owner.db);
    await waitUntil(() => revealed.cards?.length === 2);
    expect(revealed.cards!.map((card) => card.text).sort()).toEqual(["Member idea", "Owner idea"]);

    await setPhase(boardId, 1, admin.db);
    const errors: unknown[] = [];
    const stepOneAgain = subscribeToCards(boardId, { uid: owner.uid, isAdmin: false, seesOthers: false }, () => {}, (error) => errors.push(error), owner.db);
    await pause(300);
    expect(errors).toEqual([]);
    stop();
    stepOneAgain();
    adminView.stop();
  });

  it(`should deny a member the query for other members' cards while the board is in step 1`, async () => {
    const boardId = await stepOneBoard("Denied board");
    await addCard(boardId, owner.user, "ideas", "Owner idea", owner.db);
    let code: string | undefined;
    const stop = subscribeToCards(
      boardId,
      { uid: member.uid, isAdmin: false, seesOthers: true },
      () => {},
      (error) => (code = (error as { code: string }).code),
      member.db,
    );
    await waitUntil(() => code !== undefined);
    stop();
    expect(code).toBe("permission-denied");
  });
});

describe("session step (D116 to D123)", () => {
  it(`should let the admin move the shared step that members see and deny the owner`, async () => {
    const boardId = await liveBoard("Step board");
    const state = { board: undefined as Board | null | undefined };
    const stop = subscribeToBoard(boardId, (next) => (state.board = next), fail, member.db);
    await waitUntil(() => state.board !== undefined);
    expect(state.board?.phase).toBe(1);

    await expect(setPhase(boardId, 4, owner.db)).rejects.toMatchObject({ code: "permission-denied" });
    await setPhase(boardId, 3, admin.db);
    await waitUntil(() => state.board?.phase === 3);
    await expect(setPhase(boardId, 7, admin.db)).rejects.toMatchObject({ code: "permission-denied" });
    stop();
  });
});

describe("board timer (D109 to D115)", () => {
  it(`should let the admin start and stop a shared timer that members see, and deny the owner`, async () => {
    const boardId = await liveBoard("Timer board");
    const state = { board: undefined as Board | null | undefined };
    const stop = subscribeToBoard(boardId, (next) => (state.board = next), fail, member.db);
    await waitUntil(() => state.board !== undefined);
    expect(state.board?.timerEndsAt).toBeNull();

    await expect(startTimer(boardId, 5, owner.db)).rejects.toMatchObject({ code: "permission-denied" });
    await startTimer(boardId, 5, admin.db);
    await waitUntil(() => state.board?.timerEndsAt instanceof Date);
    expect(state.board?.timerDurationSec).toBe(300);
    const left = state.board!.timerEndsAt!.getTime() - Date.now();
    expect(left).toBeGreaterThan(280_000);
    expect(left).toBeLessThanOrEqual(300_000);

    await stopTimer(boardId, admin.db);
    await waitUntil(() => state.board?.timerEndsAt === null);
    stop();
  });

  it(`should reject a timer longer than 2 hours and a timer on a completed board`, async () => {
    const boardId = await liveBoard("Long timer board");
    await expect(startTimer(boardId, 121, admin.db)).rejects.toMatchObject({ code: "permission-denied" });
    await completeSession(boardId, owner.db);
    await expect(startTimer(boardId, 5, admin.db)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("admin stacking (D102 to D106)", () => {
  it(`should let the admin stack a card onto one in another column and unstack it, and deny the author`, async () => {
    const boardId = await liveBoard("Stack board");
    await addCard(boardId, member.user, "went-well", "Target", member.db);
    await addCard(boardId, member.user, "ideas", "Dragged", member.db);
    const adminView = watch(boardId, admin, true);
    await setPhase(boardId, 2, admin.db); // others' cards show from step 2; writing is already done (D126, D131)
    const memberView = watch(boardId, member);
    await waitUntil(() => adminView.state.cards?.length === 2);
    const target = adminView.state.cards!.find((card) => card.text === "Target")!;
    const dragged = adminView.state.cards!.find((card) => card.text === "Dragged")!;

    await expect(stackCards(boardId, dragged, target, member.db)).rejects.toMatchObject({ code: "permission-denied" });
    await stackCards(boardId, dragged, target, admin.db);
    await waitUntil(() => memberView.state.cards?.every((card) => card.groupId === target.id) === true);

    expect(memberView.state.cards!.map((card) => card.columnId)).toEqual(["went-well", "went-well"]);
    await unstackCard(boardId, dragged.id, admin.db);
    await waitUntil(() => memberView.state.cards?.find((card) => card.id === dragged.id)?.groupId === null);
    adminView.stop();
    memberView.stop();
  });
});

describe("admin column move (D101)", () => {
  it(`should let the admin move a card between columns of the same board and deny the author doing it`, async () => {
    const boardId = await liveBoard("Columns board");
    await addCard(boardId, member.user, "went-well", "Wrong column", member.db);
    const adminView = watch(boardId, admin, true);
    await setPhase(boardId, 2, admin.db); // others' cards show from step 2; writing is already done (D126, D131)
    const memberView = watch(boardId, member);
    await waitUntil(() => adminView.state.cards?.length === 1);
    const cardId = adminView.state.cards![0].id;

    await expect(setCardColumn(boardId, cardId, "to-improve", member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await setCardColumn(boardId, cardId, "to-improve", admin.db);
    await waitUntil(() => memberView.state.cards?.[0]?.columnId === "to-improve");

    expect(memberView.state.cards).toHaveLength(1);
    expect(memberView.state.cards![0]).toMatchObject({ text: "Wrong column", authorId: member.uid });
    adminView.stop();
    memberView.stop();
  });
});

describe("admin delete (D100)", () => {
  it(`should let the admin delete a member's card, including a hidden one, but not on a completed board`, async () => {
    const boardId = await liveBoard("Delete board");
    await addCard(boardId, member.user, "ideas", "Delete me", member.db);
    await addCard(boardId, member.user, "ideas", "Hidden delete me", member.db);
    const adminView = watch(boardId, admin, true);
    await waitUntil(() => adminView.state.cards?.length === 2);
    const [first, second] = adminView.state.cards!;
    await setCardHidden(boardId, second.id, true, admin.db);

    await deleteCard(boardId, first.id, admin.db);
    await deleteCard(boardId, second.id, admin.db);
    await waitUntil(() => adminView.state.cards?.length === 0);

    await addCard(boardId, member.user, "ideas", "Last", member.db);
    await waitUntil(() => adminView.state.cards?.length === 1);
    const last = adminView.state.cards![0];
    await completeSession(boardId, owner.db);
    await expect(deleteCard(boardId, last.id, admin.db)).rejects.toMatchObject({ code: "permission-denied" });
    adminView.stop();
  });

  it(`should still deny a member deleting the owner's card`, async () => {
    const boardId = await liveBoard("Deny delete");
    await addCard(boardId, owner.user, "ideas", "Owner card", owner.db);
    await setPhase(boardId, 2, admin.db); // others' cards show from step 2; writing is already done (D126, D131)
    const ownerView = watch(boardId, owner);
    await waitUntil(() => ownerView.state.cards?.length === 1);
    const cardId = ownerView.state.cards![0].id;
    ownerView.stop();

    await expect(deleteCard(boardId, cardId, member.db)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("board listing", () => {
  it(`should deny a member listing boards`, async () => {
    await liveBoard("Any");
    await expect(listMoveTargetBoards("none", member.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
