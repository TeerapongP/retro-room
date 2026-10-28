"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingNotice } from "@/components/LoadingNotice";
import { LoginScene } from "@/components/LoginScene";
import { SESSION_ENDED_MESSAGE, consumePostLoginPath, useAuth } from "@/lib/firebase/auth";
import { describeFirebaseError } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const { firebaseAuthState, sessionEnded, dismissSessionEnded, signInWithGoogle } = useAuth();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (firebaseAuthState.status === "signedIn") {
      router.replace(consumePostLoginPath());
    }
  }, [firebaseAuthState.status, router]);

  async function handleSignIn() {
    setSignInError(null);
    dismissSessionEnded();
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setSignInError(describeFirebaseError(error));
    } finally {
      setIsSigningIn(false);
    }
  }

  if (firebaseAuthState.status !== "signedOut") {
    return <LoadingNotice scene />;
  }

  return (
    <LoginScene
      onSignIn={handleSignIn}
      isSigningIn={isSigningIn}
      errorMessage={signInError ?? (sessionEnded ? SESSION_ENDED_MESSAGE : null)}
    />
  );
}
