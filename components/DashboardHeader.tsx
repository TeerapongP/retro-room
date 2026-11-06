"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardSprout } from "@/components/DashboardSprout";
import { IconCalendar, IconHome, IconLogout } from "@/components/DashboardIcons";
import { useAuth, usePlayerName } from "@/lib/firebase/auth";

export function DashboardHeader() {
  const router = useRouter();
  const { signOutUser } = useAuth();
  const playerName = usePlayerName();

  async function handleSignOut() {
    await signOutUser();
    router.replace("/login");
  }

  return (
    <header className="dashboard-header">
      <Link href="/boards" className="dashboard-brand">
        <DashboardSprout />
        <span className="font-pixel">RETRO ROOM</span>
      </Link>
      <nav aria-label="Dashboard navigation" className="dashboard-nav">
        {/* Home and Retro both open the launcher, which returns to the user's current board (F20, D98). */}
        <Link href="/boards" className="dashboard-nav-active">
          <IconHome />
          Home
        </Link>
        <Link href="/boards">
          <IconCalendar />
          Retro
        </Link>
      </nav>
      <div className="dashboard-account">
        <span className="dashboard-player">{playerName}</span>
        <button className="btn dashboard-logout" type="button" onClick={handleSignOut}>
          <IconLogout />
          ออกจากระบบ
        </button>
      </div>
    </header>
  );
}
