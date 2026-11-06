import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
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
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const ADMIN_EMAIL = "thirapong.pin@ascendcorp.com";
const SRC = "src";
const DEST = "dest";
const OTHER = "other";
const COMPLETED = "completed";
const WAITING = "waiting";
const seeded = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-retro-room-admin",
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const seedCard = (text: string, authorId: string, hidden: boolean | undefined) => ({
  columnId: "went-well",
  text,
  authorId,
  ...(hidden === undefined ? {} : { hidden }),
  createdAt: seeded,
  updatedAt: seeded,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const statuses: Record<string, string> = {
      [SRC]: "in-progress",
      [DEST]: "in-progress",
      [OTHER]: "in-progress",
      [COMPLETED]: "completed",
      [WAITING]: "waiting",
    };
    for (const [boardId, status] of Object.entries(statuses)) {
      await setDoc(doc(db, `boards/${boardId}`), {
        title: boardId,
        ownerId: "alice",
        status,
        createdAt: seeded,
        updatedAt: seeded,
      });
      await setDoc(doc(db, `boards/${boardId}/members/alice`), {
        uid: "alice", role: "owner", displayName: "Alice", joinedAt: seeded,
      });
      await setDoc(doc(db, `boards/${boardId}/members/bob`), {
        uid: "bob", role: "member", displayName: "Bob", joinedAt: seeded,
      });
    }
    await setDoc(doc(db, `boards/${SRC}/cards/visible`), seedCard("visible", "bob", false));
    await setDoc(doc(db, `boards/${SRC}/cards/secret`), seedCard("secret", "bob", true));
    await setDoc(doc(db, `boards/${SRC}/cards/aliceHidden`), seedCard("alice hidden", "alice", true));
    await setDoc(doc(db, `boards/${SRC}/cards/legacy`), seedCard("legacy", "bob", undefined));
    await setDoc(doc(db, `boards/${DEST}/cards/existing`), seedCard("existing", "bob", false));
    await setDoc(doc(db, `boards/${COMPLETED}/cards/done`), seedCard("done", "bob", false));
    await setDoc(doc(db, `boards/${WAITING}/cards/early`), seedCard("early", "bob", false));
  });
});

const admin = () =>
  testEnv.authenticatedContext("admin", { email: ADMIN_EMAIL, email_verified: true }).firestore();
const alice = () => testEnv.authenticatedContext("alice").firestore();
const bob = () => testEnv.authenticatedContext("bob").firestore();
const stranger = () => testEnv.authenticatedContext("stranger").firestore();
const impostors = {
  "unverified account with the admin email": () =>
    testEnv.authenticatedContext("fake", { email: ADMIN_EMAIL, email_verified: false }).firestore(),
  "verified account with another email": () =>
    testEnv
      .authenticatedContext("other", { email: "someone@ascendcorp.com", email_verified: true })
      .firestore(),
  "account without an email claim": () => testEnv.authenticatedContext("noemail").firestore(),
  "admin email with different letter case": () =>
    testEnv
      .authenticatedContext("upper", { email: ADMIN_EMAIL.toUpperCase(), email_verified: true })
      .firestore(),
  "signed-out client": () => testEnv.unauthenticatedContext().firestore(),
};

describe("hide and unhide", () => {
  it("should let a verified admin hide and unhide a card without being a board member", async () => {
    await assertSucceeds(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { hidden: true, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { hidden: false, updatedAt: serverTimestamp() }),
    );
  });

  it("should reject hide by a board owner, a member, the card author and a stranger", async () => {
    for (const client of [alice(), bob(), stranger()]) {
      await assertFails(
        updateDoc(doc(client, `boards/${SRC}/cards/visible`), { hidden: true, updatedAt: serverTimestamp() }),
      );
    }
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should reject hide by a ${label}`, async () => {
      await assertFails(
        updateDoc(doc(makeClient(), `boards/${SRC}/cards/visible`), { hidden: true, updatedAt: serverTimestamp() }),
      );
    });
  }

  it("should reject hide on a completed or a waiting board", async () => {
    await assertFails(
      updateDoc(doc(admin(), `boards/${COMPLETED}/cards/done`), { hidden: true, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(admin(), `boards/${WAITING}/cards/early`), { hidden: true, updatedAt: serverTimestamp() }),
    );
  });

  it("should reject an admin update that changes more than hidden and updatedAt", async () => {
    await assertFails(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), {
        hidden: true, text: "edited by admin", updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { text: "edited by admin", updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { hidden: true, authorId: "admin", updatedAt: serverTimestamp() }),
    );
  });

  it("should reject a hidden value that is not a boolean", async () => {
    await assertFails(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { hidden: "yes", updatedAt: serverTimestamp() }),
    );
  });

  it("should reject an admin hide that does not set updatedAt to the request time", async () => {
    await assertFails(updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { hidden: true, updatedAt: seeded }));
  });

  it("should reject the author unhiding their own hidden card", async () => {
    await assertFails(
      updateDoc(doc(bob(), `boards/${SRC}/cards/secret`), { hidden: false, updatedAt: serverTimestamp() }),
    );
  });
});

describe("reading hidden cards", () => {
  it("should hide a hidden card from other members and strangers", async () => {
    await assertFails(getDoc(doc(alice(), `boards/${SRC}/cards/secret`)));
    await assertFails(getDoc(doc(stranger(), `boards/${SRC}/cards/secret`)));
  });

  it("should let the author, and only the author, read their own hidden card", async () => {
    await assertSucceeds(getDoc(doc(bob(), `boards/${SRC}/cards/secret`)));
    await assertSucceeds(getDoc(doc(alice(), `boards/${SRC}/cards/aliceHidden`)));
    await assertFails(getDoc(doc(bob(), `boards/${SRC}/cards/aliceHidden`)));
  });

  it("should let a verified admin read every card without being a member", async () => {
    await assertSucceeds(getDoc(doc(admin(), `boards/${SRC}/cards/secret`)));
    const everything = await assertSucceeds(getDocs(collection(admin(), `boards/${SRC}/cards`)));
    if (everything.size !== 4) throw new Error(`expected 4 cards, got ${everything.size}`);
  });

  it("should show a card without a hidden field only to its author and the admin", async () => {
    await assertFails(getDoc(doc(alice(), `boards/${SRC}/cards/legacy`)));
    await assertSucceeds(getDoc(doc(bob(), `boards/${SRC}/cards/legacy`)));
    await assertSucceeds(getDoc(doc(admin(), `boards/${SRC}/cards/legacy`)));
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should not let a ${label} read a hidden card`, async () => {
      await assertFails(getDoc(doc(makeClient(), `boards/${SRC}/cards/secret`)));
    });
  }

  it("should allow the member query hidden == false and return no hidden card", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(alice(), `boards/${SRC}/cards`), where("hidden", "==", false))),
    );
    const ids = snapshot.docs.map((cardDoc) => cardDoc.id).sort();
    if (ids.join(",") !== "visible") throw new Error(`unexpected cards: ${ids.join(",")}`);
  });

  it("should allow the author query authorId == uid and include the author's hidden cards", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(bob(), `boards/${SRC}/cards`), where("authorId", "==", "bob"))),
    );
    const ids = snapshot.docs.map((cardDoc) => cardDoc.id).sort();
    if (ids.join(",") !== "legacy,secret,visible") throw new Error(`unexpected cards: ${ids.join(",")}`);
  });

  it("should reject member queries that could return other users' hidden cards", async () => {
    await assertFails(getDocs(collection(alice(), `boards/${SRC}/cards`)));
    await assertFails(getDocs(query(collection(alice(), `boards/${SRC}/cards`), where("hidden", "==", true))));
    await assertFails(getDocs(query(collection(alice(), `boards/${SRC}/cards`), where("authorId", "==", "bob"))));
  });

  it("should reject card queries from a stranger", async () => {
    await assertFails(
      getDocs(query(collection(stranger(), `boards/${SRC}/cards`), where("hidden", "==", false))),
    );
  });
});

describe("normal card writes with the hidden field", () => {
  const cardData = (overrides: Record<string, unknown> = {}) => ({
    columnId: "ideas",
    text: "fresh",
    authorId: "bob",
    hidden: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  });

  it("should let a member create a card with hidden false", async () => {
    await assertSucceeds(setDoc(doc(bob(), `boards/${SRC}/cards/fresh`), cardData()));
  });

  it("should reject a member creating a card that is already hidden", async () => {
    await assertFails(setDoc(doc(bob(), `boards/${SRC}/cards/fresh`), cardData({ hidden: true })));
  });

  it("should reject a member creating a card without the hidden field", async () => {
    const { hidden: _omitted, ...withoutHidden } = cardData();
    void _omitted;
    await assertFails(setDoc(doc(bob(), `boards/${SRC}/cards/fresh`), withoutHidden));
  });

  it("should reject a member card carrying move fields", async () => {
    await assertFails(
      setDoc(doc(bob(), `boards/${SRC}/cards/fresh`), cardData({ movedFromBoardId: DEST, movedFromCardId: "x" })),
    );
  });

  it("should let the author edit the text of their own hidden card and keep it hidden", async () => {
    await assertSucceeds(
      updateDoc(doc(bob(), `boards/${SRC}/cards/secret`), { text: "edited", updatedAt: serverTimestamp() }),
    );
  });

  it("should reject an admin creating a normal card without being a member", async () => {
    await assertFails(setDoc(doc(admin(), `boards/${SRC}/cards/fresh`), cardData({ authorId: "admin" })));
  });

});

describe("admin column move (D101)", () => {
  const columnUpdate = (client: ReturnType<typeof admin>, boardId: string, cardId: string, columnId: string) =>
    updateDoc(doc(client, `boards/${boardId}/cards/${cardId}`), { columnId, updatedAt: serverTimestamp() });

  it("should let a verified admin move a card to any other column without being a member", async () => {
    await assertSucceeds(columnUpdate(admin(), SRC, "visible", "to-improve"));
    await assertSucceeds(columnUpdate(admin(), SRC, "visible", "ideas"));
    await assertSucceeds(columnUpdate(admin(), SRC, "visible", "went-well"));
    await assertSucceeds(columnUpdate(admin(), SRC, "secret", "to-improve"));
  });

  it("should reject a column that does not exist", async () => {
    await assertFails(columnUpdate(admin(), SRC, "visible", "somewhere-else"));
    await assertFails(
      updateDoc(doc(admin(), `boards/${SRC}/cards/visible`), { columnId: 5, updatedAt: serverTimestamp() }),
    );
  });

  it("should reject a column move on a completed or a waiting board", async () => {
    await assertFails(columnUpdate(admin(), COMPLETED, "done", "ideas"));
    await assertFails(columnUpdate(admin(), WAITING, "early", "ideas"));
  });

  it("should reject a column move by the owner, the author, a member and a stranger", async () => {
    for (const client of [alice(), bob(), stranger()]) {
      await assertFails(columnUpdate(client, SRC, "visible", "ideas"));
    }
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should reject a column move by a ${label}`, async () => {
      await assertFails(columnUpdate(makeClient(), SRC, "visible", "ideas"));
    });
  }

  it("should reject changing anything besides the column in the same update", async () => {
    const ref = doc(admin(), `boards/${SRC}/cards/visible`);
    await assertFails(updateDoc(ref, { columnId: "ideas", text: "changed", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { columnId: "ideas", authorId: "admin", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { columnId: "ideas", hidden: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { columnId: "ideas", updatedAt: seeded }));
  });
});

describe("session step (D116 to D123)", () => {
  const phaseUpdate = (client: ReturnType<typeof admin>, boardId: string, data: Record<string, unknown>) =>
    updateDoc(doc(client, `boards/${boardId}`), { ...data, updatedAt: serverTimestamp() });

  it("should let a verified admin set any step from 1 to 6 without being a member", async () => {
    for (const phase of [2, 6, 1, 4]) await assertSucceeds(phaseUpdate(admin(), SRC, { phase }));
  });

  it("should reject a step outside 1 to 6 or that is not a whole number", async () => {
    for (const phase of [0, 7, -1, 2.5, "3", null, true]) {
      await assertFails(phaseUpdate(admin(), SRC, { phase }));
    }
  });

  it("should reject a step change on a completed or a waiting board", async () => {
    await assertFails(phaseUpdate(admin(), COMPLETED, { phase: 2 }));
    await assertFails(phaseUpdate(admin(), WAITING, { phase: 2 }));
  });

  it("should reject changing anything else together with the step", async () => {
    await assertFails(phaseUpdate(admin(), SRC, { phase: 2, title: "Renamed" }));
    await assertFails(phaseUpdate(admin(), SRC, { phase: 2, status: "completed" }));
    await assertFails(phaseUpdate(admin(), SRC, { phase: 2, ownerId: "admin" }));
  });

  it("should reject a step update that does not set updatedAt to the request time", async () => {
    await assertFails(updateDoc(doc(admin(), `boards/${SRC}`), { phase: 2, updatedAt: seeded }));
  });

  it("should reject a step change by the board owner, a member and a stranger", async () => {
    for (const client of [alice(), bob(), stranger()]) {
      await assertFails(phaseUpdate(client, SRC, { phase: 2 }));
    }
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should reject a step change by a ${label}`, async () => {
      await assertFails(phaseUpdate(makeClient(), SRC, { phase: 2 }));
    });
  }

  it("should let every member read the current step", async () => {
    await assertSucceeds(phaseUpdate(admin(), SRC, { phase: 3 }));
    const snapshot = await assertSucceeds(getDoc(doc(bob(), `boards/${SRC}`)));
    if (snapshot.data()?.phase !== 3) throw new Error("step should be readable");
  });
});

describe("board timer (D109 to D115)", () => {
  const inMinutes = (minutes: number) => Timestamp.fromMillis(Date.now() + minutes * 60_000);
  const timerUpdate = (client: ReturnType<typeof admin>, boardId: string, data: Record<string, unknown>) =>
    updateDoc(doc(client, `boards/${boardId}`), { ...data, updatedAt: serverTimestamp() });
  const startTimer = (client: ReturnType<typeof admin>, boardId = SRC, minutes = 5) =>
    timerUpdate(client, boardId, { timerEndsAt: inMinutes(minutes), timerDurationSec: minutes * 60 });

  it("should let a verified admin start and stop a timer without being a member", async () => {
    await assertSucceeds(startTimer(admin()));
    await assertSucceeds(timerUpdate(admin(), SRC, { timerEndsAt: null, timerDurationSec: null }));
  });

  it("should accept the longest allowed timer of 2 hours", async () => {
    await assertSucceeds(
      timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(119), timerDurationSec: 7200 }),
    );
  });

  it("should reject an end time in the past or more than 2 hours ahead", async () => {
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(-1), timerDurationSec: 60 }));
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(125), timerDurationSec: 60 }));
  });

  it("should reject values of the wrong type or range", async () => {
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: "soon", timerDurationSec: 60 }));
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: "300" }));
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: 0 }));
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: 7201 }));
    await assertFails(timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: 1.5 }));
  });

  it("should reject a timer on a completed or a waiting board", async () => {
    await assertFails(startTimer(admin(), COMPLETED));
    await assertFails(startTimer(admin(), WAITING));
  });

  it("should reject changing anything else on the board together with the timer", async () => {
    await assertFails(
      timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: 300, title: "Renamed" }),
    );
    await assertFails(
      timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: 300, status: "completed" }),
    );
    await assertFails(
      timerUpdate(admin(), SRC, { timerEndsAt: inMinutes(5), timerDurationSec: 300, ownerId: "admin" }),
    );
  });

  it("should reject a timer update that does not set updatedAt to the request time", async () => {
    await assertFails(
      updateDoc(doc(admin(), `boards/${SRC}`), { timerEndsAt: inMinutes(5), timerDurationSec: 300, updatedAt: seeded }),
    );
  });

  it("should reject starting a timer by the board owner, a member and a stranger", async () => {
    for (const client of [alice(), bob(), stranger()]) {
      await assertFails(startTimer(client));
    }
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should reject starting a timer by a ${label}`, async () => {
      await assertFails(startTimer(makeClient()));
    });
  }

  it("should keep the owner's rename of the board working", async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), `boards/${SRC}`), { title: "Renamed by owner", updatedAt: serverTimestamp() }),
    );
  });

  it("should let every member read the running timer", async () => {
    await assertSucceeds(startTimer(admin()));
    const snapshot = await assertSucceeds(getDoc(doc(bob(), `boards/${SRC}`)));
    if (!snapshot.data()?.timerEndsAt) throw new Error("timer should be readable");
  });
});

describe("admin stacking (D102 to D106)", () => {
  const groupUpdate = (client: ReturnType<typeof admin>, cardId: string, data: Record<string, unknown>, boardId = SRC) =>
    updateDoc(doc(client, `boards/${boardId}/cards/${cardId}`), { ...data, updatedAt: serverTimestamp() });

  it("should let a verified admin set and clear a groupId without being a member", async () => {
    await assertSucceeds(groupUpdate(admin(), "visible", { groupId: "visible" }));
    await assertSucceeds(groupUpdate(admin(), "secret", { groupId: "visible" }));
    await assertSucceeds(groupUpdate(admin(), "secret", { groupId: null }));
  });

  it("should let the admin join a stack in another column in one update", async () => {
    await assertSucceeds(groupUpdate(admin(), "visible", { groupId: "g1", columnId: "to-improve" }));
  });

  it("should let the admin stack two cards in one batch", async () => {
    const db = admin();
    const batch = writeBatch(db);
    batch.update(doc(db, `boards/${SRC}/cards/visible`), { groupId: "visible", updatedAt: serverTimestamp() });
    batch.update(doc(db, `boards/${SRC}/cards/secret`), { groupId: "visible", columnId: "went-well", updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  it("should reject a groupId that is not a short non-empty string or null", async () => {
    await assertFails(groupUpdate(admin(), "visible", { groupId: 5 }));
    await assertFails(groupUpdate(admin(), "visible", { groupId: "" }));
    await assertFails(groupUpdate(admin(), "visible", { groupId: "x".repeat(65) }));
    await assertFails(groupUpdate(admin(), "visible", { groupId: true }));
  });

  it("should reject an invalid column together with a groupId", async () => {
    await assertFails(groupUpdate(admin(), "visible", { groupId: "g", columnId: "nowhere" }));
  });

  it("should reject changing text, author or hidden state together with a groupId", async () => {
    await assertFails(groupUpdate(admin(), "visible", { groupId: "g", text: "changed" }));
    await assertFails(groupUpdate(admin(), "visible", { groupId: "g", authorId: "admin" }));
    await assertFails(groupUpdate(admin(), "visible", { groupId: "g", hidden: true }));
  });

  it("should reject stacking on a completed or a waiting board", async () => {
    await assertFails(groupUpdate(admin(), "done", { groupId: "g" }, COMPLETED));
    await assertFails(groupUpdate(admin(), "early", { groupId: "g" }, WAITING));
  });

  it("should reject stacking by the owner, the author, a member and a stranger", async () => {
    for (const client of [alice(), bob(), stranger()]) {
      await assertFails(groupUpdate(client, "visible", { groupId: "g" }));
    }
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should reject stacking by a ${label}`, async () => {
      await assertFails(groupUpdate(makeClient(), "visible", { groupId: "g" }));
    });
  }

  it("should reject a member creating a card that already carries a groupId", async () => {
    await assertFails(
      setDoc(doc(bob(), `boards/${SRC}/cards/fresh`), {
        columnId: "ideas", text: "x", authorId: "bob", hidden: false, groupId: "g",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("admin delete (D100)", () => {
  it("should let a verified admin delete any card on an in-progress board without being a member", async () => {
    await assertSucceeds(deleteDoc(doc(admin(), `boards/${SRC}/cards/visible`)));
    await assertSucceeds(deleteDoc(doc(admin(), `boards/${SRC}/cards/secret`)));
    await assertSucceeds(deleteDoc(doc(admin(), `boards/${SRC}/cards/legacy`)));
  });

  it("should reject an admin delete on a completed or a waiting board", async () => {
    await assertFails(deleteDoc(doc(admin(), `boards/${COMPLETED}/cards/done`)));
    await assertFails(deleteDoc(doc(admin(), `boards/${WAITING}/cards/early`)));
  });

  it("should still reject deleting another user's card by a member, a stranger and look-alike accounts", async () => {
    await assertFails(deleteDoc(doc(bob(), `boards/${SRC}/cards/aliceHidden`)));
    await assertFails(deleteDoc(doc(stranger(), `boards/${SRC}/cards/visible`)));
    for (const makeClient of Object.values(impostors)) {
      await assertFails(deleteDoc(doc(makeClient(), `boards/${SRC}/cards/visible`)));
    }
  });
});

describe("admin board listing", () => {
  it("should let a verified admin list boards", async () => {
    const snapshot = await assertSucceeds(getDocs(collection(admin(), "boards")));
    if (snapshot.size !== 5) throw new Error(`expected 5 boards, got ${snapshot.size}`);
  });

  it("should let a verified admin list in-progress boards with a status filter", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(admin(), "boards"), where("status", "==", "in-progress"))),
    );
    if (snapshot.size !== 3) throw new Error(`expected 3 boards, got ${snapshot.size}`);
  });

  it("should keep listing boards denied for members, owners and strangers", async () => {
    for (const client of [alice(), bob(), stranger()]) {
      await assertFails(getDocs(collection(client, "boards")));
    }
  });

  for (const [label, makeClient] of Object.entries(impostors)) {
    it(`should keep listing boards denied for a ${label}`, async () => {
      await assertFails(getDocs(collection(makeClient(), "boards")));
    });
  }
});

type MoveOptions = {
  src?: [string, string];
  dest?: [string, string];
  ledgerDest?: [string, string];
  dest2?: [string, string];
  card?: Record<string, unknown>;
  movedFrom?: [string, string];
  omit?: ("ledger" | "dest" | "delete")[];
  order?: ("ledger" | "dest" | "delete")[];
  extraDelete?: [string, string];
  client?: ReturnType<typeof admin>;
};

const ORIGINAL = { columnId: "went-well", text: "visible", authorId: "bob", hidden: false };

async function readSource(boardId: string, cardId: string) {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    data = (await getDoc(doc(context.firestore(), `boards/${boardId}/cards/${cardId}`))).data();
  });
  const source = data ?? ORIGINAL; // after a successful move the source is gone: replay with the original values
  return {
    columnId: source.columnId,
    text: source.text,
    authorId: source.authorId,
    hidden: source.hidden ?? false,
  };
}

function moveBatch(options: MoveOptions, source: Record<string, unknown>) {
  const db = options.client ?? admin();
  const [sourceBoard, sourceCard] = options.src ?? [SRC, "visible"];
  const [destBoard, destCard] = options.dest ?? [DEST, "moved"];
  const [ledgerBoard, ledgerCard] = options.ledgerDest ?? [destBoard, destCard];
  const [fromBoard, fromCard] = options.movedFrom ?? [sourceBoard, sourceCard];
  const destData: Record<string, unknown> = {
    ...source,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    movedFromBoardId: fromBoard,
    movedFromCardId: fromCard,
    ...(options.card ?? {}),
  };
  for (const key of Object.keys(destData)) if (destData[key] === undefined) delete destData[key];
  const batch = writeBatch(db);
  const steps = {
    ledger: () =>
      batch.set(doc(db, `boards/${sourceBoard}/cardMoves/${sourceCard}`), {
        destBoardId: ledgerBoard, destCardId: ledgerCard, movedAt: serverTimestamp(),
      }),
    dest: () => {
      batch.set(doc(db, `boards/${destBoard}/cards/${destCard}`), destData);
      if (options.dest2) batch.set(doc(db, `boards/${options.dest2[0]}/cards/${options.dest2[1]}`), destData);
    },
    delete: () => {
      batch.delete(doc(db, `boards/${sourceBoard}/cards/${sourceCard}`));
      if (options.extraDelete) batch.delete(doc(db, `boards/${options.extraDelete[0]}/cards/${options.extraDelete[1]}`));
    },
  } as const;
  for (const step of options.order ?? ["ledger", "dest", "delete"]) {
    if (!(options.omit ?? []).includes(step)) steps[step]();
  }
  return batch;
}

async function move(options: MoveOptions = {}) {
  const [sourceBoard, sourceCard] = options.src ?? [SRC, "visible"];
  const source = await readSource(sourceBoard, sourceCard);
  return moveBatch(options, source).commit();
}
const allowed = (options?: MoveOptions) => assertSucceeds(move(options));
const denied = (options?: MoveOptions) => assertFails(move(options));

describe("move a card to another board", () => {
  it("should move a card with ledger, destination and source delete in one batch", async () => {
    await allowed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const source = await getDoc(doc(db, `boards/${SRC}/cards/visible`));
      const moved = await getDoc(doc(db, `boards/${DEST}/cards/moved`));
      const ledger = await getDoc(doc(db, `boards/${SRC}/cardMoves/visible`));
      if (source.exists()) throw new Error("source card should be gone");
      if (!ledger.exists()) throw new Error("ledger should exist");
      const data = moved.data();
      if (data?.text !== "visible" || data?.authorId !== "bob" || data?.hidden !== false) {
        throw new Error(`moved card differs from the source: ${JSON.stringify(data)}`);
      }
    });
  });

  it("should accept the batch in any write order", async () => {
    await allowed({ order: ["dest", "delete", "ledger"] });
  });

  it("should keep a hidden card hidden when it moves", async () => {
    await allowed({ src: [SRC, "secret"], dest: [DEST, "movedSecret"] });
  });

  it("should move a card back with a fresh id", async () => {
    await allowed();
    await allowed({ src: [DEST, "moved"], dest: [SRC, "backAgain"] });
  });

  it("should reject a destination without deleting the source", async () => {
    await denied({ omit: ["delete"] });
    await denied({ omit: ["ledger", "delete"] });
  });

  it("should reject a ledger and a source delete without the destination", async () => {
    await denied({ omit: ["dest"] });
  });

  it("should reject a ledger without the matching destination", async () => {
    await denied({ omit: ["dest", "delete"] });
  });

  it("should reject a destination and delete without a ledger", async () => {
    await denied({ omit: ["ledger"] });
  });

  it("should allow deleting a second card in the same batch because the admin may delete any card (D100)", async () => {
    await allowed({ extraDelete: [SRC, "secret"] });
  });

  it("should reject changed text, column, author or hidden state", async () => {
    await denied({ card: { text: "changed" } });
    await denied({ card: { columnId: "ideas" } });
    await denied({ card: { authorId: "admin" } });
    await denied({ card: { hidden: true } });
    await denied({ src: [SRC, "secret"], dest: [DEST, "movedSecret"], card: { hidden: false } });
    await denied({ card: { hidden: undefined } });
  });

  it("should reject unknown fields on the destination", async () => {
    await denied({ card: { extra: 1 } });
  });

  it("should reject a ledger that points to another card or board", async () => {
    await denied({ ledgerDest: [DEST, "elsewhere"] });
    await denied({ ledgerDest: [OTHER, "moved"] });
  });

  it("should reject a destination that claims another source", async () => {
    await denied({ movedFrom: [SRC, "secret"] });
    await denied({ movedFrom: [OTHER, "visible"] });
  });

  it("should reject two destination copies of one source", async () => {
    await denied({ dest2: [DEST, "copy2"] });
    await denied({ dest2: [OTHER, "moved"] });
  });

  it("should reject replaying a move after it succeeded", async () => {
    await allowed();
    await denied();
    await denied({ dest: [OTHER, "again"] });
    await denied({ omit: ["ledger", "delete"] });
    await denied({ omit: ["dest", "delete"] });
  });

  it("should reject an existing destination id, the same board and a missing board", async () => {
    await denied({ dest: [DEST, "existing"] });
    await denied({ dest: [SRC, "sameBoard"] });
    await denied({ dest: ["missing", "moved"] });
  });

  it("should reject moving into or out of completed and waiting boards", async () => {
    await denied({ dest: [COMPLETED, "moved"] });
    await denied({ dest: [WAITING, "moved"] });
    await denied({ src: [COMPLETED, "done"], dest: [DEST, "moved"] });
    await denied({ src: [WAITING, "early"], dest: [DEST, "moved"] });
  });

  it("should reject moves by members, the owner, unverified and other accounts", async () => {
    await denied({ client: alice() });
    await denied({ client: bob() });
    for (const makeClient of Object.values(impostors)) await denied({ client: makeClient() });
  });

  it("should reject reusing a moved card id for a new card in the source board", async () => {
    await allowed();
    await assertFails(
      setDoc(doc(bob(), `boards/${SRC}/cards/visible`), {
        columnId: "ideas", text: "again", authorId: "bob", hidden: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    );
  });

  it("should reject moving a card back under the id of its earlier ledger", async () => {
    await allowed();
    await denied({ src: [DEST, "moved"], dest: [SRC, "visible"] });
  });

  it("should still allow a member to create a card with a fresh id after a move", async () => {
    await allowed();
    await assertSucceeds(
      setDoc(doc(bob(), `boards/${SRC}/cards/fresh`), {
        columnId: "ideas", text: "new", authorId: "bob", hidden: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("move ledger", () => {
  beforeEach(async () => {
    await allowed();
  });

  it("should let only the admin read a ledger", async () => {
    await assertSucceeds(getDoc(doc(admin(), `boards/${SRC}/cardMoves/visible`)));
    await assertFails(getDoc(doc(alice(), `boards/${SRC}/cardMoves/visible`)));
    await assertFails(getDoc(doc(bob(), `boards/${SRC}/cardMoves/visible`)));
  });

  it("should never allow a ledger to be updated or deleted", async () => {
    for (const client of [admin(), alice(), bob()]) {
      await assertFails(updateDoc(doc(client, `boards/${SRC}/cardMoves/visible`), { destCardId: "z" }));
      await assertFails(deleteDoc(doc(client, `boards/${SRC}/cardMoves/visible`)));
    }
  });

  it("should let the admin delete a moved card like any other card (D100)", async () => {
    await assertSucceeds(deleteDoc(doc(admin(), `boards/${DEST}/cards/moved`)));
  });

  it("should reject the admin creating a ledger on its own", async () => {
    await assertFails(
      setDoc(doc(admin(), `boards/${SRC}/cardMoves/secret`), {
        destBoardId: DEST, destCardId: "moved", movedAt: serverTimestamp(),
      }),
    );
  });
});

describe("move budget", () => {
  async function moveMany(count: number) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (let index = 0; index < count; index += 1) {
        await setDoc(doc(db, `boards/${SRC}/cards/bulk${index}`), seedCard(`bulk ${index}`, "bob", false));
      }
    });
    const db = admin();
    const batch = writeBatch(db);
    for (let index = 0; index < count; index += 1) {
      batch.set(doc(db, `boards/${SRC}/cardMoves/bulk${index}`), {
        destBoardId: DEST, destCardId: `bulkDest${index}`, movedAt: serverTimestamp(),
      });
      batch.set(doc(db, `boards/${DEST}/cards/bulkDest${index}`), {
        columnId: "went-well", text: `bulk ${index}`, authorId: "bob", hidden: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        movedFromBoardId: SRC, movedFromCardId: `bulk${index}`,
      });
      batch.delete(doc(db, `boards/${SRC}/cards/bulk${index}`));
    }
    return batch.commit();
  }

  it("should move up to 4 cards in one batch", async () => {
    await assertSucceeds(moveMany(4));
  });
});
