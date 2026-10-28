"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingNotice } from "@/components/LoadingNotice";
import { useAuth } from "@/lib/firebase/auth";

export default function Home() {
  const router = useRouter();
  const { firebaseAuthState } = useAuth();

  useEffect(() => {
    if (firebaseAuthState.status === "signedIn") router.replace("/dashboard");
    if (firebaseAuthState.status === "signedOut") router.replace("/login");
  }, [firebaseAuthState.status, router]);

  return <LoadingNotice scene />;
}
