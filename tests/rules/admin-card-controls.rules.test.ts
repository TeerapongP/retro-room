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

  it("should reject an admin deleting a card on its own", async () => {
    await assertFails(deleteDoc(doc(admin(), `boards/${SRC}/cards/visible`)));
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

  it("should reject deleting the source without the destination", async () => {
    await denied({ omit: ["ledger", "dest"] });
    await denied({ omit: ["dest"] });
  });

  it("should reject a ledger without the matching destination", async () => {
    await denied({ omit: ["dest", "delete"] });
  });

  it("should reject a destination and delete without a ledger", async () => {
    await denied({ omit: ["ledger"] });
  });

  it("should reject deleting a second card with the ledger of the first", async () => {
    await denied({ extraDelete: [SRC, "secret"] });
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

  it("should reject deleting the moved card without a ledger", async () => {
    await assertFails(deleteDoc(doc(admin(), `boards/${DEST}/cards/moved`)));
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
