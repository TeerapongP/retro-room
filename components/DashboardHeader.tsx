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
      <Link href="/dashboard" className="dashboard-brand">
        <DashboardSprout />
        <span className="font-pixel">RETRO ROOM</span>
      </Link>
      <nav aria-label="Dashboard navigation" className="dashboard-nav">
        <Link href="/dashboard" className="dashboard-nav-active" aria-current="page">
          <IconHome />
          Home
        </Link>
        <a href="#retro">
          <IconCalendar />
          Retro
        </a>
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
