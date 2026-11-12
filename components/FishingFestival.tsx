"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { User } from "firebase/auth";
import { HostWheel } from "@/components/HostWheel";
import { currentHostUid, excludedHostUids } from "@/lib/crowded-farm";
import {
  endFishing,
  finishFishingGame,
  handOverHost,
  recordCatch,
  setIgnoredUids,
  spinActivityWheel,
  startFishingGame,
  subscribeToFishCatches,
  subscribeToFishingGame,
} from "@/lib/firebase/farm";
import type { Board, BoardMember, FishCatch, FishingGame, WheelSegment } from "@/lib/firebase/types";
import { buildCandidates, calcScores, type ScoredParticipant } from "@/lib/fishing-festival";
import { pickWinnerUid, wheelAngle } from "@/lib/wheel";

type FishingFestivalProps = {
  board: Board;
  members: BoardMember[];
  user: User;
  isAdmin: boolean;
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
/** A spin younger than this is animated; an older one is shown as it ended. */
const FRESH_SPIN_MS = 10_000;
const BITE_MIN_DELAY_MS = 4000;
const BITE_DELAY_SPREAD_MS = 4000;
const BITE_WINDOW_MS = 2500;
const TICK_MS = 200;

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

/** Step 5: the Fishing Festival mini-game that picks the next Host. */
export function FishingFestival({ board, members, user, isAdmin }: FishingFestivalProps) {
  const gameId = board.farmActiveGameId;
  return <FestivalRound key={gameId ?? "none"} gameId={gameId} board={board} members={members} user={user} isAdmin={isAdmin} />;
}

function FestivalRound({ gameId, board, members, user, isAdmin }: FishingFestivalProps & { gameId: string | null }) {
  const [game, setGame] = useState<FishingGame | null | undefined>(gameId === null ? null : undefined);
  const [catches, setCatches] = useState<FishCatch[]>([]);
  const [durationSec, setDurationSec] = useState<DurationSec>(45);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBiteOpen, setIsBiteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (gameId === null) return;
    return subscribeToFishingGame(board.id, gameId, setGame, () => setLoadError("โหลดข้อมูลรอบเกมไม่สำเร็จ"));
  }, [board.id, gameId]);

  useEffect(() => {
    if (gameId === null) return;
    return subscribeToFishCatches(board.id, gameId, setCatches, () => setLoadError("โหลดคะแนนการตกปลาไม่สำเร็จ"));
  }, [board.id, gameId]);

  const phase: Phase = game?.status ?? "idle";
  const nowMs = useNow(TICK_MS, phase === "fishing");
  const fishingEndsAt = game?.fishingEndsAt ?? null;
  // The first tick comes TICK_MS after the status change, so the stale clock is capped at the full duration.
  const timeLeft =
    game && phase === "fishing" && fishingEndsAt
      ? Math.min(game.fishingDurationSec * 1000, Math.max(0, fishingEndsAt.getTime() - nowMs))
      : null;
  const isFishingLive = timeLeft !== null && timeLeft > 0;

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

  if (loadError !== null || game === undefined) {
    return (
      <section className="ff-root farm-panel pixel-panel" aria-label="Fishing Festival">
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
  // After the handover the winner is the Host, so the round keeps showing the exclusions that applied when it was played.
  const hasHandedOver = phase === "finished" && winnerUid !== null && board.hostUid === winnerUid;
  const hostOfRound = hasHandedOver ? board.pastHostUids[board.pastHostUids.length - 1] : currentHostUid(board);
  const excludedUids = hasHandedOver ? [...new Set(board.pastHostUids)].sort() : excludedHostUids(board);
  const eligibilityOf = (uid: string): Eligibility => {
    if (uid === hostOfRound) return "current-host";
    if (excludedUids.includes(uid)) return "past-host";
    return ignoredUids.includes(uid) ? "ignored" : "included";
  };
  const nameOf = (uid: string) => members.find((member) => member.uid === uid)?.displayName ?? "ไม่ทราบชื่อ";
  const photoOf = (uid: string) => (uid === user.uid ? user.photoURL : null);

  // calcScores only scores the rows it is given, so every member gets a row and a member without a catch scores 0.
  // It returns the rows sorted by score, highest first, then by uid.
  const scored = calcScores(
    members.map((member) => {
      const fishCatch = catches.find((entry) => entry.uid === member.uid);
      return { uid: member.uid, catchCount: fishCatch?.catchCount ?? 0, lastCatchAt: fishCatch?.lastCatchAt ?? null };
    }),
    game?.wheelSegment ?? null,
  );
  const candidates = buildCandidates(
    members.map((member) => member.uid),
    ignoredUids,
    excludedUids,
  ).map((uid) => ({ uid, name: nameOf(uid) }));
  const canEditIgnored = isAdmin && game !== null && (phase === "selecting-wheel" || phase === "fishing" || phase === "scoring");

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

  function handleSpinHost() {
    if (!game) return;
    const pickedUid = pickWinnerUid(candidates);
    if (pickedUid) void run(() => finishFishingGame(board.id, game.id, pickedUid));
  }

  function handleToggleIgnored(uid: string) {
    if (!game) return;
    const next = ignoredUids.includes(uid) ? ignoredUids.filter((ignoredUid) => ignoredUid !== uid) : [...ignoredUids, uid].sort();
    void run(() => setIgnoredUids(board.id, game.id, next));
  }

  const canStart = isAdmin && (phase === "idle" || phase === "finished" || phase === "cancelled");
  const canHandOver = isAdmin && phase === "finished" && winnerUid !== null && !hasHandedOver;
  const sceneMembers = members.slice(0, MAX_SCENE_AVATARS);
  const hiddenMemberCount = members.length - sceneMembers.length;

  return (
    <section className="ff-root" aria-label="Fishing Festival">
      <FestivalStyles />
      <h2 className="ff-banner farm-sign">
        <span aria-hidden="true">🎣</span> Fishing Festival <span className="ff-banner-sub">ลุ้น Next Host กันเถอะ!</span>{" "}
        <span aria-hidden="true">🐟</span>
      </h2>

      {error ? (
        <p className="farm-warning" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ff-controls">
        {phase === "cancelled" ? <p className="ff-status">รอบนี้ถูกยกเลิกแล้ว</p> : null}
        {phase === "finished" && winnerUid !== null ? (
          <p className="ff-status" role="status">
            <span aria-hidden="true">♛</span> โฮสต์คนถัดไปคือ {nameOf(winnerUid)}!{hasHandedOver ? " (มอบตำแหน่งแล้ว)" : ""}
          </p>
        ) : null}
        {phase === "finished" && game?.resolution === "none" ? (
          <p className="farm-warning" role="alert">
            ไม่มีผู้มีสิทธิ์เป็น Next Host ในรอบนี้ ผู้ดำเนินรายการต้องตัดสินใจเอง
          </p>
        ) : null}
        {canHandOver ? (
          <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={() => void run(() => handOverHost(board.id))}>
            มอบตำแหน่ง
          </button>
        ) : null}
        {isAdmin && game && phase === "fishing" && timeLeft === 0 ? (
          <button type="button" className="pixel-button pixel-button-gold" disabled={isBusy} onClick={() => void run(() => endFishing(board.id, game.id))}>
            จบการตกปลา
          </button>
        ) : null}
        {canStart ? (
          <>
            <div className="ff-durations" role="group" aria-label="เวลาตกปลา">
              {DURATIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className="board-button board-button-quiet ff-duration"
                  aria-pressed={durationSec === seconds}
                  onClick={() => setDurationSec(seconds)}
                >
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

      <div className="ff-row ff-row-top">
        <div className="ff-panel ff-scene-panel">
          <div className="ff-scene">
            <span className="ff-cloud" aria-hidden="true" />
            {phase === "fishing" ? (
              <p className="ff-countdown" role="timer" aria-live="off">
                {timeLeft === null ? "--:--" : formatClock(timeLeft)}
              </p>
            ) : null}
            <div className="ff-water" aria-hidden="true" />
            <div className="ff-pier" aria-hidden="true" />
            <ul className="ff-anglers">
              {sceneMembers.map((member) => (
                <li key={member.uid} className="ff-angler" title={member.displayName}>
                  <Avatar photoUrl={photoOf(member.uid)} name={member.displayName} uid={member.uid} />
                  <span className="ff-rod" aria-hidden="true" />
                  <span className="ff-line" aria-hidden="true" />
                  <span className={`ff-bobber${member.uid === user.uid && canCatch ? " ff-bobber-bite" : ""}`} aria-hidden="true" />
                </li>
              ))}
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
          <ActivityWheel
            key={game?.wheelSpunAt?.getTime() ?? "none"}
            segment={game?.wheelSegment ?? null}
            spunAt={game?.wheelSpunAt ?? null}
          />
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

      <div className="ff-row ff-row-bottom">
        <div className="ff-panel ff-wood">
          <h3 className="ff-heading">กระดานคะแนน</h3>
          <Scoreboard scored={scored} ignoredUids={ignoredUids} nameOf={nameOf} photoOf={photoOf} />
        </div>

        <div className="ff-panel ff-wood">
          <h3 className="ff-heading">วงล้อ Next Host</h3>
          {game && (phase === "scoring" || phase === "finished") ? (
            <HostWheel
              key={`${game.id}:${game.resolvedAt?.getTime() ?? "none"}`}
              candidates={candidates}
              winnerUid={phase === "finished" ? winnerUid : null}
              spunAt={phase === "finished" ? game.resolvedAt : null}
              canSpin={isAdmin && phase === "scoring" && !isBusy}
              hint={phase === "scoring" ? "รอผู้ดำเนินรายการหมุนวงล้อ" : null}
              onSpin={handleSpinHost}
            />
          ) : (
            <p className="ff-note">วงล้อจะเปิดเมื่อจบการตกปลา</p>
          )}
          {phase === "scoring" && candidates.length === 0 ? (
            <p className="farm-warning" role="alert">
              ไม่มีผู้มีสิทธิ์เป็น Next Host เหลือแล้ว
            </p>
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
        </div>

        <div className="ff-panel ff-wood ff-rules">
          <h3 className="ff-heading">กติกา</h3>
          <ul className="ff-rule-list">
            <li>ผู้ดำเนินรายการหมุนวงล้อกิจกรรมเพื่อกำหนดโบนัสของรอบ</li>
            <li>เมื่อทุ่นจม ให้กดปุ่มดึงเบ็ดให้ทันก่อนปลาหนี</li>
            <li>ตกปลาให้ได้มากที่สุดก่อนหมดเวลา คะแนนขึ้นกับจำนวนปลาและโบนัส</li>
            <li>จบรอบแล้วหมุนวงล้อ Next Host จากผู้ที่มีสิทธิ์ Host ปัจจุบันและคนที่เคยเป็น Host ไม่ถูกสุ่ม</li>
          </ul>
          <PixelChicken />
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
      // A Google profile photo is an external URL; next/image would need a remote-host config for no gain at this size.
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

/** A point on the wheel, `deg` clockwise from the top, rounded so the markup is stable. */
function wheelPoint(deg: number, radius: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(WHEEL_CENTER + radius * Math.sin(rad)).toFixed(2)} ${(WHEEL_CENTER - radius * Math.cos(rad)).toFixed(2)}`;
}

type ActivityWheelProps = { segment: WheelSegment | null; spunAt: Date | null };

/** Remounted by key for every spin, so the first render decides once whether the spin is animated. */
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
                  <text x={WHEEL_CENTER} y="34" fontSize="18">
                    {entry.emoji}
                  </text>
                  <text x={WHEEL_CENTER} y="52" fontSize="9" fontWeight="800">
                    {entry.label}
                  </text>
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
};

function Scoreboard({ scored, ignoredUids, nameOf, photoOf }: ScoreboardProps) {
  return (
    <div className="ff-table-wrap">
      <table className="ff-table">
        <thead>
          <tr>
            <th scope="col">อันดับ</th>
            <th scope="col" colSpan={2}>
              ผู้เล่น
            </th>
            <th scope="col">ปลา</th>
            <th scope="col">คะแนน</th>
          </tr>
        </thead>
        <tbody>
          {scored.map((participant) => (
            <tr key={participant.uid} className={ignoredUids.includes(participant.uid) ? "ff-row-ignored" : undefined}>
              <td>
                <span aria-hidden="true">{participant.rank === 1 && participant.score > 0 ? "👑" : "🐟"}</span> {participant.rank}
              </td>
              <td className="ff-cell-avatar">
                <Avatar photoUrl={photoOf(participant.uid)} name={nameOf(participant.uid)} uid={participant.uid} />
              </td>
              <td className="ff-cell-name">{nameOf(participant.uid)}</td>
              <td>
                <span aria-hidden="true">🐟</span> {participant.catchCount}
              </td>
              <td className="ff-cell-score">{participant.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Each row is one pixel line of the mascot: [x, y, width, fill]. */
const CHICKEN_PIXELS: readonly (readonly [number, number, number, string])[] = [
  [5, 0, 2, "#d9433b"],
  [4, 1, 4, "#d9433b"],
  [4, 2, 4, "#fffaf0"],
  [3, 3, 6, "#fffaf0"],
  [6, 3, 1, "#2f2218"],
  [9, 4, 2, "#f29a4a"],
  [3, 4, 6, "#fffaf0"],
  [8, 5, 1, "#d9433b"],
  [2, 5, 6, "#fffaf0"],
  [1, 6, 8, "#fffaf0"],
  [0, 7, 9, "#fffaf0"],
  [2, 7, 3, "#e6dccb"],
  [0, 8, 9, "#fffaf0"],
  [1, 9, 7, "#fffaf0"],
  [3, 10, 1, "#f29a4a"],
  [6, 10, 1, "#f29a4a"],
  [2, 11, 2, "#f29a4a"],
  [5, 11, 2, "#f29a4a"],
];

function PixelChicken() {
  return (
    <svg className="ff-chicken" viewBox="0 0 12 12" width="60" height="60" shapeRendering="crispEdges" aria-hidden="true">
      {CHICKEN_PIXELS.map(([x, y, width, fill]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width={width} height="1" fill={fill} />
      ))}
    </svg>
  );
}

/** React hoists and dedupes a style tag that has href and precedence, so every render shares one sheet. */
function FestivalStyles() {
  return (
    <style href="fishing-festival" precedence="medium">
      {STYLES}
    </style>
  );
}

const STYLES = `
.ff-root { display: grid; gap: 0.9rem; width: 100%; min-width: 0; color: #493521; }
.ff-banner { justify-self: center; font-size: clamp(1.15rem, 3vw, 2rem); }
.ff-banner-sub { font-size: 0.75em; white-space: nowrap; }
.ff-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.6rem; }
.ff-controls:empty { display: none; }
.ff-status { margin: 0; padding: 0.3rem 0.9rem; font-weight: 800; background: #fff3df; border: 3px solid #493521; overflow-wrap: anywhere; }
.ff-durations { display: flex; gap: 0.4rem; }
.ff-duration[aria-pressed="true"] { background: #f5bd4f; box-shadow: inset 0 0 0 2px #ffe08a, 0 3px 0 #493521; }
.ff-row { display: grid; gap: 0.9rem; grid-template-columns: minmax(0, 1fr); align-items: stretch; }
@media (min-width: 48rem) {
  .ff-row-top { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  .ff-row-bottom { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 0.8fr); }
}
.ff-panel { display: grid; align-content: start; justify-items: center; gap: 0.7rem; min-width: 0; padding: 0.75rem; border: 4px solid #4d2c12; box-shadow: 4px 5px 0 rgb(48 30 15 / 0.4); }
.ff-wood { background: repeating-linear-gradient(#e9c88f 0 22px, #dfb878 22px 24px); box-shadow: inset 0 0 0 3px #f3d9a4, 4px 5px 0 rgb(48 30 15 / 0.4); }
.ff-scene-panel { padding: 0; background: #6b4423; }
.ff-heading { margin: 0; padding: 0.15rem 0.9rem; font-size: 1.05rem; font-weight: 800; color: #fff3df; background: #6b4423; border: 3px solid #493521; }
.ff-note { margin: 0; text-align: center; font-weight: 700; }

.ff-scene { position: relative; width: 100%; min-height: clamp(14rem, 32vw, 20rem); overflow: hidden; background: #87CEEB; }
.ff-cloud { position: absolute; top: 12%; left: 10%; width: 4.5rem; height: 1rem; background: #fff; box-shadow: 1rem -0.6rem 0 #fff, 2.2rem 0.4rem 0 #fff, 12rem 1rem 0 -0.15rem #fff; animation: ff-drift 14s steps(14, end) infinite alternate; }
.ff-countdown { position: absolute; z-index: 3; top: 0.5rem; left: 50%; margin: 0; padding: 0.1rem 0.9rem; transform: translateX(-50%); font-family: var(--font-pixel), monospace; font-size: clamp(1.8rem, 5vw, 3rem); font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; background: #fff3df; border: 4px solid #493521; box-shadow: 0 4px 0 #493521; }
.ff-water { position: absolute; inset: 55% 0 0 0; background-color: #3f8fc4; background-image: linear-gradient(90deg, rgb(255 255 255 / 0.4) 0 40%, transparent 40% 100%), linear-gradient(90deg, transparent 0 55%, rgb(255 255 255 / 0.25) 55% 85%, transparent 85% 100%); background-size: 4rem 3px, 5rem 3px; background-repeat: repeat-x; background-position: 0 0, 0 0.75rem; animation: ff-ripple 2.4s steps(8, end) infinite; }
.ff-grass { position: absolute; z-index: 2; inset: auto 0 0 0; height: 1.25rem; background: #6bbf4a; border-top: 4px solid #3f8f3a; }
.ff-pier { position: absolute; z-index: 1; left: 4%; right: 4%; top: calc(55% - 0.5rem); height: 1rem; background: repeating-linear-gradient(90deg, #8b5a2b 0 1.4rem, #6b4423 1.4rem 1.55rem); border: 3px solid #4d2c12; }
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
.ff-more { position: absolute; z-index: 3; right: 0.5rem; top: 0.5rem; padding: 0 0.5rem; font-weight: 800; background: #fff3df; border: 3px solid #493521; }
.ff-catch { width: calc(100% - 1.5rem); margin: 0 0.75rem 0.75rem; font-size: 1.15rem; background: #cfc8ba; }
.ff-catch-open { background: #f5bd4f; animation: ff-pulse 0.6s steps(4, end) infinite; }

.ff-activity { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.9rem; width: 100%; }
.ff-wheel-stage { position: relative; width: min(100%, 17rem); aspect-ratio: 1; margin-top: 1.2rem; }
.ff-wheel { display: block; width: 100%; height: 100%; border-radius: 50%; border: 6px solid #493521; box-shadow: inset 0 0 0 4px #e6bf82, 0 6px 0 rgb(48 30 15 / 0.4); background: #e6bf82; }
.ff-result { font-size: 1.05rem; }

.ff-table-wrap { width: 100%; padding: 0.4rem; background: #fff3df; border: 4px solid #493521; box-shadow: inset 0 0 0 3px #e6bf82; }
.ff-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; table-layout: auto; }
.ff-table th { padding: 0.2rem 0.3rem; font-size: 0.8rem; text-align: left; border-bottom: 3px solid #493521; }
.ff-table td { padding: 0.25rem 0.3rem; border-bottom: 2px dashed #e6bf82; white-space: nowrap; }
.ff-table .ff-cell-avatar { width: 1%; font-size: 0.7rem; }
.ff-table .ff-cell-name { width: 100%; white-space: normal; overflow-wrap: anywhere; font-weight: 800; }
.ff-table .ff-cell-score { font-weight: 800; text-align: right; }
.ff-row-ignored { opacity: 0.5; }

.ff-root .host-wheel-panel { padding: 0.75rem; }
.ff-root .host-wheel-stage { width: min(100%, 16rem); }
.ff-eligibility { display: grid; gap: 0.35rem; width: 100%; margin: 0; padding: 0; list-style: none; }
.ff-eligible { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.5rem; padding: 0.3rem 0.5rem; border: 3px solid #493521; background: #c9efc0; }
.ff-eligible-ignored { background: #f6b7b7; }
.ff-eligible-current-host, .ff-eligible-past-host { color: #5d5d5d; background: #d3d0c9; }
.ff-eligible-name { flex: 1 1 5rem; min-width: 0; font-weight: 800; overflow-wrap: anywhere; }
.ff-eligible-tag { font-size: 0.85rem; }
.ff-toggle { min-height: 2rem; padding: 0 0.6rem; font-size: 0.8rem; font-weight: 800; color: #493521; background: #fff3df; border: 2px solid #493521; box-shadow: 0 2px 0 #493521; cursor: pointer; }
.ff-toggle:disabled { opacity: 0.55; cursor: not-allowed; }

.ff-rules { justify-items: stretch; }
.ff-rules .ff-heading { justify-self: center; }
.ff-rule-list { display: grid; gap: 0.4rem; margin: 0; padding-left: 1.2rem; list-style: square; font-size: 0.95rem; }
.ff-chicken { justify-self: end; align-self: end; image-rendering: pixelated; animation: ff-peck 1.2s steps(2, end) infinite; }

@keyframes ff-ripple { from { background-position: 0 0, 0 0.75rem; } to { background-position: 4rem 0, -5rem 0.75rem; } }
@keyframes ff-drift { from { transform: translateX(0); } to { transform: translateX(3rem); } }
@keyframes ff-dip { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0.45rem); } }
@keyframes ff-ring { from { width: 0.7rem; height: 0.35rem; opacity: 1; } to { width: 2.4rem; height: 1rem; opacity: 0; } }
@keyframes ff-pulse { 0%, 100% { box-shadow: 0 4px 0 0 #493521, 0 0 0 0 rgb(245 189 79 / 0.9); } 50% { box-shadow: 0 4px 0 0 #493521, 0 0 0 0.6rem rgb(245 189 79 / 0); filter: brightness(1.12); } }
@keyframes ff-peck { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(2px); } }

@media (prefers-reduced-motion: reduce) {
  .ff-root, .ff-root * { animation: none !important; transition: none !important; }
}
`;
