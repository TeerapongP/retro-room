"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FarmCrop } from "@/components/FarmCrops";
import { HostWheel } from "@/components/HostWheel";
import {
  FARM_FIELDS,
  FARM_REVEAL_DELAY_MS,
  FARM_SELECTION_SECONDS,
  candidateUidsOf,
  farmDeadlineMillis,
  formatScore,
  isFarmError,
  isFarmPlayer,
  isPersistedWinnerConsistent,
  revealFarmGame,
  type FarmChoice,
  type FarmFieldId,
  type FarmGame,
} from "@/lib/crowded-farm";
import {
  cancelFarmGame,
  chooseFarmField,
  finishFarmGame,
  newFarmGameId,
  startFarmGame,
  storeCancelledFarmFallback,
  subscribeToFarmChoices,
  subscribeToFarmGame,
  subscribeToMyFarmChoice,
} from "@/lib/firebase/farm";
import type { Board, BoardMember } from "@/lib/firebase/types";
import { pickWinnerUid } from "@/lib/wheel";

type RunAction = (action: () => Promise<void>) => Promise<boolean>;

type CrowdedFarmProps = {
  board: Board;
  members: BoardMember[];
  uid: string;
  isAdmin: boolean;
  runAction: RunAction;
};

const MIN_PLAYERS = 2;
const MAX_CHOICE_READ_RETRIES = 6;
/** Time to look at the revealed counts before the admin's screen stores a direct winner. */
const AUTO_FINISH_DELAY_MS = 4000;

function useNow(intervalMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timerId = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timerId);
  }, [intervalMs]);
  return nowMs;
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "permission-denied";
}

/** "Already resolved" means another request stored the result first; the screen refreshes from the snapshots. */
function ignoreAlreadyResolved(runAction: RunAction, action: () => Promise<void>): Promise<boolean> {
  return runAction(async () => {
    try {
      await action();
    } catch (error) {
      if (!isFarmError(error, "already-resolved")) throw error;
    }
  });
}

/** Step 5: the Crowded Farm mini-game (F30). Without a round the admin can start one. */
export function CrowdedFarm({ board, members, uid, isAdmin, runAction }: CrowdedFarmProps) {
  if (board.farmActiveGameId === null) {
    return <FarmIdle boardId={board.id} playerCount={members.length} isAdmin={isAdmin} runAction={runAction} />;
  }
  return (
    <FarmRound
      key={board.farmActiveGameId}
      gameId={board.farmActiveGameId}
      board={board}
      members={members}
      uid={uid}
      isAdmin={isAdmin}
      runAction={runAction}
    />
  );
}

function FarmIntro() {
  return (
    <p className="farm-rule">
      เลือกแปลง ยิ่งมีชาวไร่ร่วมแปลงน้อย ยิ่งเก็บเกี่ยวได้แต้มมาก
    </p>
  );
}

type StartButtonProps = {
  boardId: string;
  playerCount: number;
  runAction: RunAction;
  label: string;
};

function StartButton({ boardId, playerCount, runAction, label }: StartButtonProps) {
  const [isStarting, setIsStarting] = useState(false);
  const hasEnoughPlayers = playerCount >= MIN_PLAYERS;

  async function handleStart() {
    setIsStarting(true);
    const gameId = newFarmGameId(boardId);
    await runAction(() => startFarmGame(boardId, gameId));
    setIsStarting(false);
  }

  return (
    <>
      <button type="button" className="pixel-button pixel-button-gold" disabled={isStarting || !hasEnoughPlayers} onClick={handleStart}>
        {label}
      </button>
      {hasEnoughPlayers ? null : <p className="farm-hint">ต้องมีผู้เล่นอย่างน้อย {MIN_PLAYERS} คนก่อนเริ่มเกม</p>}
    </>
  );
}

function FarmIdle({ boardId, playerCount, isAdmin, runAction }: Pick<CrowdedFarmProps, "isAdmin" | "runAction"> & { boardId: string; playerCount: number }) {
  return (
    <section className="farm-panel pixel-panel" aria-label="เกมเลือกแปลง">
      <h2 className="farm-title">เลือกแปลงให้ดี</h2>
      <FarmIntro />
      <div className="farm-fields">
        {FARM_FIELDS.map((field) => (
          <div key={field.id} className="farm-field farm-field-preview">
            <FarmCrop field={field.id} className="farm-crop" />
            <span className="farm-field-name">{field.label}</span>
            <span className="farm-field-base">ฐาน {field.baseYield} แต้ม</span>
          </div>
        ))}
      </div>
      {isAdmin ? (
        <StartButton boardId={boardId} playerCount={playerCount} runAction={runAction} label="เริ่มเกม" />
      ) : (
        <p className="farm-hint">รอผู้ดำเนินรายการเริ่มเกม</p>
      )}
    </section>
  );
}

type FarmRoundProps = CrowdedFarmProps & { gameId: string };

function FarmRound({ gameId, board, members, uid, isAdmin, runAction }: FarmRoundProps) {
  const nowMs = useNow(250);
  const [game, setGame] = useState<FarmGame | null | undefined>(undefined);
  const [myField, setMyField] = useState<FarmFieldId | null>(null);
  const [choices, setChoices] = useState<FarmChoice[] | null>(null);
  const [choicesRun, setChoicesRun] = useState(0);
  const [hasChoicesFailed, setHasChoicesFailed] = useState(false);
  const failedChoiceReads = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToFarmGame(board.id, gameId, setGame, () => setLoadError("โหลดข้อมูลรอบเกมไม่สำเร็จ"));
  }, [board.id, gameId]);

  useEffect(() => {
    return subscribeToMyFarmChoice(board.id, gameId, uid, setMyField, () => setMyField(null));
  }, [board.id, gameId, uid]);

  const startedAt = game?.startedAt ?? null;
  const deadlineMs = startedAt ? farmDeadlineMillis(startedAt) : null;
  const isBeforeDeadline = deadlineMs !== null && nowMs < deadlineMs;
  // The local clock can be ahead of the server, so the collection is read a little after the local deadline and the
  // read is retried when the Rules still refuse it (D155).
  const shouldReadChoices = deadlineMs !== null && nowMs >= deadlineMs + FARM_REVEAL_DELAY_MS;

  useEffect(() => {
    if (!shouldReadChoices) return;
    let retryTimerId: ReturnType<typeof setTimeout> | undefined;
    const stop = subscribeToFarmChoices(
      board.id,
      gameId,
      (nextChoices) => {
        failedChoiceReads.current = 0;
        setHasChoicesFailed(false);
        setChoices(nextChoices);
      },
      (error) => {
        failedChoiceReads.current += 1;
        if (isPermissionDenied(error) && failedChoiceReads.current <= MAX_CHOICE_READ_RETRIES) {
          retryTimerId = setTimeout(() => setChoicesRun((run) => run + 1), Math.min(4000, 400 * 2 ** failedChoiceReads.current));
        } else {
          setHasChoicesFailed(true);
        }
      },
    );
    return () => {
      clearTimeout(retryTimerId);
      stop();
    };
  }, [board.id, gameId, shouldReadChoices, choicesRun]);

  function retryReadingChoices() {
    failedChoiceReads.current = 0;
    setHasChoicesFailed(false);
    setChoicesRun((run) => run + 1);
  }

  const playerUids = members.filter((member) => isFarmPlayer(member.joinedAt, startedAt)).map((member) => member.uid);
  const reveal = choices !== null && playerUids.length > 0 ? revealFarmGame(gameId, playerUids, choices) : null;
  const directWinnerUid = reveal?.outcome.kind === "direct" ? reveal.outcome.winnerUid : null;
  const nameOf = (memberUid: string) => members.find((member) => member.uid === memberUid)?.displayName ?? "ไม่ทราบชื่อ";

  const status = game?.status;
  const isStoredOnBoard = board.nextHostGameId === gameId;
  const isResolved = status === "finished" || (status === "cancelled" && isStoredOnBoard);

  // The admin's screen stores a direct winner after the counts have been shown. The callbacks live in a ref so the
  // timer is not restarted on every render.
  const latest = useRef({ runAction, boardId: board.id });
  useEffect(() => {
    latest.current = { runAction, boardId: board.id };
  });
  useEffect(() => {
    if (!isAdmin || status !== "selecting" || directWinnerUid === null) return;
    const timerId = setTimeout(() => {
      const { runAction: run, boardId } = latest.current;
      void ignoreAlreadyResolved(run, () => finishFarmGame(boardId, gameId, directWinnerUid, "direct"));
    }, AUTO_FINISH_DELAY_MS);
    return () => clearTimeout(timerId);
  }, [isAdmin, status, directWinnerUid, gameId]);

  if (loadError) return <FarmMessage text={loadError} />;
  if (game === undefined) return <FarmMessage text="กำลังโหลดรอบเกม…" />;
  if (game === null) return <FarmMessage text="ไม่พบรอบเกมนี้" />;

  const iAmPlayer = isFarmPlayer(members.find((member) => member.uid === uid)?.joinedAt ?? null, startedAt);
  const secondsLeft = deadlineMs === null ? 0 : Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));

  async function handleChoose(field: FarmFieldId) {
    await runAction(() => chooseFarmField(board.id, gameId, uid, field));
  }

  function spinWheel(candidateUids: string[], persist: (winnerUid: string) => Promise<void>) {
    const winnerUid = pickWinnerUid(candidateUids.map((candidateUid) => ({ uid: candidateUid, name: "" })));
    if (winnerUid) void ignoreAlreadyResolved(runAction, () => persist(winnerUid));
  }

  const wheelCandidates = (candidateUids: string[]) => candidateUids.map((candidateUid) => ({ uid: candidateUid, name: nameOf(candidateUid) }));
  const hasWheelResult = isStoredOnBoard && board.nextHostSpunAt !== null && board.nextHostUid !== null;

  let body: ReactNode;
  if (status === "selecting" && isBeforeDeadline) {
    body = (
      <>
        <p className="farm-countdown" role="timer" aria-live="off">
          {secondsLeft}
        </p>
        <FarmIntro />
        <div className="farm-fields">
          {FARM_FIELDS.map((field) => (
            <button
              key={field.id}
              type="button"
              className="farm-field"
              aria-pressed={myField === field.id}
              disabled={!iAmPlayer}
              onClick={() => void handleChoose(field.id)}
            >
              <FarmCrop field={field.id} className="farm-crop" />
              <span className="farm-field-name">{field.label}</span>
              <span className="farm-field-base">ฐาน {field.baseYield} แต้ม</span>
              {myField === field.id ? <span className="farm-picked">เลือกแล้ว</span> : null}
            </button>
          ))}
        </div>
        <p className="farm-hint">
          {iAmPlayer
            ? myField
              ? "เปลี่ยนใจได้จนกว่าเวลาจะหมด ตัวเลือกของคนอื่นยังเป็นความลับ"
              : `เลือกภายใน ${FARM_SELECTION_SECONDS} วินาที ถ้าไม่เลือกจะถูกกำหนดแปลงให้`
            : "คุณเข้าบอร์ดหลังเริ่มรอบนี้ จึงดูผลได้อย่างเดียว"}
        </p>
      </>
    );
  } else if (status === "cancelled" && !isStoredOnBoard) {
    body = (
      <>
        <p className="farm-hint">ยกเลิกเกมแล้ว หมุนวงล้อเลือกโฮสต์จากผู้เล่นทุกคนแทน</p>
        <HostWheel
          candidates={wheelCandidates(playerUids)}
          winnerUid={null}
          spunAt={null}
          canSpin={isAdmin}
          hint="รอผู้ดำเนินรายการหมุนวงล้อ"
          onSpin={() => spinWheel(playerUids, (winnerUid) => storeCancelledFarmFallback(board.id, gameId, winnerUid))}
        />
      </>
    );
  } else if (status === "cancelled") {
    body = (
      <>
        <p className="farm-hint">เกมถูกยกเลิก ผลมาจากวงล้อสำรอง</p>
        <HostWheel
          key={`${gameId}:${board.nextHostSpunAt?.getTime() ?? "none"}`}
          candidates={wheelCandidates(playerUids)}
          winnerUid={hasWheelResult ? board.nextHostUid : null}
          spunAt={hasWheelResult ? board.nextHostSpunAt : null}
          canSpin={false}
          hint={null}
          onSpin={() => undefined}
        />
      </>
    );
  } else if (reveal === null) {
    body = (
      <>
        <p className="farm-hint">{hasChoicesFailed ? "อ่านตัวเลือกไม่สำเร็จ" : "หมดเวลา กำลังเปิดแปลง…"}</p>
        {hasChoicesFailed ? (
          <button type="button" className="pixel-button pixel-button-gold" onClick={retryReadingChoices}>
            ลองอีกครั้ง
          </button>
        ) : null}
      </>
    );
  } else {
    const persistedWinnerUid = game.winnerUid;
    const isInconsistent =
      status === "finished" &&
      persistedWinnerUid !== null &&
      (!isPersistedWinnerConsistent(reveal.outcome, persistedWinnerUid) ||
        (isStoredOnBoard && board.nextHostUid !== persistedWinnerUid));
    const shouldShowWheel = reveal.outcome.kind !== "direct";
    const wheelCandidateUids = candidateUidsOf(reveal.outcome);
    body = (
      <>
        <div className="farm-fields">
          {reveal.tallies.map((tally) => (
            <div key={tally.field.id} className={`farm-field farm-field-result${tally.isBest ? " farm-field-best" : ""}`}>
              <FarmCrop field={tally.field.id} className="farm-crop" />
              <span className="farm-field-name">{tally.field.label}</span>
              <span className="farm-count">{tally.playerCount} คน</span>
              <span className="farm-score">{tally.playerCount > 0 ? `${formatScore(tally.scoreHundredths)} แต้ม/คน` : "ไม่มีใครเลือก"}</span>
            </div>
          ))}
        </div>
        {isInconsistent ? (
          <p className="farm-warning" role="alert">
            คำเตือน: ผู้ชนะที่บันทึกไว้ไม่ตรงกับผลที่คำนวณจากตัวเลือก กรุณาแจ้งผู้ดำเนินรายการ
          </p>
        ) : null}
        {shouldShowWheel ? (
          <HostWheel
            key={`${gameId}:${board.nextHostSpunAt?.getTime() ?? "none"}`}
            candidates={wheelCandidates(wheelCandidateUids)}
            winnerUid={status === "finished" && hasWheelResult ? board.nextHostUid : null}
            spunAt={status === "finished" && hasWheelResult ? board.nextHostSpunAt : null}
            canSpin={isAdmin && status === "selecting"}
            hint={status === "selecting" ? "รอผู้ดำเนินรายการหมุนวงล้อ" : null}
            onSpin={() =>
              spinWheel(wheelCandidateUids, (winnerUid) =>
                finishFarmGame(board.id, gameId, winnerUid, reveal.outcome.kind === "all-wheel" ? "all-wheel" : "tie-wheel"),
              )
            }
          />
        ) : null}
        {!shouldShowWheel && directWinnerUid !== null ? (
          <FarmWinner
            name={nameOf(status === "finished" && persistedWinnerUid ? persistedWinnerUid : directWinnerUid)}
            isStored={status === "finished"}
            isAdmin={isAdmin}
            onConfirm={() => void ignoreAlreadyResolved(runAction, () => finishFarmGame(board.id, gameId, directWinnerUid, "direct"))}
          />
        ) : null}
        {!reveal.hasExplicitChoice ? <p className="farm-hint">ไม่มีใครเลือกเอง จึงหมุนวงล้อจากผู้เล่นทุกคน</p> : null}
      </>
    );
  }

  return (
    <section className="farm-panel pixel-panel" aria-label="เกมเลือกแปลง">
      <h2 className="farm-title">เลือกแปลงให้ดี</h2>
      {body}
      {isAdmin ? (
        <div className="farm-admin">
          {status === "selecting" ? (
            <button type="button" className="pixel-button" onClick={() => void ignoreAlreadyResolved(runAction, () => cancelFarmGame(board.id, gameId))}>
              ยกเลิกเกม
            </button>
          ) : null}
          {isResolved ? <StartButton boardId={board.id} playerCount={members.length} runAction={runAction} label="เล่นอีกรอบ" /> : null}
        </div>
      ) : null}
    </section>
  );
}

function FarmMessage({ text }: { text: string }) {
  return (
    <section className="farm-panel pixel-panel" aria-label="เกมเลือกแปลง">
      <p className="farm-hint">{text}</p>
    </section>
  );
}

type FarmWinnerProps = { name: string; isStored: boolean; isAdmin: boolean; onConfirm: () => void };

function FarmWinner({ name, isStored, isAdmin, onConfirm }: FarmWinnerProps) {
  return (
    <div className="farm-winner" role="status">
      <p className="farm-winner-line">โฮสต์คนถัดไป: {name}</p>
      {isStored ? null : (
        <>
          <p className="farm-hint">ยังไม่ใช่ผลทางการ รอผู้ดำเนินรายการยืนยัน</p>
          {isAdmin ? (
            <button type="button" className="pixel-button pixel-button-gold" onClick={onConfirm}>
              ยืนยันผู้ชนะ
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
