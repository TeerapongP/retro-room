"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RetroSummaryReport } from "@/components/RetroSummaryReport";
import { AuthLoadingNotice, LoadingNotice } from "@/components/LoadingNotice";
import { useRequireSignedIn } from "@/lib/firebase/auth";
import { isAdminUser } from "@/lib/firebase/admin";
import { getOwnMembership, subscribeToBoard } from "@/lib/firebase/boards";
import type { Board } from "@/lib/firebase/types";

export default function SummaryPage() {
  return <Suspense fallback={<LoadingNotice scene />}><SummaryPageContent /></Suspense>;
}

function SummaryPageContent() {
  const { boardId } = useParams<{ boardId: string }>();
  const user = useRequireSignedIn();
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const stop = subscribeToBoard(boardId, setBoard, (reason) => setError(reason instanceof Error ? reason.message : "โหลดกระดานไม่สำเร็จ"));
    let active = true;
    getOwnMembership(boardId, user.uid).then((membership) => active && setIsMember(Boolean(membership))).catch((reason) => active && setError(reason instanceof Error ? reason.message : "ตรวจสอบสมาชิกไม่สำเร็จ"));
    return () => { active = false; stop(); };
  }, [boardId, user]);

  if (!user) return <AuthLoadingNotice />;
  if (error) return <main className="dashboard-scene summary-access"><p role="alert">{error}</p><Link href={`/boards/${boardId}`}>กลับไปที่กระดาน</Link></main>;
  if (board === undefined || isMember === null) return <LoadingNotice />;
  if (!board) return <main className="dashboard-scene summary-access"><p>ไม่พบกระดานนี้</p><Link href="/boards">กลับหน้าหลัก</Link></main>;
  if (!isMember && !isAdminUser(user)) return <main className="dashboard-scene summary-access"><p>คุณไม่มีสิทธิ์ดูรายงานของกระดานนี้</p><Link href={`/boards/${boardId}`}>กลับไปที่กระดาน</Link></main>;

  return <RetroSummaryReport boardId={boardId} title={board.title} uid={user.uid} isAdmin={isAdminUser(user)} />;
}
