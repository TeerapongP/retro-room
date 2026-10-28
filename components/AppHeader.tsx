"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, usePlayerName } from "@/lib/firebase/auth";

export function AppHeader() {
  const router = useRouter();
  const { firebaseAuthState, signOutUser } = useAuth();
  const playerName = usePlayerName();

  async function handleSignOut() {
    await signOutUser();
    router.replace("/login");
  }

  return (
    <header className="pixel-sign mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:mx-6">
      <Link href="/dashboard" className="font-pixel text-xs sm:text-sm">
        RETRO ROOM
      </Link>
      {firebaseAuthState.status === "signedIn" ? (
        <div className="flex items-center gap-3">
          <span className="text-sm">{playerName}</span>
          <button type="button" className="pixel-button pixel-button-gold" onClick={handleSignOut}>
            ออกจากระบบ
          </button>
        </div>
      ) : null}
    </header>
  );
}
