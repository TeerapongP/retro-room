"use client";

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User, } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getFirebaseAuth } from "./client";
import { getPlayerName, savePlayerName as savePlayerNameForUser } from "./profile";

type FirebaseAuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User };

/** "missing" means Firestore confirmed there is no player name. A failed read is "error", never "missing". */
type PlayerProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; playerName: string }
  | { status: "error"; error: unknown };

/** How long the auth or profile load may run before the UI offers a retry. The request itself keeps running. */
export const LOADING_TIMEOUT_MS = 15_000;

type AuthContextValue = {
  firebaseAuthState: FirebaseAuthState;
  playerProfile: PlayerProfileState;
  /** True once the current auth or profile load has run longer than LOADING_TIMEOUT_MS. */
  isLoadingSlow: boolean;
  /** True after Firebase ended a signed-in session that the user did not sign out of. */
  sessionEnded: boolean;
  dismissSessionEnded: () => void;
  /** Restarts the profile read, or reloads the page when Firebase Auth itself has not answered. */
  retryLoading: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  savePlayerName: (rawName: string) => Promise<void>;
};

export const SESSION_ENDED_MESSAGE = "เซสชันของคุณหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";

const USER_SIGN_OUT_KEY = "retro-room:user-signed-out";

/** localStorage is shared between tabs, so a sign-out started in any tab of this app reads as the user's own. */
function setUserSignOutMarker(isSet: boolean): void {
  try {
    if (isSet) localStorage.setItem(USER_SIGN_OUT_KEY, "true");
    else localStorage.removeItem(USER_SIGN_OUT_KEY);
  } catch { }
}

function hasUserSignOutMarker(): boolean {
  try {
    return localStorage.getItem(USER_SIGN_OUT_KEY) === "true";
  } catch {
    return false;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseAuthState, setFirebaseAuthState] = useState<FirebaseAuthState>({
    status: "loading",
  });

  const [playerProfile, setPlayerProfile] = useState<PlayerProfileState>({ status: "loading" });
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [hasLoadTimedOut, setHasLoadTimedOut] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const wasSignedInRef = useRef(false);

  useEffect(() => {
    return onAuthStateChanged(
      getFirebaseAuth(),
      (user) => {
        if (user) {
          wasSignedInRef.current = true;
          setUserSignOutMarker(false);
          setSessionEnded(false);
          setFirebaseAuthState({ status: "signedIn", user });
        } else {
          // Firebase clears the user itself when the credentials are revoked, disabled or can no longer refresh.
          // A network failure keeps the user, so a signedIn to signedOut change that the app did not start is a real session end.
          if (wasSignedInRef.current && !hasUserSignOutMarker()) setSessionEnded(true);
          wasSignedInRef.current = false;
          setFirebaseAuthState({ status: "signedOut" });
          setPlayerProfile({ status: "loading" });
        }
      },
      (error) => {
        console.error("Auth state error", error);
      },
    );
  }, []);

  const signedInUid =
    firebaseAuthState.status === "signedIn" ? firebaseAuthState.user.uid : null;

  useEffect(() => {
    if (!signedInUid) return;
    let isCurrent = true;
    getPlayerName(signedInUid)
      .then((playerName) => {
        if (!isCurrent) return;
        setPlayerProfile(playerName ? { status: "ready", playerName } : { status: "missing" });
      })
      .catch((error) => {
        console.error("Failed to load player profile", error);
        if (isCurrent) setPlayerProfile({ status: "error", error });
      });
    return () => {
      isCurrent = false;
    };
  }, [signedInUid, profileAttempt]);

  const isLoading =
    firebaseAuthState.status === "loading" ||
    (firebaseAuthState.status === "signedIn" && playerProfile.status === "loading");

  // One timer spans the whole load (auth, then profile). Only a retry or the end of loading restarts it.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setHasLoadTimedOut(true), LOADING_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      setHasLoadTimedOut(false);
    };
  }, [isLoading, profileAttempt]);

  const isLoadingSlow = isLoading && hasLoadTimedOut;

  const retryLoading = useCallback(() => {
    if (firebaseAuthState.status === "signedIn") {
      setPlayerProfile({ status: "loading" });
      setProfileAttempt((attempt) => attempt + 1);
    } else {
      window.location.reload();
    }
  }, [firebaseAuthState.status]);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  }, []);

  const signOutUser = useCallback(async () => {
    setUserSignOutMarker(true);
    try {
      await signOut(getFirebaseAuth());
    } catch (error) {
      setUserSignOutMarker(false);
      throw error;
    }
  }, []);

  const dismissSessionEnded = useCallback(() => setSessionEnded(false), []);

  const savePlayerName = useCallback(
    async (rawName: string) => {
      if (firebaseAuthState.status !== "signedIn") {
        throw new Error("Not signed in");
      }
      const playerName = await savePlayerNameForUser(firebaseAuthState.user, rawName);
      setPlayerProfile({ status: "ready", playerName });
    },
    [firebaseAuthState],
  );

  const value = useMemo(
    () => ({
      firebaseAuthState,
      playerProfile,
      isLoadingSlow,
      sessionEnded,
      dismissSessionEnded,
      retryLoading,
      signInWithGoogle,
      signOutUser,
      savePlayerName,
    }),
    [
      firebaseAuthState,
      playerProfile,
      isLoadingSlow,
      sessionEnded,
      dismissSessionEnded,
      retryLoading,
      signInWithGoogle,
      signOutUser,
      savePlayerName,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

const POST_LOGIN_PATH_KEY = "retro-room:post-login-path";

export function rememberPostLoginPath(path: string): void {
  try {
    sessionStorage.setItem(POST_LOGIN_PATH_KEY, path);
  } catch { }
}

export function consumePostLoginPath(): string {
  try {
    const stored = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
    sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
    if (stored && /^\/boards\/[A-Za-z0-9]+$/.test(stored)) {
      return stored;
    }
  } catch { }
  return "/dashboard";
}

export function usePlayerName(): string | null {
  const { playerProfile } = useAuth();
  return playerProfile.status === "ready" ? playerProfile.playerName : null;
}

/**
 * Client-side UX guard only. Firestore Security Rules enforce real access.
 * Returns the user once they are signed in and, unless allowed, have chosen a player name.
 */
export function useRequireSignedIn(options?: { allowMissingPlayerName?: boolean }): User | null {
  const router = useRouter();
  const { firebaseAuthState, playerProfile } = useAuth();
  const allowMissingPlayerName = options?.allowMissingPlayerName ?? false;

  useEffect(() => {
    if (firebaseAuthState.status === "signedOut") {
      rememberPostLoginPath(window.location.pathname);
      router.replace("/login");
      return;
    }
    if (
      firebaseAuthState.status === "signedIn" &&
      playerProfile.status === "missing" &&
      !allowMissingPlayerName
    ) {
      rememberPostLoginPath(window.location.pathname);
      router.replace("/setup");
    }
  }, [firebaseAuthState.status, playerProfile.status, allowMissingPlayerName, router]);

  if (firebaseAuthState.status !== "signedIn") return null;
  if (playerProfile.status === "loading" || playerProfile.status === "error") return null;
  if (playerProfile.status === "missing" && !allowMissingPlayerName) return null;
  return firebaseAuthState.user;
}
