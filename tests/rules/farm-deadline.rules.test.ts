import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

const probeRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      allow read: if request.time < resource.data.startedAt + duration.value(15, 's');
    }
  }
}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: "demo-retro-room-farm-probe", firestore: { rules: probeRules } });
});

afterAll(async () => {
  await testEnv.cleanup();
});

async function seedStartedAt(gameId: string, secondsAgo: number) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `games/${gameId}`), {
      startedAt: Timestamp.fromMillis(Date.now() - secondsAgo * 1000),
    });
  });
}

describe("stored timestamp plus duration in Rules (D153)", () => {
  it("should accept a request before startedAt plus 15 seconds and reject one after it", async () => {
    await seedStartedAt("justStarted", 0);
    await seedStartedAt("fiveSecondsIn", 5);
    await seedStartedAt("expired", 17);
    await seedStartedAt("longAgo", 600);
    await seedStartedAt("inTheFuture", -60);
    const client = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(client, "games/justStarted")));
    await assertSucceeds(getDoc(doc(client, "games/fiveSecondsIn")));
    await assertSucceeds(getDoc(doc(client, "games/inTheFuture")));
    await assertFails(getDoc(doc(client, "games/expired")));
    await assertFails(getDoc(doc(client, "games/longAgo")));
  });
});
