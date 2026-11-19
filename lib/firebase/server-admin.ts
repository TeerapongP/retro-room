import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const ADMIN_APP_NAME = "retro-room-server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAdminApp() {
  const existing = getApps().find(app => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const usingEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)
    || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" && process.env.NODE_ENV !== "production";
  if (usingEmulators) {
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-retro-room" }, ADMIN_APP_NAME);
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    let credentials: unknown;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid JSON");
    }
    if (!isRecord(credentials)) throw new Error("FIREBASE_SERVICE_ACCOUNT is invalid");

    const projectId = credentials.project_id ?? credentials.projectId;
    const clientEmail = credentials.client_email ?? credentials.clientEmail;
    const privateKey = credentials.private_key ?? credentials.privateKey;
    if (typeof projectId !== "string" || typeof clientEmail !== "string" || typeof privateKey !== "string") {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required credentials");
    }
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) {
      throw new Error("Firebase service account project does not match the client project");
    }

    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
      projectId,
    }, ADMIN_APP_NAME);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is required for production API requests");
  }

  return initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  }, ADMIN_APP_NAME);
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}
