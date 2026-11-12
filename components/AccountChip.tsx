"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconLogout } from "@/components/DashboardIcons";
import { useAuth, usePlayerName } from "@/lib/firebase/auth";

/** The signed-in user's Google photo, or the first letter of the player name when there is none or it fails to load (D124). */
function Avatar({ photoUrl, name }: { photoUrl: string | null; name: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (photoUrl && photoUrl !== failedUrl) {
    return (
      // A Google profile photo is an external URL; next/image would need a remote-host config for no gain at 30 px.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        width={30}
        height={30}
        referrerPolicy="no-referrer"
        className="board-account-avatar"
        onError={() => setFailedUrl(photoUrl)}
      />
    );
  }
  return (
    <span aria-hidden="true" className="board-account-avatar board-account-initial">
      {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Player name, Google photo and logout in a small chip at the top right of the Board screen (F23, D120, D124). */
export function AccountChip() {
  const router = useRouter();
  const { firebaseAuthState, signOutUser } = useAuth();
  const playerName = usePlayerName();
  const photoUrl = firebaseAuthState.status === "signedIn" ? firebaseAuthState.user.photoURL : null;

  async function handleSignOut() {
    await signOutUser();
    router.replace("/login");
  }

  return (
    <div className="board-account">
      <div className="board-account-chip">
        <Avatar photoUrl={photoUrl} name={playerName} />
        {playerName ? <span className="board-account-name">{playerName}</span> : null}
        <button type="button" className="board-account-logout" onClick={handleSignOut}>
          <IconLogout />
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}
