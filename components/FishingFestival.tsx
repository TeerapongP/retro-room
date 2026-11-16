"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { User } from "firebase/auth";
import { HostWheel } from "@/components/HostWheel";
import { currentHostUid, excludedHostUids } from "@/lib/crowded-farm";
import {
  endFishing,
  handOverHost,
  lockPowerPoints,
  recordCatch,
  resolveAndTransitionToWheel,
  reSpinFishingHostWheel,
  setIgnoredUids,
  spinActivityWheel,
  spinFishingHostWheel,
  startFishingGame,
  submitPowerAction,
  subscribeToFishCatches,
  subscribeToFishingGame,
  subscribeToFishingPowerActions,
  subscribeToFishingPowerPoints,
} from "@/lib/firebase/farm";
import type {
  Board,
  BoardMember,
  FishCatch,
  FishingGame,
  PowerAction,
  PowerActionType,
  PowerPoints,
  WheelSegment,
} from "@/lib/firebase/types";
import { MAX_RESPINS, POWER_ACTION_COSTS } from "@/lib/firebase/types";
import {
  buildCandidates,
  calcScores,
  computeRightNeighbor,
  resolveBaitTrap,
  resolveActions,
  type ScoredParticipant,
} from "@/lib/fishing-festival";
import { pickWinnerUid, wheelAngle } from "@/lib/wheel";

type FishingFestivalProps = {
  board: Board;
  members: BoardMember[];
  user: User;
  isAdmin: boolean;
  onAdvancePhase?: () => void;
};

type Phase = FishingGame["status"] | "idle";
type DurationSec = FishingGame["fishingDurationSec"];
type Eligibility = "included" | "ignored" | "current-host" | "past-host";

const SEGMENTS: readonly { id: WheelSegment; emoji: string; label: string; color: string }[] = [
  { id: "small-fish", emoji: "🐟", label: "ปลาตัวเล็ก", color: "#f29a4a" },
  { id: "big-fish", emoji: "🐠", label: "ปลาตัวใหญ่", color: "#f7dc6f" },
  { id: "golden-fish", emoji: "⭐", label: "ปลาทอง", color: "#e0a21b" },
  { id: "lucky", emoji: "🍀", label: "ดวงดี", color: "#7cc36a" },
  { id: "double-points", emoji: "💰", label: "ดับเบิ้ลแต้ม", color: "#e2685d" },
  { id: "rare-fish", emoji: "💎", label: "ปลาหายาก", color: "#b48ad8" },
];
const DURATIONS: readonly DurationSec[] = [30, 45, 60];
const ELIGIBILITY_TEXT: Record<Eligibility, { mark: string; label: string }> = {
  included: { mark: "✅", label: "มีสิทธิ์" },
  ignored: { mark: "❌", label: "ไม่ร่วมสุ่ม" },
  "current-host": { mark: "🔒", label: "Host ปัจจุบัน" },
  "past-host": { mark: "🔒", label: "เคยเป็น Host" },
};
const AVATAR_COLORS = ["#e2685d", "#f29a4a", "#e0a21b", "#7cc36a", "#4aa3c7", "#b48ad8", "#d977a8", "#8a6a45"];
const MAX_SCENE_AVATARS = 8;
const ACTIVITY_SPIN_MS = 3000;
const FRESH_SPIN_MS = 10_000;
const BITE_MIN_DELAY_MS = 4000;
const BITE_DELAY_SPREAD_MS = 4000;
const BITE_WINDOW_MS = 2500;
const TICK_MS = 200;

const POWER_ACTION_ORDER: readonly PowerActionType[] = [
  "lucky-respin",
  "right-neighbor",
  "safe-catch",
  "fishy-shuffle",
  "golden-hook",
  "bait-trap",
];

const ACTION_ICON: Record<PowerActionType, string> = {
  "lucky-respin": "🎲",
  "right-neighbor": "➡️",
  "safe-catch": "🛡️",
  "fishy-shuffle": "🔀",
  "golden-hook": "⭐",
  "bait-trap": "🪤",
};

const ACTION_LABEL_SHORT: Record<PowerActionType, string> = {
  "lucky-respin": "Lucky Re-spin",
  "right-neighbor": "Right Neighbor",
  "safe-catch": "Safe Catch",
  "fishy-shuffle": "Fishy Shuffle",
  "golden-hook": "Golden Hook",
  "bait-trap": "Bait Trap",
};

const ACTION_DESC: Record<PowerActionType, string> = {
  "lucky-respin": "หมุนวงล้อ Next Host ใหม่ได้อีก 1 ครั้ง",
  "right-neighbor": "เลือกคนถัดไปทางขวาเป็น Next Host",
  "safe-catch": "ป้องกันตัวเองไม่ให้ติดวงล้อ Next Host",
  "fishy-shuffle": "สลับลำดับรายชื่อในวงล้อ Next Host",
  "golden-hook": "เลือกผู้เล่นเป็น Next Host โดยตรง ★",
  "bait-trap": "ถ้าเป้าหมายชนะ จะถูกเบี่ยงไปคนถัดไป ★",
};

const SHOP_TARGETED: ReadonlySet<PowerActionType> = new Set<PowerActionType>(["golden-hook", "bait-trap"]);

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function avatarColor(uid: string): string {
  let sum = 0;
  for (let index = 0; index < uid.length; index += 1) sum += uid.charCodeAt(index);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function useNow(intervalMs: number, isActive: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const timerId = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timerId);
  }, [intervalMs, isActive]);
  return nowMs;
}

export function FishingFestival({ board, members, user, isAdmin, onAdvancePhase }: FishingFestivalProps) {
  const gameId = board.farmActiveGameId;
  return <FestivalRound key={gameId ?? "none"} gameId={gameId} board={board} members={members} user={user} isAdmin={isAdmin} onAdvancePhase={onAdvancePhase} />;
}

function FestivalRound({ gameId, board, members, user, isAdmin, onAdvancePhase }: FishingFestivalProps & { gameId: string | null }) {
  const [game, setGame] = useState<FishingGame | null | undefined>(gameId === null ? null : undefined);
  const [catches, setCatches] = useState<FishCatch[]>([]);
  const [powerPoints, setPowerPoints] = useState<PowerPoints[]>([]);
  const [powerActions, setPowerActions] = useState<PowerAction[]>([]);
  const [durationSec, setDurationSec] = useState<DurationSec>(45);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBiteOpen, setIsBiteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<PowerActionType | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(null);

  useEffect(() => {
    if (gameId === null) return;
    return subscribeToFishingGame(board.id, gameId, setGame, () => setLoadError("โหลดข้อมูลรอบเกมไม่สำเร็จ"));
  }, [board.id, gameId]);

  useEffect(() => {
    if (gameId === null) return;
    return subscribeToFishCatches(board.id, gameId, setCatches, () => setLoadError("โหลดคะแนนการตกปลาไม่สำเร็จ"));
  }, [board.id, gameId]);

  useEffect(() => {
    if (gameId === null) return;
    return subscribeToFishingPowerPoints(board.id, gameId, setPowerPoints, () => setLoadError("โหลดคะแนน Power Shop ไม่สำเร็จ"));
  }, [board.id, gameId]);

  useEffect(() => {
    if (gameId === null) return;
    return subscribeToFishingPowerActions(board.id, gameId, setPowerActions, () => setLoadError("โหลดการกระทำ Power Shop ไม่สำเร็จ"));
  }, [board.id, gameId]);

  const phase: Phase = game?.status ?? "idle";
  const nowMs = useNow(TICK_MS, phase === "fishing");
  const fishingEndsAt = game?.fishingEndsAt ?? null;
  const timeLeft =
    game && phase === "fishing" && fishingEndsAt
      ? Math.min(game.fishingDurationSec * 1000, Math.max(0, fishingEndsAt.getTime() - nowMs))
      : null;
  const isFishingLive = timeLeft !== null && timeLeft > 0;
  const elapsedMs = (isFishingLive && game && timeLeft !== null)
    ? game.fishingDurationSec * 1000 - timeLeft
    : null;
  const isCasting = elapsedMs !== null && elapsedMs < 1800;

  useEffect(() => {
    if (!isFishingLive || isBiteOpen) return;
    const timerId = setTimeout(() => setIsBiteOpen(true), BITE_MIN_DELAY_MS + Math.random() * BITE_DELAY_SPREAD_MS);
    return () => clearTimeout(timerId);
  }, [isFishingLive, isBiteOpen]);

  useEffect(() => {
    if (!isBiteOpen) return;
    const timerId = setTimeout(() => setIsBiteOpen(false), BITE_WINDOW_MS);
    return () => clearTimeout(timerId);
  }, [isBiteOpen]);

  const prevBiteRef = useRef(false);
  const [justMissed, setJustMissed] = useState(false);
  useEffect(() => {
    const wasOpen = prevBiteRef.current;
    prevBiteRef.current = isBiteOpen;
    if (wasOpen && !isBiteOpen && isFishingLive) {
      setJustMissed(true);
    }
  }, [isBiteOpen, isFishingLive]);
  useEffect(() => {
    if (!justMissed) return;
    const t = setTimeout(() => setJustMissed(false), 1200);
    return () => clearTimeout(t);
  }, [justMissed]);

  if (loadError !== null || game === undefined) {
    return (
      <section className="ff-root" aria-label="Fishing Festival">
        <FestivalStyles />
        <p className={loadError === null ? "farm-hint" : "farm-warning"} role={loadError === null ? undefined : "alert"}>
          {loadError ?? "กำลังโหลดรอบเกม…"}
        </p>
      </section>
    );
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setIsBusy(true);
    try {
      await action();
    } catch {
      setError("ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsBusy(false);
    }
  }

  const canCatch = isBiteOpen && isFishingLive;
  const ignoredUids = game?.ignoredUids ?? [];
  const winnerUid = game?.winnerUid ?? null;
  const hasHandedOver = phase === "finished" && winnerUid !== null && board.hostUid === winnerUid;
  const hostOfRound = hasHandedOver ? board.pastHostUids[board.pastHostUids.length - 1] : currentHostUid(board);
  const excludedUids = hasHandedOver ? [...new Set(board.pastHostUids)].sort() : excludedHostUids(board);
  const eligibilityOf = (uid: string): Eligibility => {
    if (uid === hostOfRound) return "current-host";
    if (excludedUids.includes(uid)) return "past-host";
    return ignoredUids.includes(uid) ? "ignored" : "included";
  };
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? "ไม่ทราบชื่อ";
  const photoOf = (uid: string) => (uid === user.uid ? user.photoURL : null);

  const scored = calcScores(
    members.map((member) => {
      const fishCatch = catches.find((c) => c.uid === member.uid);
      return { uid: member.uid, catchCount: fishCatch?.catchCount ?? 0, lastCatchAt: fishCatch?.lastCatchAt ?? null };
    }),
    game?.wheelSegment ?? null,
  );

  const candidates = buildCandidates(
    members.map((m) => m.uid),
    ignoredUids,
    excludedUids,
  ).map((uid) => ({ uid, name: nameOf(uid) }));

  const canEditIgnored = isAdmin && game !== null && (phase === "selecting-wheel" || phase === "fishing");

  const myPowerPoints = powerPoints.find((pp) => pp.uid === user.uid);
  const myAction = powerActions.find((a) => a.uid === user.uid);
  const eligibleTargets = members.filter((m) => eligibilityOf(m.uid) === "included" && m.uid !== user.uid);

  const resolvedState = game?.resolvedState ?? null;
  const wheelCandidates = resolvedState
    ? resolvedState.finalCandidateUids.map((uid) => ({ uid, name: nameOf(uid) }))
    : candidates;

  const reSpinGrantCount = resolvedState?.reSpinGrantCount ?? 0;
  const reSpinCount = game?.reSpinCount ?? 0;
  const reSpinsRemaining = Math.max(0, Math.min(reSpinGrantCount, MAX_RESPINS) - reSpinCount);

  function handleStart() {
    void run(() => startFishingGame(board.id, durationSec));
  }

  function handleSpinActivity() {
    if (!game) return;
    const segment = SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)].id;
    void run(() => spinActivityWheel(board.id, game.id, segment));
  }

  function handleCatch() {
    if (!canCatch || !game) return;
    setIsBiteOpen(false);
    void run(() => recordCatch(board.id, game.id, user.uid));
  }

  async function handleEndFishingAndLockScores() {
    if (!game) return;
    await endFishing(board.id, game.id);
    const pts = scored.map((p) => ({ uid: p.uid, balance: p.score, earned: p.score }));
    await lockPowerPoints(board.id, game.id, pts);
  }

  async function handleLockScoresRetry() {
    if (!game) return;
    const pts = scored.map((p) => ({ uid: p.uid, balance: p.score, earned: p.score }));
    await lockPowerPoints(board.id, game.id, pts);
  }

  async function handleSubmitPowerAction() {
    if (!game || !selectedAction) return;
    const needsTarget = SHOP_TARGETED.has(selectedAction);
    if (needsTarget && !selectedTargetUid) return;
    await submitPowerAction(board.id, game.id, user.uid, selectedAction, needsTarget ? selectedTargetUid : null);
    setSelectedAction(null);
    setSelectedTargetUid(null);
  }

  async function handleResolveAndOpenWheel() {
    if (!game) return;
    const hostUid = currentHostUid(board) ?? "";
    const result = resolveActions({
      actions: powerActions,
      allMemberUids: members.map((m) => m.uid),
      currentHostUid: hostUid,
      ignoredUids: game.ignoredUids,
      hostExcludedUids: excludedHostUids(board),
    });
    await resolveAndTransitionToWheel(board.id, game.id, result);
  }

  async function handleReSpin() {
    if (!game) return;
    await reSpinFishingHostWheel(board.id, game.id);
  }

  function handleSpinHost() {
    if (!game || !resolvedState) return;

    if (resolvedState.goldenHookWinner !== null) {
      void run(() => spinFishingHostWheel(board.id, game.id, resolvedState.goldenHookWinner!, "golden-hook"));
      return;
    }

    const eligibleSet = new Set(resolvedState.finalCandidateUids);
    const hasRightNeighbor = powerActions.some((a) => a.type === "right-neighbor");
    if (hasRightNeighbor) {
      const hostUid = currentHostUid(board) ?? "";
      const neighbor = computeRightNeighbor(members.map((m) => m.uid), hostUid, eligibleSet);
      if (neighbor !== null) {
        const finalWinner = resolveBaitTrap(neighbor, resolvedState.baitTrapMap, eligibleSet);
        void run(() => spinFishingHostWheel(board.id, game.id, finalWinner, "wheel"));
        return;
      }
    }

    const rawWinner = pickWinnerUid(wheelCandidates);
    if (!rawWinner) return;
    const finalWinner = resolveBaitTrap(rawWinner, resolvedState.baitTrapMap, eligibleSet);
    void run(() => spinFishingHostWheel(board.id, game.id, finalWinner, "wheel"));
  }

  function handleToggleIgnored(uid: string) {
    if (!game) return;
    const next = ignoredUids.includes(uid) ? ignoredUids.filter((u) => u !== uid) : [...ignoredUids, uid].sort();
    void run(() => setIgnoredUids(board.id, game.id, next));
  }

  const canStart = isAdmin && (phase === "idle" || phase === "finished" || phase === "cancelled");
  const canHandOver = isAdmin && phase === "finished" && winnerUid !== null && !hasHandedOver;
  const sceneMembers = members.slice(0, MAX_SCENE_AVATARS);
  const hiddenMemberCount = members.length - sceneMembers.length;

  const shopIsOpen = phase === "scoring";
  const shopIsLocked = !!myAction;

  const getAnglerState = (uid: string): 'idle' | 'casting' | 'waiting' | 'bite' | 'catch' | 'miss' => {
    if (phase !== 'fishing' || !isFishingLive) return 'idle';
    const memberCatch = catches.find(c => c.uid === uid);
    if (memberCatch?.lastCatchAt && nowMs - memberCatch.lastCatchAt.getTime() < 1500) return 'catch';
    if (uid === user.uid && justMissed) return 'miss';
    if (uid === user.uid && isBiteOpen) return 'bite';
    if (isCasting) return 'casting';
    return 'waiting';
  };
  const myBalance = myPowerPoints?.balance ?? 0;

  return (
    <section className="ff-root" aria-label="Fishing Festival">
      <FestivalStyles />

      {/* ── Header ── */}
      <div className="ff-header">
        <div className="ff-header-brand">
          <h2 className="ff-title">
            <span aria-hidden="true">🐟</span> Fishing Festival
          </h2>
          <p className="ff-subtitle">Catch, Earn &amp; Control!</p>
        </div>

        <div className={`ff-pp-badge${game ? "" : " ff-pp-badge-idle"}`} aria-label={`Power Points: ${myPowerPoints?.balance ?? 0}`}>
          <span className="ff-pp-label"><span aria-hidden="true">⭐</span> Power Points</span>
          <div className="ff-pp-value">
            <strong>{myPowerPoints?.balance ?? 0}</strong>
            <span className="ff-pp-coin" aria-hidden="true">🪙</span>
          </div>
        </div>

        <div className="ff-header-status">
          <div className="ff-round-badge">
            <span aria-hidden="true">🔁</span> Round {board.pastHostUids.length + 1}
          </div>
          <div
            className={`ff-timer${phase === "fishing" && timeLeft !== null && timeLeft > 0 ? " ff-timer-active" : " ff-timer-idle"}`}
            role="timer"
            aria-live="off"
          >
            <span aria-hidden="true">⏱</span>
            <strong>{phase === "fishing" && timeLeft !== null ? formatClock(timeLeft) : "--:--"}</strong>
          </div>
          {phase !== "idle" ? (
            <span className={`ff-phase-badge ${
              phase === "cancelled" ? "ff-phase-cancelled"
              : phase === "scoring" ? "ff-phase-shop"
              : phase === "wheel" ? "ff-phase-wheel"
              : phase === "finished" ? "ff-phase-done"
              : ""
            }`}>
              {phase === "cancelled" ? "ยกเลิก"
               : phase === "selecting-wheel" ? "🎯 เลือกกิจกรรม"
               : phase === "fishing" ? "🎣 กำลังตกปลา"
               : phase === "scoring" ? "🛒 Power Shop"
               : phase === "wheel" ? "🎡 หมุนวงล้อ"
               : phase === "finished" ? "✅ จบแล้ว"
               : null}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Errors & admin controls ── */}
      {error ? (
        <p className="farm-warning ff-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ff-controls">
        {phase === "finished" && winnerUid !== null ? (
          <p className="ff-status" role="status">
            <span aria-hidden="true">♛</span> Next Host คือ {nameOf(winnerUid)}!{hasHandedOver ? " (มอบตำแหน่งแล้ว)" : ""}
          </p>
        ) : null}
        {phase === "finished" && game?.resolution === "none" ? (
          <p className="farm-warning" role="alert">ไม่มีผู้มีสิทธิ์เป็น Next Host ผู้ดำเนินรายการต้องตัดสินใจเอง</p>
        ) : null}
        {canHandOver ? (
          <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={() => void run(() => handOverHost(board.id))}>
            มอบตำแหน่ง
          </button>
        ) : null}
        {isAdmin && hasHandedOver && onAdvancePhase ? (
          <button type="button" className="pixel-button pixel-button-gold" onClick={onAdvancePhase}>
            ไปสรุป ›
          </button>
        ) : null}
        {isAdmin && game && phase === "fishing" && timeLeft === 0 ? (
          <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={() => void run(handleEndFishingAndLockScores)}>
            จบการตกปลา
          </button>
        ) : null}
        {isAdmin && phase === "scoring" && powerPoints.length === 0 ? (
          <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={() => void run(handleLockScoresRetry)}>
            ล็อกคะแนน ↺
          </button>
        ) : null}
        {isAdmin && phase === "wheel" && resolvedState ? (
          <>
            {resolvedState.goldenHookWinner !== null ? (
              <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={handleSpinHost}>
                ยืนยัน Golden Hook: {nameOf(resolvedState.goldenHookWinner)} 🎣
              </button>
            ) : null}
            {reSpinsRemaining > 0 ? (
              <button type="button" className="pixel-button" disabled={isBusy} onClick={() => void run(handleReSpin)}>
                หมุนใหม่! ({reSpinsRemaining} สิทธิ์)
              </button>
            ) : null}
          </>
        ) : null}
        {canStart ? (
          <>
            <div className="ff-durations" role="group" aria-label="เวลาตกปลา">
              {DURATIONS.map((seconds) => (
                <button key={seconds} type="button" className="board-button board-button-quiet ff-duration" aria-pressed={durationSec === seconds} onClick={() => setDurationSec(seconds)}>
                  {seconds} วิ
                </button>
              ))}
            </div>
            <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={handleStart}>
              {phase === "idle" ? "เริ่มเกม" : "เริ่มรอบใหม่"}
            </button>
          </>
        ) : null}
        {!isAdmin && phase === "idle" ? <p className="ff-status">รอผู้ดำเนินรายการเริ่มเกม</p> : null}
      </div>

      {/* ── Top row: Fishing scene + Activity wheel ── */}
      <div className="ff-row ff-row-top">
        <div className="ff-panel ff-scene-panel">
          <p className="ff-scene-label">
            <span aria-hidden="true">🐟</span> Fishing Challenge · กดตกปลาให้ทันจังหวะ!
          </p>
          <div className="ff-scene">
            <span className="ff-cloud" aria-hidden="true" />
            <span className="ff-cloud ff-cloud-2" aria-hidden="true" />
            <div className="ff-trees" aria-hidden="true" />
            <div className="ff-fence" aria-hidden="true" />
            <div className="ff-water" aria-hidden="true" />
            <div className="ff-pier" aria-hidden="true" />
            <ul className="ff-anglers">
              {sceneMembers.map((member) => {
                const anglerState = getAnglerState(member.uid);
                return (
                  <li key={member.uid} className={`ff-angler ff-angler-${anglerState}`} title={member.displayName}>
                    <Avatar photoUrl={photoOf(member.uid)} name={member.displayName} uid={member.uid} />
                    <span className="ff-rod" aria-hidden="true" />
                    <span className="ff-line" aria-hidden="true" />
                    <span className={`ff-bobber${anglerState === "bite" ? " ff-bobber-bite" : ""}`} aria-hidden="true" />
                    {anglerState === "bite" && <span className="ff-ripple" aria-hidden="true" />}
                    {anglerState === "catch" && <span className="ff-catch-fish" aria-hidden="true">🐟</span>}
                    {anglerState === "miss" && <span className="ff-miss-splash" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
            {hiddenMemberCount > 0 ? <span className="ff-more">+{hiddenMemberCount}</span> : null}
            <div className="ff-grass" aria-hidden="true" />
          </div>
          {phase === "fishing" ? (
            <button type="button" className={`pixel-button ff-catch${canCatch ? " ff-catch-open" : ""}`} disabled={!canCatch} onClick={handleCatch}>
              <span aria-hidden="true">🎣</span> {canCatch ? "ปลากินเบ็ด! ดึงเลย!" : isFishingLive ? "รอปลากินเบ็ด…" : "หมดเวลาแล้ว"}
            </button>
          ) : null}
        </div>

        <div className="ff-panel ff-wood">
          <h3 className="ff-heading">วงล้อกิจกรรม</h3>
          {game?.wheelSegment ? (
            <p className="ff-wheel-result-label">
              กิจกรรมรอบนี้ :{" "}
              <strong>{SEGMENTS.find((s) => s.id === game.wheelSegment)?.emoji}{" "}{SEGMENTS.find((s) => s.id === game.wheelSegment)?.label}</strong>
            </p>
          ) : null}
          <ActivityWheel key={game?.wheelSpunAt?.getTime() ?? "none"} segment={game?.wheelSegment ?? null} spunAt={game?.wheelSpunAt ?? null} />
          {phase === "selecting-wheel" ? (
            isAdmin ? (
              <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={handleSpinActivity}>
                หมุนวงล้อ
              </button>
            ) : (
              <p className="ff-note">รอผู้ดำเนินรายการหมุนวงล้อ</p>
            )
          ) : null}
        </div>
      </div>

      {/* ── Bottom row: Leaderboard | Power Shop | Next Host Wheel ── */}
      <div className="ff-row ff-row-bottom">

        {/* Leaderboard */}
        <div className="ff-panel ff-wood">
          <h3 className="ff-heading">🏆 ตารางคะแนน</h3>
          <Scoreboard scored={scored} ignoredUids={ignoredUids} nameOf={nameOf} photoOf={photoOf} powerPoints={powerPoints} />
          {candidates.length > 0 && (phase === "idle" || phase === "selecting-wheel" || phase === "fishing" || phase === "scoring") ? (
            <p className="ff-eligibility-note">ทุกคนยังมีสิทธิ์ลุ้นเป็น Next Host นะ!</p>
          ) : null}
        </div>

        {/* Power Shop */}
        <div className="ff-panel ff-wood ff-shop-panel">
          <h3 className="ff-heading">⭐ Power Shop · เลือกใช้สิทธิ์พิเศษ</h3>

          {shopIsOpen ? (
            <>
              <div className="ff-shop-balance">
                <span aria-hidden="true">🪙</span>
                <strong className="ff-shop-pts">{myBalance}</strong>
                <span>pts</span>
              </div>

              {shopIsLocked && myAction ? (
                <div className="ff-submitted-badge" role="status">
                  <span aria-hidden="true">{ACTION_ICON[myAction.type]}</span>{" "}
                  ส่งแล้ว: <strong>{ACTION_LABEL_SHORT[myAction.type]}</strong>
                  {myAction.targetUid ? ` → ${nameOf(myAction.targetUid)}` : ""}
                </div>
              ) : (
                <ul className="ff-shop-list">
                  {POWER_ACTION_ORDER.map((type) => {
                    const cost = POWER_ACTION_COSTS[type];
                    const canAfford = myBalance >= cost;
                    const isSelected = selectedAction === type;
                    return (
                      <li key={type} className={`ff-shop-row${isSelected ? " ff-shop-row-on" : ""}${!canAfford ? " ff-shop-row-poor" : ""}`}>
                        <span className="ff-shop-icon" aria-hidden="true">{ACTION_ICON[type]}</span>
                        <div className="ff-shop-info">
                          <strong className="ff-shop-name">{ACTION_LABEL_SHORT[type]}</strong>
                          <span className="ff-shop-desc">{ACTION_DESC[type]}</span>
                        </div>
                        <span className="ff-shop-cost" aria-label={`${cost} pts`}>
                          <span aria-hidden="true">🪙</span> {cost}
                        </span>
                        <button
                          type="button"
                          className={`ff-shop-btn${isSelected ? " ff-shop-btn-cancel" : ""}`}
                          disabled={!canAfford || isBusy}
                          onClick={() => { setSelectedAction(isSelected ? null : type); setSelectedTargetUid(null); }}
                        >
                          {isSelected ? "ยกเลิก" : "ใช้เลย"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {selectedAction && !shopIsLocked ? (
                <div className="ff-shop-confirm">
                  {SHOP_TARGETED.has(selectedAction) ? (
                    <select className="ff-target-select" value={selectedTargetUid ?? ""} onChange={(e) => setSelectedTargetUid(e.target.value || null)}>
                      <option value="">เลือกเป้าหมาย…</option>
                      {eligibleTargets.map((m) => (
                        <option key={m.uid} value={m.uid}>{m.displayName}</option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="pixel-button pixel-button-gold"
                    disabled={isBusy || (SHOP_TARGETED.has(selectedAction) && !selectedTargetUid)}
                    onClick={() => void run(handleSubmitPowerAction)}
                  >
                    ✅ ยืนยัน {ACTION_LABEL_SHORT[selectedAction]}
                  </button>
                </div>
              ) : null}

              {isAdmin ? (
                <div className="ff-shop-admin-bar">
                  <span className="ff-shop-count">{powerActions.length} / {members.length} ส่งแล้ว</span>
                  <button type="button" className="pixel-button pixel-button-gold ff-shop-close-btn" disabled={isBusy} onClick={() => void run(handleResolveAndOpenWheel)}>
                    ปิดร้านและตัดสิน
                  </button>
                </div>
              ) : null}

              <p className="ff-shop-limit">ใช้ได้คนละ 1 ครั้งต่อรอบเท่านั้น</p>
            </>
          ) : phase === "wheel" || phase === "finished" ? (
            <div className="ff-shop-preview">
              {powerActions.length > 0 ? (
                <>
                  <p className="ff-shop-hint" style={{paddingTop:"0.4rem"}}>สรุปผลการใช้ Power Action</p>
                  <ul className="ff-action-log">
                    {powerActions.map((a) => (
                      <li key={a.uid} className="ff-action-log-row">
                        <span aria-hidden="true">{ACTION_ICON[a.type]}</span>
                        <span className="ff-action-log-name">{nameOf(a.uid)}</span>
                        <span className="ff-action-log-action">{ACTION_LABEL_SHORT[a.type]}{a.targetUid ? ` → ${nameOf(a.targetUid)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="ff-shop-hint" style={{paddingTop:"0.4rem"}}>ไม่มีผู้ใช้ Power Action รอบนี้</p>
                  <ul className="ff-shop-preview-list">
                    {POWER_ACTION_ORDER.map((type) => (
                      <li key={type} className="ff-shop-preview-row">
                        <span aria-hidden="true">{ACTION_ICON[type]}</span>
                        <span>{ACTION_LABEL_SHORT[type]}</span>
                        <span className="ff-shop-preview-cost">🪙 {POWER_ACTION_COSTS[type]}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <div className="ff-shop-preview">
              <p className="ff-shop-hint">แต้มจะถูกล็อคหลังจบการตกปลา</p>
              <ul className="ff-shop-preview-list">
                {POWER_ACTION_ORDER.map((type) => (
                  <li key={type} className="ff-shop-preview-row">
                    <span aria-hidden="true">{ACTION_ICON[type]}</span>
                    <span>{ACTION_LABEL_SHORT[type]}</span>
                    <span className="ff-shop-preview-cost">🪙 {POWER_ACTION_COSTS[type]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Next Host Wheel */}
        <div className="ff-panel ff-wood">
          <h3 className="ff-heading">👑 Next Host · วงล้อผู้โชคดี</h3>

          {game && (phase === "wheel" || phase === "finished") ? (
            <>
              {phase === "wheel" && resolvedState?.goldenHookWinner ? (
                <p className="ff-status" role="status">
                  <span aria-hidden="true">🎣</span> Golden Hook — {nameOf(resolvedState.goldenHookWinner)} ชนะโดยตรง!
                </p>
              ) : null}
              <HostWheel
                key={`${game.id}:${phase === "wheel" ? reSpinCount : (game.resolvedAt?.getTime() ?? "none")}`}
                candidates={phase === "wheel" ? wheelCandidates : candidates}
                winnerUid={phase === "finished" ? winnerUid : null}
                spunAt={phase === "finished" ? game.resolvedAt : null}
                canSpin={isAdmin && phase === "wheel" && !isBusy && resolvedState?.goldenHookWinner === null}
                hint={phase === "wheel" && !isAdmin ? "รอผู้ดำเนินรายการหมุนวงล้อ" : null}
                onSpin={handleSpinHost}
              />
            </>
          ) : (
            <p className="ff-note">
              {phase === "scoring" ? "วงล้อจะเปิดหลังปิดร้าน" : "หมุนเพื่อเลือก Next Host จากผู้มีสิทธิ์เท่านั้น!"}
            </p>
          )}

          {phase === "wheel" && resolvedState && resolvedState.finalCandidateUids.length === 0 && resolvedState.goldenHookWinner === null ? (
            <p className="farm-warning" role="alert">ไม่มีผู้มีสิทธิ์เป็น Next Host เหลือแล้ว</p>
          ) : null}

          <ul className="ff-eligibility" aria-label="รายชื่อผู้มีสิทธิ์เป็น Next Host">
            {members.map((member) => {
              const eligibility = eligibilityOf(member.uid);
              const isToggleable = canEditIgnored && (eligibility === "included" || eligibility === "ignored");
              return (
                <li key={member.uid} className={`ff-eligible ff-eligible-${eligibility}`}>
                  <span aria-hidden="true">{ELIGIBILITY_TEXT[eligibility].mark}</span>
                  <span className="ff-eligible-name">{member.displayName}</span>
                  <span className="ff-eligible-tag">{ELIGIBILITY_TEXT[eligibility].label}</span>
                  {isToggleable ? (
                    <button type="button" className="ff-toggle" disabled={isBusy} onClick={() => handleToggleIgnored(member.uid)}>
                      {eligibility === "ignored" ? "นำกลับ" : "ไม่ร่วมสุ่ม"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <PixelChicken />
          <p className="ff-chicken-note">ตกปลาให้สนุก แล้วมาลุ้นกันต่อ!</p>
        </div>
      </div>
    </section>
  );
}

type AvatarProps = { photoUrl: string | null; name: string; uid: string };

function Avatar({ photoUrl, name, uid }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (photoUrl && photoUrl !== failedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" referrerPolicy="no-referrer" className="ff-avatar" onError={() => setFailedUrl(photoUrl)} />
    );
  }
  return (
    <span className="ff-avatar" style={{ background: avatarColor(uid) }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

const WHEEL_CENTER = 100;
const WHEEL_RADIUS = 96;
const SECTOR_DEG = 360 / SEGMENTS.length;

function wheelPoint(deg: number, radius: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(WHEEL_CENTER + radius * Math.sin(rad)).toFixed(2)} ${(WHEEL_CENTER - radius * Math.cos(rad)).toFixed(2)}`;
}

type ActivityWheelProps = { segment: WheelSegment | null; spunAt: Date | null };

function ActivityWheel({ segment, spunAt }: ActivityWheelProps) {
  const index = SEGMENTS.findIndex((entry) => entry.id === segment);
  const target = index < 0 ? 0 : wheelAngle(index, SEGMENTS.length);
  const [isFresh] = useState(() => spunAt !== null && index >= 0 && Date.now() - spunAt.getTime() < FRESH_SPIN_MS);
  const [angle, setAngle] = useState(isFresh ? 0 : target);
  const [isDone, setIsDone] = useState(!isFresh);

  useEffect(() => {
    if (!isFresh) return;
    const startTimer = setTimeout(() => setAngle(target), 60);
    const doneTimer = setTimeout(() => setIsDone(true), ACTIVITY_SPIN_MS + 200);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(doneTimer);
    };
  }, [isFresh, target]);

  const result = index < 0 ? null : SEGMENTS[index];
  const wheelStyle: CSSProperties = {
    transform: `rotate(${angle}deg)`,
    transition: isFresh ? `transform ${ACTIVITY_SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.1, 1)` : "none",
  };

  return (
    <div className="ff-activity">
      <div className="ff-wheel-stage">
        <span className="host-wheel-pointer" aria-hidden="true" />
        <svg className="ff-wheel" viewBox="0 0 200 200" style={wheelStyle} role="img" aria-label="วงล้อกิจกรรม 6 ช่อง">
          {SEGMENTS.map((entry, sectorIndex) => {
            const start = sectorIndex * SECTOR_DEG;
            return (
              <g key={entry.id}>
                <path
                  d={`M ${WHEEL_CENTER} ${WHEEL_CENTER} L ${wheelPoint(start, WHEEL_RADIUS)} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 0 1 ${wheelPoint(start + SECTOR_DEG, WHEEL_RADIUS)} Z`}
                  fill={entry.color}
                  stroke="#493521"
                  strokeWidth="2"
                />
                <g transform={`rotate(${start + SECTOR_DEG / 2} ${WHEEL_CENTER} ${WHEEL_CENTER})`} textAnchor="middle" fill="#3d2a14">
                  <text x={WHEEL_CENTER} y="34" fontSize="18">{entry.emoji}</text>
                  <text x={WHEEL_CENTER} y="52" fontSize="9" fontWeight="800">{entry.label}</text>
                </g>
              </g>
            );
          })}
          <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r="9" fill="#e6bf82" stroke="#493521" strokeWidth="3" />
        </svg>
      </div>
      <p className="ff-result farm-sign" role="status">
        {result === null ? "ยังไม่ได้หมุน" : isDone ? `${result.emoji} ${result.label}` : "กำลังหมุน…"}
      </p>
    </div>
  );
}

type ScoreboardProps = {
  scored: ScoredParticipant[];
  ignoredUids: string[];
  nameOf: (uid: string) => string;
  photoOf: (uid: string) => string | null;
  powerPoints: PowerPoints[];
};

function Scoreboard({ scored, ignoredUids, nameOf, photoOf, powerPoints }: ScoreboardProps) {
  const ppOf = (uid: string) => powerPoints.find((pp) => pp.uid === uid)?.balance ?? 0;
  return (
    <div className="ff-table-wrap">
      <table className="ff-table">
        <thead>
          <tr>
            <th scope="col">อันดับ</th>
            <th scope="col" colSpan={2}>ผู้เล่น</th>
            <th scope="col"><span aria-hidden="true">🐟</span></th>
            <th scope="col">แต้ม</th>
            <th scope="col"><span aria-hidden="true">🪙</span></th>
          </tr>
        </thead>
        <tbody>
          {scored.map((participant) => (
            <tr key={participant.uid} className={ignoredUids.includes(participant.uid) ? "ff-row-ignored" : undefined}>
              <td className="ff-cell-rank">
                <span aria-hidden="true">
                  {participant.rank === 1 ? "👑" : participant.rank === 2 ? "🥈" : participant.rank === 3 ? "🥉" : participant.rank}
                </span>
              </td>
              <td className="ff-cell-avatar">
                <Avatar photoUrl={photoOf(participant.uid)} name={nameOf(participant.uid)} uid={participant.uid} />
              </td>
              <td className="ff-cell-name">{nameOf(participant.uid)}</td>
              <td className="ff-cell-catch"><span aria-hidden="true">🐟</span> {participant.catchCount}</td>
              <td className="ff-cell-score">{participant.score}</td>
              <td className="ff-cell-pp">{ppOf(participant.uid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHICKEN_PIXELS: readonly (readonly [number, number, number, string])[] = [
  [5, 0, 2, "#d9433b"], [4, 1, 4, "#d9433b"], [4, 2, 4, "#fffaf0"],
  [3, 3, 6, "#fffaf0"], [6, 3, 1, "#2f2218"], [9, 4, 2, "#f29a4a"],
  [3, 4, 6, "#fffaf0"], [8, 5, 1, "#d9433b"], [2, 5, 6, "#fffaf0"],
  [1, 6, 8, "#fffaf0"], [0, 7, 9, "#fffaf0"], [2, 7, 3, "#e6dccb"],
  [0, 8, 9, "#fffaf0"], [1, 9, 7, "#fffaf0"], [3, 10, 1, "#f29a4a"],
  [6, 10, 1, "#f29a4a"], [2, 11, 2, "#f29a4a"], [5, 11, 2, "#f29a4a"],
];

function PixelChicken() {
  return (
    <svg className="ff-chicken" viewBox="0 0 12 12" width="48" height="48" shapeRendering="crispEdges" aria-hidden="true">
      {CHICKEN_PIXELS.map(([x, y, width, fill]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width={width} height="1" fill={fill} />
      ))}
    </svg>
  );
}

function FestivalStyles() {
  return (
    <style href="fishing-festival" precedence="medium">
      {STYLES}
    </style>
  );
}

const STYLES = `
/* ── Root & background ── */
.ff-root {
  position: fixed; inset: 0; z-index: 100;
  overflow-y: auto; overflow-x: hidden;
  display: grid; align-content: start; gap: 0.5rem;
  width: 100%; min-width: 0; box-sizing: border-box;
  padding: 0.5rem 0.6rem 2rem;
  color: #3d2208;
  background: linear-gradient(180deg, #6bbf4a 0%, #55a83b 100%) fixed;
}

/* ── Header: sky-brand | PP badge | round+timer ── */
.ff-header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: stretch;
  gap: 0;
  background: linear-gradient(180deg, #7a3d12 0%, #5a2d0c 100%);
  border: 5px solid #3d1e06;
  box-shadow: 0 5px 0 #3d1e06;
  min-height: 9rem;
  min-width: 0; overflow: hidden;
}
/* Left brand: sky-blue scene window */
.ff-header-brand {
  display: flex; flex-direction: column; justify-content: center; gap: 0.3rem;
  padding: 0.65rem 1.1rem;
  background: linear-gradient(170deg, #4fb3e8 0%, #87ceeb 55%, #9ed9f0 80%, #6bbf4a 100%);
  border-right: 5px solid #3d1e06;
  position: relative; overflow: hidden;
}
.ff-header-brand::before {
  content: "";
  position: absolute; top: 12%; right: 10%;
  width: 3.5rem; height: 0.9rem;
  background: #fff; border-radius: 50%;
  box-shadow: 1rem -0.5rem 0 0.15rem #fff, 2.1rem 0.25rem 0 #fff;
  opacity: 0.85;
}
.ff-title {
  margin: 0; font-weight: 800;
  font-size: clamp(1.5rem, 4vw, 2.6rem);
  line-height: 1.1;
  color: #ffd966;
  text-shadow: 3px 3px 0 #3d1e06, -2px -2px 0 #3d1e06, 2px -2px 0 #3d1e06, -2px 2px 0 #3d1e06;
  white-space: nowrap; letter-spacing: 0.03em;
  font-family: var(--font-pixel), monospace;
  position: relative; z-index: 1;
}
.ff-subtitle {
  margin: 0; display: inline-flex; align-self: flex-start;
  font-size: clamp(0.75rem, 1.5vw, 0.95rem); font-weight: 800;
  color: #ffd966; background: #5a2d0c;
  padding: 0.18rem 0.65rem;
  border: 3px solid #3d1e06;
  letter-spacing: 0.05em; white-space: nowrap;
  position: relative; z-index: 1;
}
/* PP badge — center column */
.ff-pp-badge {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.1rem;
  padding: 0.5rem 1.5rem;
  background: linear-gradient(180deg, #fff8e7 0%, #ffe8a0 100%);
  border-left: 5px solid #3d1e06;
  border-right: 5px solid #3d1e06;
  min-width: clamp(8rem, 16vw, 11rem);
}
.ff-pp-badge-idle { opacity: 0.45; }
.ff-pp-label { font-size: 0.72rem; font-weight: 800; color: #6b4423; letter-spacing: 0.08em; text-transform: uppercase; }
.ff-pp-value { display: flex; align-items: center; gap: 0.3rem; line-height: 1; }
.ff-pp-value strong { font-size: clamp(1.7rem, 3.8vw, 2.4rem); font-weight: 800; color: #3d2208; }
.ff-pp-coin { font-size: 1.4rem; }
/* Right column — round + timer stacked */
.ff-header-status {
  display: flex; flex-direction: column; align-items: stretch; justify-content: center;
  gap: 0.4rem; padding: 0.5rem 0.8rem;
}
.ff-round-badge {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.8rem; font-size: 0.88rem; font-weight: 800;
  color: #3d2208; background: linear-gradient(180deg, #fff8e7 0%, #f5e4b0 100%);
  border: 3px solid #3d1e06; box-shadow: 0 3px 0 #3d1e06;
  letter-spacing: 0.03em; white-space: nowrap;
}
.ff-timer {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.8rem; font-weight: 800;
  color: #3d2208; background: linear-gradient(180deg, #fff8e7 0%, #f5e4b0 100%);
  border: 3px solid #3d1e06; box-shadow: 0 3px 0 #3d1e06;
}
.ff-timer-active { background: linear-gradient(180deg, #fff3df 0%, #ffd080 100%); color: #c0392b; }
.ff-timer strong { font-family: var(--font-pixel), monospace; font-size: clamp(1.2rem, 2.8vw, 1.7rem); font-variant-numeric: tabular-nums; }
.ff-timer-idle strong { opacity: 0.5; }
.ff-phase-badge {
  padding: 0.25rem 0.75rem; font-size: 0.82rem; font-weight: 800;
  border: 3px solid #3d1e06; box-shadow: 0 3px 0 #3d1e06;
}
.ff-phase-shop { background: #f5bd4f; color: #3d2208; }
.ff-phase-wheel { background: #7cc36a; color: #1a3a10; }
.ff-phase-done { background: #4aa3c7; color: #fff; }
.ff-phase-cancelled { background: #e2685d; color: #fff; }

/* ── Controls bar ── */
.ff-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem; }
.ff-controls:empty { display: none; }
.ff-status {
  margin: 0; padding: 0.3rem 0.9rem; font-weight: 800;
  background: #fff3df; border: 3px solid #493521;
}
.ff-error { margin: 0; }
.ff-durations { display: flex; gap: 0.4rem; }
.ff-duration[aria-pressed="true"] { background: #f5bd4f; box-shadow: inset 0 0 0 2px #ffe08a, 0 3px 0 #493521; }

/* ── Grid rows ── */
.ff-row { display: grid; gap: 0.5rem; grid-template-columns: minmax(0, 1fr); align-items: stretch; }
@media (min-width: 48rem) {
  .ff-row-top { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  .ff-row-bottom { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr); }
}

/* ── Panels — wooden picture-frame with parchment inner ── */
.ff-panel {
  display: grid; align-content: start; justify-items: center; gap: 0;
  min-width: 0; max-width: 100%; padding: 0;
  border: 12px solid #4d2c12;
  outline: 3px solid #c8975e;
  box-shadow: 6px 9px 0 rgb(48 30 15 / 0.55);
  background: #fdf3d8;
  overflow: hidden;
  box-sizing: border-box;
}
.ff-wood {
  background: #fdf3d8;
  border: 12px solid #4d2c12;
  outline: 3px solid #c8975e;
  box-shadow: inset 0 0 0 3px #e8c07a, 6px 9px 0 rgb(48 30 15 / 0.55);
  min-width: 0; max-width: 100%; box-sizing: border-box;
}
/* Panel inner content padding (not for heading/scene) */
.ff-wood > *:not(.ff-heading),
.ff-panel > *:not(.ff-heading):not(.ff-scene-label):not(.ff-scene) {
  padding-left: 0.65rem; padding-right: 0.65rem;
}
.ff-panel > *:first-child:not(.ff-heading):not(.ff-scene-label),
.ff-wood > *:first-child:not(.ff-heading) { padding-top: 0.5rem; }
.ff-panel > *:last-child, .ff-wood > *:last-child { padding-bottom: 0.6rem; }
.ff-scene-panel { padding: 0; background: transparent; }
.ff-heading {
  margin: 0; padding: 0.4rem 0.9rem; width: 100%;
  font-size: 1rem; font-weight: 800; text-align: center;
  color: #fff3df;
  background: linear-gradient(180deg, #7a4a28 0%, #5a2d0c 100%);
  border-bottom: 4px solid #3d1e06;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.15);
  letter-spacing: 0.02em;
}
.ff-note { margin: 0; text-align: center; font-weight: 700; font-size: 0.9rem; }
.ff-wheel-result-label { margin: 0; font-size: 0.85rem; font-weight: 700; text-align: center; padding-top: 0.4rem; }

/* ── Fishing scene ── */
.ff-scene-label {
  margin: 0; padding: 0.3rem 0.6rem; width: 100%;
  font-size: 0.85rem; font-weight: 800; text-align: center;
  color: #fff3df; background: #3f8fc4; border-bottom: 3px solid #4d2c12;
}
.ff-scene {
  position: relative; width: 100%;
  min-height: clamp(15rem, 32vw, 22rem); overflow: hidden;
  background: linear-gradient(180deg, #87ceeb 0%, #b8e4f8 45%, #9ed4ef 100%);
}
.ff-cloud {
  position: absolute; top: 10%; left: 8%; width: 5rem; height: 1.2rem;
  background: #fff; border-radius: 50%;
  box-shadow: 1.2rem -0.7rem 0 0.2rem #fff, 2.5rem 0.3rem 0 #fff, 11rem 0.8rem 0 -0.1rem rgba(255,255,255,0.9);
  animation: ff-drift 14s steps(14, end) infinite alternate;
}
/* Treeline */
.ff-trees {
  position: absolute; z-index: 1; left: 0; right: 0; bottom: 46%; height: 6rem;
  background-image:
    radial-gradient(ellipse 1.4rem 2.8rem at 5% 100%, #2d6e1f 0%, #2d6e1f 65%, transparent 65%),
    radial-gradient(ellipse 1.1rem 2.2rem at 10% 85%, #3a8a28 0%, #3a8a28 65%, transparent 65%),
    radial-gradient(ellipse 1.6rem 3.2rem at 17% 100%, #256018 0%, #256018 65%, transparent 65%),
    radial-gradient(ellipse 1.2rem 2.4rem at 23% 90%, #3a8a28 0%, #3a8a28 65%, transparent 65%),
    radial-gradient(ellipse 1.5rem 3rem at 31% 100%, #2d6e1f 0%, #2d6e1f 65%, transparent 65%),
    radial-gradient(ellipse 1.1rem 2.2rem at 38% 88%, #3a8a28 0%, #3a8a28 65%, transparent 65%),
    radial-gradient(ellipse 1.7rem 3.4rem at 46% 100%, #256018 0%, #256018 65%, transparent 65%),
    radial-gradient(ellipse 1.2rem 2.4rem at 54% 90%, #3a8a28 0%, #3a8a28 65%, transparent 65%),
    radial-gradient(ellipse 1.5rem 3rem at 62% 100%, #2d6e1f 0%, #2d6e1f 65%, transparent 65%),
    radial-gradient(ellipse 1.1rem 2.2rem at 69% 86%, #3a8a28 0%, #3a8a28 65%, transparent 65%),
    radial-gradient(ellipse 1.6rem 3.2rem at 77% 100%, #256018 0%, #256018 65%, transparent 65%),
    radial-gradient(ellipse 1.2rem 2.4rem at 85% 90%, #3a8a28 0%, #3a8a28 65%, transparent 65%),
    radial-gradient(ellipse 1.4rem 2.8rem at 93% 100%, #2d6e1f 0%, #2d6e1f 65%, transparent 65%);
}
/* Wooden fence */
.ff-fence {
  position: absolute; z-index: 2; left: 0; right: 0; bottom: 44%; height: 1.6rem;
  background-image:
    repeating-linear-gradient(90deg, #8b5a2b 0 0.28rem, transparent 0.28rem 1.5rem),
    linear-gradient(180deg, #c8914e 0 35%, #8b5a2b 35% 100%);
  background-size: 1.5rem 100%, 100% 100%;
}
.ff-water {
  position: absolute; inset: 55% 0 0 0; background-color: #3f8fc4;
  background-image:
    linear-gradient(90deg, rgb(255 255 255 / 0.4) 0 40%, transparent 40% 100%),
    linear-gradient(90deg, transparent 0 55%, rgb(255 255 255 / 0.25) 55% 85%, transparent 85% 100%);
  background-size: 4rem 3px, 5rem 3px;
  background-repeat: repeat-x; background-position: 0 0, 0 0.75rem;
  animation: ff-ripple 2.4s steps(8, end) infinite;
}
.ff-grass {
  position: absolute; z-index: 2; inset: auto 0 0 0; height: 2.2rem;
  background: linear-gradient(180deg, #7dd65a 0%, #5aad3a 100%);
  border-top: 5px solid #3f8f3a;
}
.ff-grass::before {
  content: ""; position: absolute; top: -0.6rem; left: 0; right: 0; height: 0.7rem;
  background-image:
    radial-gradient(ellipse 0.4rem 0.5rem at 3% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.6rem at 8% 100%, #6bbf4a 0%, transparent 70%),
    radial-gradient(ellipse 0.5rem 0.5rem at 14% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.5rem at 20% 100%, #6bbf4a 0%, transparent 70%),
    radial-gradient(ellipse 0.5rem 0.6rem at 27% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.5rem at 35% 100%, #6bbf4a 0%, transparent 70%),
    radial-gradient(ellipse 0.5rem 0.5rem at 43% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.6rem at 51% 100%, #6bbf4a 0%, transparent 70%),
    radial-gradient(ellipse 0.5rem 0.5rem at 60% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.5rem at 68% 100%, #6bbf4a 0%, transparent 70%),
    radial-gradient(ellipse 0.5rem 0.6rem at 76% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.5rem at 84% 100%, #6bbf4a 0%, transparent 70%),
    radial-gradient(ellipse 0.5rem 0.5rem at 92% 100%, #8de04e 0%, transparent 70%),
    radial-gradient(ellipse 0.4rem 0.5rem at 97% 100%, #6bbf4a 0%, transparent 70%);
}
.ff-pier {
  position: absolute; z-index: 1; left: 4%; right: 4%; top: calc(55% - 0.5rem); height: 1rem;
  background: repeating-linear-gradient(90deg, #8b5a2b 0 1.4rem, #6b4423 1.4rem 1.55rem);
  border: 3px solid #4d2c12;
}
.ff-pier::before, .ff-pier::after { content: ""; position: absolute; top: 100%; width: 0.7rem; height: 4rem; background: #6b4423; border: 3px solid #4d2c12; border-top: 0; }
.ff-pier::before { left: 6%; }
.ff-pier::after { right: 6%; }
.ff-anglers { position: absolute; z-index: 2; left: 4%; right: 4%; bottom: calc(45% + 0.5rem); display: flex; justify-content: space-around; margin: 0; padding: 0 0.25rem; list-style: none; }
.ff-angler { position: relative; flex: 0 1 4.2em; min-width: 0; font-size: clamp(0.55rem, 2.1vw, 1rem); }
.ff-avatar { display: grid; place-items: center; width: 2.6em; height: 2.6em; border-radius: 50%; border: 3px solid #493521; object-fit: cover; font-weight: 800; line-height: 1; color: #fff; background: #8a6a45; }
.ff-rod { position: absolute; left: 2.3em; top: 1em; width: 1.9em; height: 3px; background: #5a3a1a; transform-origin: left center; transform: rotate(-35deg); }
.ff-line { position: absolute; left: 3.85em; top: -0.1em; width: 1px; height: calc(2.7em + 2.4rem); background: #fff; }
.ff-bobber { position: absolute; left: calc(3.85em - 0.35rem); top: calc(2.6em + 2.1rem); width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 2px solid #493521; background: linear-gradient(#e2473d 0 50%, #fff 50% 100%); }
.ff-bobber-bite { animation: ff-dip 0.5s steps(4, end) infinite; }
.ff-bobber-bite::after { content: ""; position: absolute; left: 50%; top: 50%; width: 0.7rem; height: 0.35rem; border: 2px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); animation: ff-ring 0.8s steps(6, end) infinite; }

/* ── Angler states ── */
.ff-angler-idle .ff-rod { transform: rotate(-72deg); }
.ff-angler-idle .ff-line { height: 0.5em; opacity: 0.3; }
.ff-angler-idle .ff-bobber { display: none; }

.ff-angler-casting .ff-rod { animation: ff-cast 1.8s steps(12, end) forwards; }
.ff-angler-casting .ff-line { height: 0.4em; opacity: 0.4; animation: ff-line-extend 1.8s steps(12, end) forwards; }
.ff-angler-casting .ff-bobber { top: 1.2em; opacity: 0; animation: ff-bobber-travel 1.8s steps(12, end) forwards; }

.ff-angler-waiting .ff-bobber { animation: ff-bob 3s steps(6, end) infinite; }

.ff-angler-catch .ff-rod { transform: rotate(-58deg); animation: ff-rod-catch 1s steps(8, end); }
.ff-angler-catch .ff-bobber { animation: ff-bobber-launch 0.7s steps(5, end); }

.ff-angler-miss { animation: ff-miss-shake 0.5s steps(5, end); }
.ff-angler-miss .ff-bobber { animation: ff-miss-bounce 1.2s steps(8, end); }

.ff-ripple { position: absolute; left: calc(3.85em - 0.6rem); top: calc(2.6em + 2rem); width: 1.4rem; height: 0.6rem; border: 2px solid rgba(255 255 255 / 0.65); border-radius: 50%; pointer-events: none; z-index: 3; animation: ff-water-ripple 1.2s steps(8, end) infinite; }
.ff-catch-fish { position: absolute; left: 1.5em; top: -0.5em; font-size: 1.3em; line-height: 1; animation: ff-fish-pop 1.2s steps(8, end) forwards; pointer-events: none; z-index: 4; }
.ff-miss-splash { position: absolute; left: calc(3.85em - 0.5rem); top: calc(2.6em + 2rem); width: 1.2rem; height: 0.5rem; border: 2px solid rgba(100 180 255 / 0.9); border-radius: 50%; pointer-events: none; z-index: 3; animation: ff-splash 0.9s steps(6, end) forwards; }
.ff-cloud-2 { left: 55%; top: 22%; width: 3.8rem; height: 1rem; box-shadow: 0.9rem -0.5rem 0 0.12rem #fff, 1.9rem 0.2rem 0 #fff; animation-duration: 19s; animation-delay: -11s; }

.ff-more { position: absolute; z-index: 3; right: 0.5rem; top: 0.5rem; padding: 0 0.5rem; font-weight: 800; background: #fff3df; border: 3px solid #493521; }
.ff-catch { width: calc(100% - 1rem); margin: 0 0.5rem 0.5rem; font-size: 1.1rem; background: #cfc8ba; }
.ff-catch-open { background: #f5bd4f; animation: ff-pulse 0.6s steps(4, end) infinite; }

/* ── Activity wheel ── */
.ff-activity { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.75rem 1rem; width: 100%; padding-bottom: 0.5rem; }
.ff-wheel-stage { position: relative; width: min(100%, 13rem); aspect-ratio: 1; margin-top: 0.5rem; flex-shrink: 0; }
.ff-result {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1 1 7rem; min-width: 7rem; min-height: 5rem;
  padding: 0.5rem 0.75rem; text-align: center; font-weight: 800; font-size: 1rem;
  background: linear-gradient(180deg, #fff8e7 0%, #f5e4b0 100%);
  border: 4px solid #4d2c12;
  outline: 2px solid #c8975e;
  box-shadow: inset 0 0 0 2px #e8c07a, 0 4px 0 #3d1e06;
  color: #3d2208;
}
.ff-wheel { display: block; width: 100%; height: 100%; border-radius: 50%; border: 7px solid #493521; box-shadow: inset 0 0 0 4px #e6bf82, 0 7px 0 rgb(48 30 15 / 0.4); background: #e6bf82; }

/* ── Scoreboard ── */
.ff-table-wrap { width: 100%; padding: 0.4rem 0; background: transparent; }
.ff-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; table-layout: auto; }
.ff-table th { padding: 0.2rem 0.4rem; font-size: 0.78rem; text-align: left; border-bottom: 3px solid #c8975e; color: #6b4423; }
.ff-table td { padding: 0.3rem 0.4rem; border-bottom: 2px dashed #e6bf82; white-space: nowrap; }
.ff-cell-rank { text-align: center; font-size: 1.1rem; width: 2rem; }
.ff-table .ff-cell-avatar { width: 1%; font-size: 0.7rem; }
.ff-table .ff-cell-name { width: 100%; white-space: normal; overflow-wrap: anywhere; font-weight: 800; }
.ff-table .ff-cell-catch { text-align: center; font-size: 0.82rem; }
.ff-table .ff-cell-score { font-weight: 800; text-align: right; color: #2980b9; font-size: 1rem; }
.ff-table .ff-cell-pp { font-weight: 800; text-align: right; color: #b8860b; font-size: 0.85rem; }
.ff-row-ignored { opacity: 0.5; }
.ff-eligibility-note { margin: 0; font-size: 0.8rem; font-weight: 700; text-align: center; color: #3a6b1e; padding-bottom: 0.5rem; }

/* ── Power Shop panel ── */
.ff-shop-panel { justify-items: stretch; }
.ff-shop-balance {
  display: flex; align-items: baseline; gap: 0.4rem; justify-self: center;
  font-size: 0.95rem; font-weight: 700; padding-top: 0.4rem;
}
.ff-shop-pts { font-size: 1.5rem; font-weight: 800; color: #b8860b; }
.ff-submitted-badge {
  padding: 0.5rem 0.75rem; font-weight: 700; text-align: center;
  background: #d4edda; border: 3px solid #493521; margin: 0 0.65rem;
}
.ff-shop-list { display: grid; gap: 0.3rem; width: 100%; margin: 0; padding: 0; list-style: none; }
.ff-shop-row {
  display: grid;
  grid-template-columns: 2.2rem 1fr auto auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
  background: rgb(255 243 223 / 0.6); border: 2px solid #c8975e;
  transition: background 0.1s;
}
.ff-shop-row-on { background: #fff9c4; border-color: #f5bd4f; }
.ff-shop-row-poor { opacity: 0.45; }
.ff-shop-icon { font-size: 1.5rem; text-align: center; line-height: 1; }
.ff-shop-info { display: grid; gap: 0.1rem; min-width: 0; }
.ff-shop-name { font-size: 0.85rem; font-weight: 800; overflow-wrap: anywhere; }
.ff-shop-desc { font-size: 0.7rem; line-height: 1.35; color: #6b4423; white-space: normal; }
.ff-shop-cost { font-size: 0.82rem; font-weight: 800; color: #b8860b; white-space: nowrap; }
.ff-shop-btn {
  padding: 0.3rem 0.65rem; min-height: 2rem;
  font-size: 0.82rem; font-weight: 800; color: #fff;
  background: #2980b9; border: 3px solid #1a5276; box-shadow: 0 3px 0 #1a5276;
  cursor: pointer; white-space: nowrap;
}
.ff-shop-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
.ff-shop-btn-cancel { background: #c0392b; border-color: #922b21; box-shadow: 0 3px 0 #922b21; }
.ff-shop-confirm {
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: center;
  padding: 0.5rem; background: rgb(255 255 255 / 0.5); border: 3px dashed #c8975e; margin: 0 0.65rem;
}
.ff-target-select {
  padding: 0.3rem 0.5rem; font-size: 0.88rem; font-weight: 700; color: #3d2208;
  background: #fff3df; border: 3px solid #493521;
}
.ff-shop-admin-bar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.4rem 0.65rem; width: 100%;
  background: rgb(0 0 0 / 0.07); border-top: 3px dashed #c8975e;
}
.ff-shop-count { font-size: 0.85rem; font-weight: 700; }
.ff-shop-close-btn { font-size: 0.85rem; }
.ff-shop-limit { margin: 0; font-size: 0.72rem; font-weight: 700; text-align: center; color: #6b4423; padding-bottom: 0.4rem; }
.ff-shop-hint { margin: 0; font-size: 0.85rem; font-weight: 700; text-align: center; color: #6b4423; }
.ff-shop-preview { width: 100%; padding-bottom: 0.4rem; }
.ff-shop-preview-list { display: grid; gap: 0.22rem; margin: 0.4rem 0 0; padding: 0; list-style: none; }
.ff-shop-preview-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.3rem 0.5rem; font-size: 0.82rem; font-weight: 700;
  background: rgb(255 255 255 / 0.35); border: 2px solid rgb(200 151 94 / 0.4);
  opacity: 0.7;
}
.ff-shop-preview-cost { margin-left: auto; color: #b8860b; }
.ff-action-log { display: grid; gap: 0.3rem; width: 100%; margin: 0; padding: 0; list-style: none; }
.ff-action-log-row { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.5rem; background: rgb(255 255 255 / 0.5); border: 2px solid #c8975e; font-size: 0.82rem; }
.ff-action-log-name { font-weight: 800; min-width: 0; overflow-wrap: anywhere; }
.ff-action-log-action { color: #6b4423; }

/* ── Next Host Wheel ── */
.ff-root .host-wheel-panel { padding: 0.6rem; }
.ff-root .host-wheel-stage { width: min(100%, 14rem); }
.ff-eligibility { display: grid; gap: 0.25rem; width: 100%; margin: 0; padding: 0 0 0.4rem; list-style: none; }
.ff-eligible { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.4rem; padding: 0.3rem 0.5rem; border: 2px solid #c8975e; background: #c9efc0; }
.ff-eligible-ignored { background: #f6b7b7; }
.ff-eligible-current-host, .ff-eligible-past-host { color: #5d5d5d; background: #e2ddd6; }
.ff-eligible-name { flex: 1 1 5rem; min-width: 0; font-size: 0.85rem; font-weight: 800; overflow-wrap: anywhere; }
.ff-eligible-tag { font-size: 0.78rem; }
.ff-toggle { min-height: 1.8rem; padding: 0 0.5rem; font-size: 0.75rem; font-weight: 800; color: #493521; background: #fff3df; border: 2px solid #493521; box-shadow: 0 2px 0 #493521; cursor: pointer; }
.ff-toggle:disabled { opacity: 0.55; cursor: not-allowed; }
.ff-chicken { image-rendering: pixelated; animation: ff-peck 1.2s steps(2, end) infinite; }
.ff-chicken-note { margin: 0; font-size: 0.78rem; font-weight: 700; text-align: center; color: #6b4423; padding-bottom: 0.4rem; }

/* ── Keyframes ── */
@keyframes ff-ripple { from { background-position: 0 0, 0 0.75rem; } to { background-position: 4rem 0, -5rem 0.75rem; } }
@keyframes ff-drift { from { transform: translateX(0); } to { transform: translateX(3rem); } }
@keyframes ff-dip { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0.45rem); } }
@keyframes ff-ring { from { width: 0.7rem; height: 0.35rem; opacity: 1; } to { width: 2.4rem; height: 1rem; opacity: 0; } }
@keyframes ff-pulse { 0%, 100% { box-shadow: 0 4px 0 0 #493521, 0 0 0 0 rgb(245 189 79 / 0.9); } 50% { box-shadow: 0 4px 0 0 #493521, 0 0 0 0.6rem rgb(245 189 79 / 0); filter: brightness(1.12); } }
@keyframes ff-peck { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(2px); } }
@keyframes ff-bob { 0%, 85%, 100% { transform: translateY(0); } 42% { transform: translateY(1px); } }
@keyframes ff-rod-catch { 0% { transform: rotate(-35deg); } 35% { transform: rotate(-65deg); } 65% { transform: rotate(-52deg); } 100% { transform: rotate(-58deg); } }
@keyframes ff-bobber-launch { 0% { transform: translateY(0); opacity: 1; } 50% { transform: translateY(-0.9rem); opacity: 1; } 100% { transform: translateY(-0.5rem); opacity: 0; } }
@keyframes ff-fish-pop { 0% { opacity: 1; transform: translateY(0) scale(1); } 45% { opacity: 1; transform: translateY(-1em) scale(1.3); } 100% { opacity: 0; transform: translateY(-1.8em) scale(0.5); } }
@keyframes ff-water-ripple { 0% { transform: scale(0.6); opacity: 0.8; } 70% { opacity: 0.3; } 100% { transform: scale(2.2); opacity: 0; } }
@keyframes ff-cast { 0% { transform: rotate(-72deg); } 20% { transform: rotate(-82deg); } 55% { transform: rotate(-8deg); } 100% { transform: rotate(-35deg); } }
@keyframes ff-line-extend { 0%, 35% { height: 0.4em; opacity: 0.4; } 70% { height: 50%; opacity: 0.8; } 100% { height: calc(2.7em + 2.4rem); opacity: 1; } }
@keyframes ff-bobber-travel { 0%, 35% { top: 1.2em; opacity: 0; } 55% { top: 1.0em; opacity: 1; } 100% { top: calc(2.6em + 2.1rem); opacity: 1; } }
@keyframes ff-miss-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
@keyframes ff-miss-bounce { 0% { transform: translateY(0.5rem); } 40% { transform: translateY(-0.3rem); } 70% { transform: translateY(0.1rem); } 100% { transform: translateY(0); } }
@keyframes ff-splash { 0% { transform: scale(0.5); opacity: 1; } 50% { transform: scale(1.5) scaleY(0.6); opacity: 0.6; } 100% { transform: scale(2.5) scaleY(0.3); opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .ff-root, .ff-root * { animation: none !important; transition: none !important; }
}
`;
