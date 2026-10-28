import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  collection,
  Timestamp,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const BOARD_ID = "board1";
const WAITING_BOARD_ID = "waitingBoard";
const COMPLETED_BOARD_ID = "completedBoard";
const LEGACY_BOARD_ID = "legacyBoard";
const seededTimestamp = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-retro-room",
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, name] of [["alice", "Alice"], ["bob", "Bob"], ["carol", "Carol"]]) {
      await setDoc(doc(db, `users/${uid}`), {
        displayName: name,
        photoURL: null,
        createdAt: seededTimestamp,
        nameSetAt: seededTimestamp,
      });
    }
    await setDoc(doc(db, "users/frank"), {
      displayName: "Frank Google Name",
      photoURL: null,
      createdAt: seededTimestamp,
    });
    await setDoc(doc(db, `boards/${BOARD_ID}`), {
      title: "Sprint 1",
      ownerId: "alice",
      status: "in-progress",
      startedAt: seededTimestamp,
      createdAt: seededTimestamp,
      updatedAt: seededTimestamp,
    });
    const otherBoards = {
      [WAITING_BOARD_ID]: { status: "waiting" },
      [COMPLETED_BOARD_ID]: { status: "completed", startedAt: seededTimestamp, completedAt: seededTimestamp },
      [LEGACY_BOARD_ID]: {},
    };
    for (const [otherBoardId, statusFields] of Object.entries(otherBoards)) {
      await setDoc(doc(db, `boards/${otherBoardId}`), {
        title: otherBoardId,
        ownerId: "alice",
        createdAt: seededTimestamp,
        updatedAt: seededTimestamp,
        ...statusFields,
      });
      await setDoc(doc(db, `boards/${otherBoardId}/members/alice`), {
        uid: "alice", role: "owner", displayName: "Alice", joinedAt: seededTimestamp,
      });
      await setDoc(doc(db, `boards/${otherBoardId}/members/bob`), {
        uid: "bob", role: "member", displayName: "Bob", joinedAt: seededTimestamp,
      });
    }
    await setDoc(doc(db, `boards/${COMPLETED_BOARD_ID}/cards/doneCard`), {
      columnId: "ideas", text: "Done card", authorId: "bob",
      createdAt: seededTimestamp, updatedAt: seededTimestamp,
    });
    await setDoc(doc(db, `boards/${BOARD_ID}/members/alice`), {
      uid: "alice",
      role: "owner",
      displayName: "Alice",
      joinedAt: seededTimestamp,
    });
    await setDoc(doc(db, `boards/${BOARD_ID}/members/bob`), {
      uid: "bob",
      role: "member",
      displayName: "Bob",
      joinedAt: seededTimestamp,
    });
    await setDoc(doc(db, `boards/${BOARD_ID}/cards/bobCard`), {
      columnId: "went-well",
      text: "Bob card",
      authorId: "bob",
      createdAt: seededTimestamp,
      updatedAt: seededTimestamp,
    });
    await setDoc(doc(db, `boards/${BOARD_ID}/cards/aliceCard`), {
      columnId: "ideas",
      text: "Alice card",
      authorId: "alice",
      createdAt: seededTimestamp,
      updatedAt: seededTimestamp,
    });
  });
});

const alice = () => testEnv.authenticatedContext("alice").firestore();
const bob = () => testEnv.authenticatedContext("bob").firestore();
const carol = () => testEnv.authenticatedContext("carol").firestore();
const erin = () => testEnv.authenticatedContext("erin").firestore();
const frank = () => testEnv.authenticatedContext("frank").firestore();
const signedOut = () => testEnv.unauthenticatedContext().firestore();

const newCard = (authorId: string, overrides: Record<string, unknown> = {}) => ({
  columnId: "to-improve",
  text: "New card",
  authorId,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

describe("signed-out access", () => {
  it(`should deny reading a board when signed out`, async () => {
    await assertFails(getDoc(doc(signedOut(), `boards/${BOARD_ID}`)));
  });

  it(`should deny reading cards when signed out`, async () => {
    await assertFails(getDoc(doc(signedOut(), `boards/${BOARD_ID}/cards/bobCard`)));
  });

  it(`should deny reading users when signed out`, async () => {
    await assertFails(getDoc(doc(signedOut(), "users/alice")));
  });
});

describe("users", () => {
  const newProfile = (displayName: string, overrides: Record<string, unknown> = {}) => ({
    displayName,
    photoURL: null,
    createdAt: serverTimestamp(),
    nameSetAt: serverTimestamp(),
    ...overrides,
  });

  it(`should allow creating own profile when the player name is valid`, async () => {
    await assertSucceeds(setDoc(doc(erin(), "users/erin"), newProfile("Erin")));
  });

  it(`should allow a 20 character Thai name`, async () => {
    await assertSucceeds(setDoc(doc(erin(), "users/erin"), newProfile("ก".repeat(20))));
  });

  it(`should count each emoji as two characters when limiting the name length`, async () => {
    await assertSucceeds(setDoc(doc(erin(), "users/erin"), newProfile("😀".repeat(10))));
    await assertFails(setDoc(doc(erin(), "users/erin"), newProfile("😀".repeat(11))));
  });

  it(`should deny a name over 20 characters`, async () => {
    await assertFails(setDoc(doc(erin(), "users/erin"), newProfile("x".repeat(21))));
    await assertFails(setDoc(doc(erin(), "users/erin"), newProfile("ก".repeat(21))));
  });

  it(`should deny an empty or whitespace-only name`, async () => {
    await assertFails(setDoc(doc(erin(), "users/erin"), newProfile("")));
    await assertFails(setDoc(doc(erin(), "users/erin"), newProfile("   ")));
  });

  it(`should deny a profile without nameSetAt`, async () => {
    const { nameSetAt: _omitted, ...withoutNameSetAt } = newProfile("Erin");
    void _omitted;
    await assertFails(setDoc(doc(erin(), "users/erin"), withoutNameSetAt));
  });

  it(`should deny a client supplied nameSetAt`, async () => {
    await assertFails(
      setDoc(doc(erin(), "users/erin"), newProfile("Erin", { nameSetAt: seededTimestamp })),
    );
  });

  it(`should deny storing email in the profile`, async () => {
    await assertFails(
      setDoc(doc(erin(), "users/erin"), newProfile("Erin", { email: "erin@example.com" })),
    );
  });

  it(`should deny writing another user's profile`, async () => {
    await assertFails(setDoc(doc(erin(), "users/newbie"), newProfile("Hacked")));
  });

  it(`should deny changing the name once it is set`, async () => {
    await assertFails(
      updateDoc(doc(alice(), "users/alice"), { displayName: "Renamed" }),
    );
  });

  it(`should deny deleting a profile`, async () => {
    await assertFails(deleteDoc(doc(alice(), "users/alice")));
  });

  it(`should let a legacy profile without nameSetAt set its name once`, async () => {
    await assertSucceeds(
      updateDoc(doc(frank(), "users/frank"), {
        displayName: "Frank",
        photoURL: null,
        nameSetAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny a legacy profile changing createdAt while setting its name`, async () => {
    await assertFails(
      updateDoc(doc(frank(), "users/frank"), {
        displayName: "Frank",
        nameSetAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it(`should allow reading own profile`, async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice")));
  });

  it(`should allow getting own missing profile as a non-existing document`, async () => {
    const snapshot = await assertSucceeds(getDoc(doc(erin(), "users/erin")));
    expect(snapshot.exists()).toBe(false);
  });

  it(`should deny reading another user's profile`, async () => {
    await assertFails(getDoc(doc(bob(), "users/alice")));
  });
});

describe("boards", () => {
  it(`should allow a non-member to get the board document when signed in`, async () => {
    await assertSucceeds(getDoc(doc(carol(), `boards/${BOARD_ID}`)));
  });

  it(`should deny listing boards`, async () => {
    await assertFails(getDocs(collection(alice(), "boards")));
  });

  it(`should allow creating a board with the owner membership in one batch`, async () => {
    const db = carol();
    const batch = writeBatch(db);
    batch.set(doc(db, "boards/newBoard"), {
      title: "Carol board",
      ownerId: "carol",
      status: "waiting",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "boards/newBoard/members/carol"), {
      uid: "carol",
      role: "owner",
      displayName: "Carol",
      joinedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it(`should deny creating a board without the owner membership in the same batch`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/orphanBoard"), {
        title: "Orphan",
        ownerId: "carol",
        status: "waiting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny creating a board whose batch membership has the member role`, async () => {
    const db = carol();
    const batch = writeBatch(db);
    batch.set(doc(db, "boards/newBoard"), {
      title: "Carol board",
      ownerId: "carol",
      status: "waiting",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "boards/newBoard/members/carol"), {
      uid: "carol",
      role: "member",
      displayName: "Carol",
      joinedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it(`should deny creating a board owned by someone else`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/newBoard"), {
        title: "Stolen",
        ownerId: "alice",
        status: "waiting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny creating a board with a title over 80 characters`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/newBoard"), {
        title: "x".repeat(81),
        ownerId: "carol",
        status: "waiting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny creating a board with an empty title`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/newBoard"), {
        title: "",
        ownerId: "carol",
        status: "waiting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny creating a board with extra fields`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/newBoard"), {
        title: "Board",
        ownerId: "carol",
        status: "waiting",
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should allow the owner to rename the board`, async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), `boards/${BOARD_ID}`), {
        title: "Renamed",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny a member renaming the board`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${BOARD_ID}`), {
        title: "Renamed",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny the owner changing ownerId`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${BOARD_ID}`), {
        ownerId: "bob",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny deleting the board even for the owner`, async () => {
    await assertFails(deleteDoc(doc(alice(), `boards/${BOARD_ID}`)));
  });
});

function ownerCreatesBoardWithStatus(status: unknown, extra: Record<string, unknown> = {}) {
  const db = carol();
  const batch = writeBatch(db);
  const boardData: Record<string, unknown> = {
    title: "Session board",
    ownerId: "carol",
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  };
  if (status === undefined) delete boardData.status;
  batch.set(doc(db, "boards/sessionBoard"), boardData);
  batch.set(doc(db, "boards/sessionBoard/members/carol"), {
    uid: "carol",
    role: "owner",
    displayName: "Carol",
    joinedAt: serverTimestamp(),
  });
  return batch.commit();
}

describe("session lifecycle", () => {
  const startFields = () => ({
    status: "in-progress",
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const completeFields = () => ({
    status: "completed",
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  it(`should allow creating a board in the waiting status`, async () => {
    await assertSucceeds(ownerCreatesBoardWithStatus("waiting"));
  });

  it(`should deny creating a board that is already in progress`, async () => {
    await assertFails(ownerCreatesBoardWithStatus("in-progress"));
  });

  it(`should deny creating a board without a status`, async () => {
    await assertFails(ownerCreatesBoardWithStatus(undefined));
  });

  it(`should deny creating a board with startedAt set`, async () => {
    await assertFails(ownerCreatesBoardWithStatus("waiting", { startedAt: serverTimestamp() }));
  });

  it(`should allow the owner to start a waiting session`, async () => {
    await assertSucceeds(updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), startFields()));
  });

  it(`should deny a member starting the session`, async () => {
    await assertFails(updateDoc(doc(bob(), `boards/${WAITING_BOARD_ID}`), startFields()));
  });

  it(`should deny a non-member starting the session`, async () => {
    await assertFails(updateDoc(doc(carol(), `boards/${WAITING_BOARD_ID}`), startFields()));
  });

  it(`should deny a member writing the status directly`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${WAITING_BOARD_ID}`), { status: "in-progress" }),
    );
  });

  it(`should deny starting a session that is already in progress`, async () => {
    await assertFails(updateDoc(doc(alice(), `boards/${BOARD_ID}`), startFields()));
  });

  it(`should deny starting a completed session`, async () => {
    await assertFails(updateDoc(doc(alice(), `boards/${COMPLETED_BOARD_ID}`), startFields()));
  });

  it(`should deny starting a legacy board that has no status`, async () => {
    await assertFails(updateDoc(doc(alice(), `boards/${LEGACY_BOARD_ID}`), startFields()));
  });

  it(`should deny skipping from waiting straight to completed`, async () => {
    await assertFails(updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), completeFields()));
  });

  it(`should deny starting with an unknown status value`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), {
        ...startFields(),
        status: "paused",
      }),
    );
  });

  it(`should deny starting with a client supplied startedAt`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), {
        ...startFields(),
        startedAt: seededTimestamp,
      }),
    );
  });

  it(`should deny starting while also changing the title`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), { ...startFields(), title: "Sneaky" }),
    );
  });

  it(`should deny starting while also changing the owner`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), { ...startFields(), ownerId: "bob" }),
    );
  });

  it(`should allow the owner to complete a session in progress`, async () => {
    await assertSucceeds(updateDoc(doc(alice(), `boards/${BOARD_ID}`), completeFields()));
  });

  it(`should allow the owner to complete a legacy board`, async () => {
    await assertSucceeds(updateDoc(doc(alice(), `boards/${LEGACY_BOARD_ID}`), completeFields()));
  });

  it(`should deny a member completing the session`, async () => {
    await assertFails(updateDoc(doc(bob(), `boards/${BOARD_ID}`), completeFields()));
  });

  it(`should deny reopening a completed session`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${COMPLETED_BOARD_ID}`), {
        status: "waiting",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(alice(), `boards/${COMPLETED_BOARD_ID}`), {
        status: "in-progress",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny moving an in-progress session back to waiting`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${BOARD_ID}`), {
        status: "waiting",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should keep the status when the owner renames the board`, async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), {
        title: "Renamed",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(alice(), `boards/${WAITING_BOARD_ID}`), {
        title: "Renamed again",
        status: "in-progress",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny card writes while the session is waiting`, async () => {
    await assertFails(
      setDoc(doc(bob(), `boards/${WAITING_BOARD_ID}/cards/early`), newCard("bob")),
    );
    await assertFails(
      setDoc(doc(alice(), `boards/${WAITING_BOARD_ID}/cards/early`), newCard("alice")),
    );
  });

  it(`should allow card writes while the session is in progress`, async () => {
    await assertSucceeds(
      setDoc(doc(bob(), `boards/${BOARD_ID}/cards/live`), newCard("bob")),
    );
  });

  it(`should allow card writes on a legacy board without status`, async () => {
    await assertSucceeds(
      setDoc(doc(bob(), `boards/${LEGACY_BOARD_ID}/cards/legacy`), newCard("bob")),
    );
  });

  it(`should keep a completed session read-only for cards`, async () => {
    await assertSucceeds(getDoc(doc(bob(), `boards/${COMPLETED_BOARD_ID}/cards/doneCard`)));
    await assertFails(
      setDoc(doc(bob(), `boards/${COMPLETED_BOARD_ID}/cards/late`), newCard("bob")),
    );
    await assertFails(
      updateDoc(doc(bob(), `boards/${COMPLETED_BOARD_ID}/cards/doneCard`), {
        text: "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(bob(), `boards/${COMPLETED_BOARD_ID}/cards/doneCard`)));
    await assertFails(deleteDoc(doc(alice(), `boards/${COMPLETED_BOARD_ID}/cards/doneCard`)));
  });

  it(`should still let members join a board whose session is in progress`, async () => {
    await assertSucceeds(
      setDoc(doc(carol(), `boards/${BOARD_ID}/members/carol`), {
        uid: "carol",
        role: "member",
        displayName: "Carol",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should let members join a waiting board`, async () => {
    await assertSucceeds(
      setDoc(doc(carol(), `boards/${WAITING_BOARD_ID}/members/carol`), {
        uid: "carol",
        role: "member",
        displayName: "Carol",
        joinedAt: serverTimestamp(),
      }),
    );
  });
});

describe("members", () => {
  it(`should allow a signed-in user to join as member`, async () => {
    await assertSucceeds(
      setDoc(doc(carol(), `boards/${BOARD_ID}/members/carol`), {
        uid: "carol",
        role: "member",
        displayName: "Carol",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining with a name different from the player profile`, async () => {
    await assertFails(
      setDoc(doc(carol(), `boards/${BOARD_ID}/members/carol`), {
        uid: "carol",
        role: "member",
        displayName: "Impostor",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining without a player profile`, async () => {
    await assertFails(
      setDoc(doc(erin(), `boards/${BOARD_ID}/members/erin`), {
        uid: "erin",
        role: "member",
        displayName: "Erin",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining while the profile has no player name set`, async () => {
    await assertFails(
      setDoc(doc(frank(), `boards/${BOARD_ID}/members/frank`), {
        uid: "frank",
        role: "member",
        displayName: "Frank Google Name",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny creating a board whose owner membership uses another name`, async () => {
    const db = carol();
    const batch = writeBatch(db);
    batch.set(doc(db, "boards/nameBoard"), {
      title: "Name board",
      ownerId: "carol",
      status: "waiting",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "boards/nameBoard/members/carol"), {
      uid: "carol",
      role: "owner",
      displayName: "Impostor",
      joinedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it(`should deny joining with a display name over 100 characters`, async () => {
    await assertFails(
      setDoc(doc(carol(), `boards/${BOARD_ID}/members/carol`), {
        uid: "carol",
        role: "member",
        displayName: "x".repeat(101),
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining a second time`, async () => {
    await assertFails(
      setDoc(doc(bob(), `boards/${BOARD_ID}/members/bob`), {
        uid: "bob",
        role: "member",
        displayName: "Bob",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining as owner on an existing board`, async () => {
    await assertFails(
      setDoc(doc(carol(), `boards/${BOARD_ID}/members/carol`), {
        uid: "carol",
        role: "owner",
        displayName: "Carol",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny creating an owner membership without the board in the same batch`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/ghostBoard/members/carol"), {
        uid: "carol",
        role: "owner",
        displayName: "Carol",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining a board that does not exist as member`, async () => {
    await assertFails(
      setDoc(doc(carol(), "boards/ghostBoard/members/carol"), {
        uid: "carol",
        role: "member",
        displayName: "Carol",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny joining on behalf of another user`, async () => {
    await assertFails(
      setDoc(doc(carol(), `boards/${BOARD_ID}/members/dave`), {
        uid: "dave",
        role: "member",
        displayName: "Dave",
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny a member promoting themselves to owner`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${BOARD_ID}/members/bob`), { role: "owner" }),
    );
  });

  it(`should deny the owner removing a member`, async () => {
    await assertFails(deleteDoc(doc(alice(), `boards/${BOARD_ID}/members/bob`)));
  });

  it(`should allow members to read the member list`, async () => {
    await assertSucceeds(getDocs(collection(bob(), `boards/${BOARD_ID}/members`)));
  });

  it(`should deny a non-member reading the member list`, async () => {
    await assertFails(getDocs(collection(carol(), `boards/${BOARD_ID}/members`)));
  });

  it(`should allow the dashboard collection-group query for own memberships`, async () => {
    await assertSucceeds(
      getDocs(query(collectionGroup(bob(), "members"), where("uid", "==", "bob"))),
    );
  });

  it(`should deny the collection-group query for another user's memberships`, async () => {
    await assertFails(
      getDocs(query(collectionGroup(carol(), "members"), where("uid", "==", "bob"))),
    );
  });

  it(`should return a non-existing document when a non-member gets own membership`, async () => {
    const snapshot = await assertSucceeds(
      getDoc(doc(carol(), `boards/${BOARD_ID}/members/carol`)),
    );
    expect(snapshot.exists()).toBe(false);
  });

  it(`should return the document when a member gets own membership`, async () => {
    const snapshot = await assertSucceeds(getDoc(doc(bob(), `boards/${BOARD_ID}/members/bob`)));
    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data()?.role).toBe("member");
  });

  it(`should deny getting another user's membership when it exists`, async () => {
    await assertFails(getDoc(doc(carol(), `boards/${BOARD_ID}/members/bob`)));
  });

  it(`should deny getting another user's membership when it does not exist`, async () => {
    await assertFails(getDoc(doc(carol(), `boards/${BOARD_ID}/members/dave`)));
  });

  it(`should deny getting own membership when signed out`, async () => {
    await assertFails(getDoc(doc(signedOut(), `boards/${BOARD_ID}/members/carol`)));
  });

  it(`should deny a member listing another user's membership through a board query`, async () => {
    await assertFails(
      getDocs(
        query(collection(carol(), `boards/${BOARD_ID}/members`), where("uid", "==", "bob")),
      ),
    );
  });

  it(`should deny an unfiltered collection-group query on members`, async () => {
    await assertFails(getDocs(collectionGroup(carol(), "members")));
  });
});

describe("cards", () => {
  it(`should allow a member to read cards`, async () => {
    await assertSucceeds(getDocs(collection(bob(), `boards/${BOARD_ID}/cards`)));
  });

  it(`should deny a non-member reading cards`, async () => {
    await assertFails(getDocs(collection(carol(), `boards/${BOARD_ID}/cards`)));
  });

  it(`should allow a member to create a card as themselves`, async () => {
    await assertSucceeds(
      setDoc(doc(bob(), `boards/${BOARD_ID}/cards/new1`), newCard("bob")),
    );
  });

  it(`should allow the owner to create a card as themselves`, async () => {
    await assertSucceeds(
      setDoc(doc(alice(), `boards/${BOARD_ID}/cards/new1`), newCard("alice")),
    );
  });

  it(`should deny a non-member creating a card`, async () => {
    await assertFails(
      setDoc(doc(carol(), `boards/${BOARD_ID}/cards/new1`), newCard("carol")),
    );
  });

  it(`should deny creating a card with someone else as author`, async () => {
    await assertFails(
      setDoc(doc(bob(), `boards/${BOARD_ID}/cards/new1`), newCard("alice")),
    );
  });

  it(`should deny creating a card over 500 characters`, async () => {
    await assertFails(
      setDoc(
        doc(bob(), `boards/${BOARD_ID}/cards/new1`),
        newCard("bob", { text: "x".repeat(501) }),
      ),
    );
  });

  it(`should allow creating a card of exactly 500 characters`, async () => {
    await assertSucceeds(
      setDoc(
        doc(bob(), `boards/${BOARD_ID}/cards/new1`),
        newCard("bob", { text: "x".repeat(500) }),
      ),
    );
  });

  it(`should deny creating a card with empty text`, async () => {
    await assertFails(
      setDoc(doc(bob(), `boards/${BOARD_ID}/cards/new1`), newCard("bob", { text: "" })),
    );
  });

  it(`should deny creating a card in an unknown column`, async () => {
    await assertFails(
      setDoc(
        doc(bob(), `boards/${BOARD_ID}/cards/new1`),
        newCard("bob", { columnId: "backlog" }),
      ),
    );
  });

  it(`should deny creating a card with extra fields`, async () => {
    await assertFails(
      setDoc(
        doc(bob(), `boards/${BOARD_ID}/cards/new1`),
        newCard("bob", { color: "red" }),
      ),
    );
  });

  it(`should deny creating a card with a client-supplied timestamp`, async () => {
    await assertFails(
      setDoc(
        doc(bob(), `boards/${BOARD_ID}/cards/new1`),
        newCard("bob", { createdAt: seededTimestamp }),
      ),
    );
  });

  it(`should allow an author to edit their own card`, async () => {
    await assertSucceeds(
      updateDoc(doc(bob(), `boards/${BOARD_ID}/cards/bobCard`), {
        text: "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny a member editing another member's card`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${BOARD_ID}/cards/aliceCard`), {
        text: "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny the owner editing a member's card`, async () => {
    await assertFails(
      updateDoc(doc(alice(), `boards/${BOARD_ID}/cards/bobCard`), {
        text: "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny changing a card's column`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${BOARD_ID}/cards/bobCard`), {
        columnId: "ideas",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny changing a card's authorId`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${BOARD_ID}/cards/bobCard`), {
        authorId: "alice",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should deny editing a card to exceed 500 characters`, async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${BOARD_ID}/cards/bobCard`), {
        text: "x".repeat(501),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it(`should allow an author to delete their own card`, async () => {
    await assertSucceeds(deleteDoc(doc(bob(), `boards/${BOARD_ID}/cards/bobCard`)));
  });

  it(`should deny a member deleting another member's card`, async () => {
    await assertFails(deleteDoc(doc(bob(), `boards/${BOARD_ID}/cards/aliceCard`)));
  });

  it(`should allow the owner to delete a member's card`, async () => {
    await assertSucceeds(deleteDoc(doc(alice(), `boards/${BOARD_ID}/cards/bobCard`)));
  });

  it(`should deny a non-member deleting a card`, async () => {
    await assertFails(deleteDoc(doc(carol(), `boards/${BOARD_ID}/cards/bobCard`)));
  });
});

describe("default deny", () => {
  it(`should deny access to unknown collections`, async () => {
    await assertFails(getDoc(doc(alice(), "secrets/s1")));
    await assertFails(setDoc(doc(alice(), "secrets/s1"), { a: 1 }));
  });
});
