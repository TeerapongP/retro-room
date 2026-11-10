import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { isMockMode } from "../mock";

const EMULATOR_PROJECT_ID = "demo-retro-room";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_EMULATOR_PORT = 8080;
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

const productionFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const emulatorFirebaseConfig = {
  apiKey: "emulator-fake-api-key",
  authDomain: "localhost",
  projectId: EMULATOR_PROJECT_ID,
  appId: "emulator-fake-app-id",
};

type GlobalWithEmulatorState = typeof globalThis & {
  __retroRoomEmulatorConnected?: WeakSet<object>;
};

function connectedEmulatorServices(): WeakSet<object> {
  const globalState = globalThis as GlobalWithEmulatorState;
  globalState.__retroRoomEmulatorConnected ??= new WeakSet();
  return globalState.__retroRoomEmulatorConnected;
}

function isEmulatorRequested(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";
}

/** True only for local development. Production builds never report emulator mode. */
export function isFirebaseEmulatorEnabled(): boolean {
  return isEmulatorRequested() && process.env.NODE_ENV !== "production";
}

function assertEmulatorModeIsLocal(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Firebase emulator mode is not allowed in a production build");
  }
  if (typeof window !== "undefined" && !LOCAL_HOSTNAMES.includes(window.location.hostname)) {
    throw new Error("Firebase emulator mode is only allowed on localhost");
  }
}

function getFirebaseApp(): FirebaseApp {
  if (isEmulatorRequested()) {
    assertEmulatorModeIsLocal();
    return getApps().length > 0 ? getApp() : initializeApp(emulatorFirebaseConfig);
  }
  return getApps().length > 0 ? getApp() : initializeApp(productionFirebaseConfig);
}

export function getFirebaseAuth(): Auth {
  // Mock mode never talks to Firebase; the placeholder only satisfies default parameters (F19, D89).
  if (isMockMode()) return {} as Auth;
  const auth = getAuth(getFirebaseApp());
  if (isEmulatorRequested() && !connectedEmulatorServices().has(auth)) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
    connectedEmulatorServices().add(auth);
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  if (isMockMode()) return {} as Firestore;
  const firestore = getFirestore(getFirebaseApp());
  if (isEmulatorRequested() && !connectedEmulatorServices().has(firestore)) {
    connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    connectedEmulatorServices().add(firestore);
  }
  return firestore;
}

export function describeFirebaseError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  switch (code) {
    case "permission-denied":
      return "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (permission denied)";
    case "unavailable":
      return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ (unavailable)";
    case "aborted":
      return "มีการแก้ไขพร้อมกันหลายครั้งจนบันทึกไม่สำเร็จ กรุณากดอีกครั้ง (aborted)";
    case "round-in-progress":
      return "ยังมีรอบเกมที่เล่นอยู่ ต้องจบหรือยกเลิกก่อน";
    case "fallback-pending":
      return "รอบที่ยกเลิกยังไม่ได้หมุนวงล้อสำรอง ต้องหมุนก่อนเริ่มรอบใหม่";
    case "already-resolved":
      return "รอบนี้มีผลหรือจบไปแล้ว";
    case "not-active":
      return "รอบนี้ไม่ใช่รอบปัจจุบัน หรือบอร์ดไม่ได้อยู่ขั้นที่ 5";
    case "not-eligible":
      return "ผู้ที่ถูกเลือกไม่ได้เล่นรอบนี้";
    case "unauthenticated":
      return "กรุณาเข้าสู่ระบบอีกครั้ง (unauthenticated)";
    case "auth/popup-blocked":
      return "เบราว์เซอร์บล็อกหน้าต่างล็อกอิน กรุณาอนุญาต popup แล้วลองใหม่";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "ปิดหน้าต่างล็อกอินก่อนเสร็จสิ้น";
    case "auth/unauthorized-domain":
      return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase (unauthorized-domain)";
    case "auth/network-request-failed":
      return "เครือข่ายขัดข้องระหว่างล็อกอิน กรุณาลองใหม่";
    default:
      return code ? `เกิดข้อผิดพลาด (${code})` : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
  }
}
