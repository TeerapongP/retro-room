import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  type User,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { savePlayerName } from "@/lib/firebase/profile";

const PROJECT_ID = "demo-retro-room";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";

export type TestUser = {
  app: FirebaseApp;
  db: Firestore;
  user: User;
  uid: string;
  name: string;
};

let appCounter = 0;
const createdApps: FirebaseApp[] = [];

/** Signs in a simulated Google user through the Auth emulator. No real Google account is involved. */
export async function createTestUser(
  sub: string,
  displayName: string,
  options: { withPlayerName?: boolean } = {},
): Promise<TestUser> {
  const app = initializeApp(
    { apiKey: "emulator-fake-api-key", projectId: PROJECT_ID, appId: "emulator-fake-app-id" },
    `test-user-${sub}-${appCounter++}`,
  );
  createdApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({
      sub,
      email: `${sub}@example.test`,
      email_verified: true,
      name: displayName,
    }),
  );
  const { user } = await signInWithCredential(auth, credential);
  if (options.withPlayerName ?? true) {
    await savePlayerName(user, displayName, db);
  }
  return { app, db, user, uid: user.uid, name: displayName };
}

export async function resetEmulators(): Promise<void> {
  await Promise.all(createdApps.splice(0).map((app) => deleteApp(app)));
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE",
  });
}

export async function waitUntil(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
