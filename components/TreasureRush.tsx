"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { HostWheel } from "@/components/HostWheel";
import { currentHostUid, excludedHostUids } from "@/lib/crowded-farm";
import {
  bankTreasure,
  buyBattleItem,
  endTreasureRush,
  handOverHost,
  lockPowerPoints,
  lockSettlement,
  openChest,
  resolveAttack,
  reSpinTreasureHostWheel,
  sendReaction,
  setIgnoredUids,
  spinTreasureHostWheel,
  spinTreasureWheel,
  startTreasureRush,
  submitTreasurePowerAction,
  subscribeToAttacks,
  subscribeToBattleFeed,
  subscribeToInventory,
  subscribeToMyChestBoard,
  subscribeToReactions,
  subscribeToTreasureGame,
  subscribeToTreasurePowerActions,
  subscribeToFishingPowerPoints,
  subscribeToTreasurePlayerStates,
  useDefensiveItemAgainstAttack as fireDefensiveItem,
  useOffensiveItem as fireOffensiveItem,
  writeChestBoards,
} from "@/lib/firebase/farm";
import type {
  AchievementResult,
  AttackDocument,
  BattleFeedEvent,
  BattleItemType,
  Board,
  BoardMember,
  InventoryState,
  PowerPoints,
  Reaction,
  ReactionType,
  TreasureChest,
  TreasureGame,
  TreasureModifier,
  TreasurePlayerState,
  TreasurePowerAction,
  TreasurePowerActionType,
} from "@/lib/firebase/types";
import {
  ATTACK_WARNING_MS,
  BATTLE_ITEM_CATEGORIES,
  BATTLE_ITEM_COSTS,
  FINAL_RUSH_ATTACK_SHUTDOWN_MS,
  TREASURE_MAX_RESPINS,
  TREASURE_POWER_ACTION_COSTS,
} from "@/lib/firebase/types";
import {
  buildTreasureCandidates,
  calcAchievements,
  calcTreasureScores,
  earnedPP,
  generateChestBoard,
  isFinalRush,
  resolveTreasureActions,
  type ScoredTreasureParticipant,
} from "@/lib/treasure-rush";
import { pickWinnerUid } from "@/lib/wheel";

type TreasureRushProps = {
  board: Board;
  members: BoardMember[];
  user: User;
  isAdmin: boolean;
  onAdvancePhase?: () => void;
};

type Eligibility = "included" | "ignored" | "current-host" | "past-host";

const MODIFIERS: readonly { id: TreasureModifier; emoji: string; label: string; color: string }[] = [
  { id: "gem-fever", emoji: "💎", label: "Gem Fever", color: "#b48ad8" },
  { id: "coin-rain", emoji: "🪙", label: "Coin Rain", color: "#e0a21b" },
  { id: "safe-expedition", emoji: "🛡️", label: "Safe Expedition", color: "#7cc36a" },
  { id: "royal-treasure", emoji: "👑", label: "Royal Treasure", color: "#e2685d" },
  { id: "lucky-explorer", emoji: "🍀", label: "Lucky Explorer", color: "#4aa3c7" },
  { id: "double-treasure", emoji: "💰", label: "Double Treasure", color: "#f29a4a" },
];

const DURATIONS: readonly (60 | 90 | 120 | 180)[] = [60, 90, 120, 180];

const POWER_ACTION_ORDER: readonly TreasurePowerActionType[] = [
  "trap-shield",
  "gem-bonus",
  "double-loot",
  "lucky-reroll",
  "royal-bonus",
];

const ACTION_ICON: Record<TreasurePowerActionType, string> = {
  "trap-shield": "🛡️",
  "gem-bonus": "💎",
  "double-loot": "✨",
  "lucky-reroll": "🎲",
  "royal-bonus": "👑",
};

const ACTION_LABEL: Record<TreasurePowerActionType, string> = {
  "trap-shield": "Treasure Shield",
  "gem-bonus": "Gem Bonus",
  "double-loot": "Double Loot",
  "lucky-reroll": "Lucky Re-roll",
  "royal-bonus": "Royal Bonus",
};

const ACTION_DESC: Record<TreasurePowerActionType, string> = {
  "trap-shield": "คืนคะแนนที่เสียจาก Trap สูงสุด 50 แต้ม",
  "gem-bonus": "บวก 50 แต้ม ถ้าเปิดกล่อง Gem อย่างน้อย 1 ใบ",
  "double-loot": "เพิ่มรางวัลเดี่ยวสูงสุดเป็น 2 เท่า",
  "lucky-reroll": "หมุนวงล้อ Next Host ใหม่ได้อีก 1 ครั้ง",
  "royal-bonus": "บวก 100 แต้ม ถ้าเปิดกล่อง Crown อย่างน้อย 1 ใบ",
};

const CHEST_EMOJI: Record<string, string> = {
  coins: "🪙",
  gem: "💎",
  crown: "👑",
  trap: "💀",
  mystery: "🎁",
};

const BATTLE_ITEM_EMOJI: Record<BattleItemType, string> = {
  "magic-shield": "🛡️",
  "treasure-lock": "🔒",
  "recovery-potion": "💊",
  "mirror-shield": "🪞",
  "bomb-gift": "💣",
  "sneaky-thief": "🦝",
  "ice-trap": "🧊",
  "chaos-swap": "🔀",
  "lucky-key": "🗝️",
  "treasure-radar": "📡",
  "golden-pick": "⛏️",
};

const BATTLE_ITEM_LABEL: Record<BattleItemType, string> = {
  "magic-shield": "Magic Shield",
  "treasure-lock": "Treasure Lock",
  "recovery-potion": "Recovery Potion",
  "mirror-shield": "Mirror Shield",
  "bomb-gift": "Bomb Gift",
  "sneaky-thief": "Sneaky Thief",
  "ice-trap": "Ice Trap",
  "chaos-swap": "Chaos Swap",
  "lucky-key": "Lucky Key",
  "treasure-radar": "Treasure Radar",
  "golden-pick": "Golden Pick",
};

const BATTLE_ITEM_DESC: Record<BattleItemType, string> = {
  "magic-shield": "ป้องกันการโจมตีครั้งถัดไป 1 ครั้ง",
  "treasure-lock": "ล็อกกล่องสมบัติ ป้องกัน Bomb Gift",
  "recovery-potion": "คืน +50 TC ทันที (ไม่ใช้ช่องฉาก)",
  "mirror-shield": "สะท้อนการโจมตีกลับผู้โจมตี",
  "bomb-gift": "ระเบิด -60 TC จากเป้าหมาย",
  "sneaky-thief": "ขโมย 50 TC จากเป้าหมาย",
  "ice-trap": "แช่แข็งเป้าหมาย 5 วินาที",
  "chaos-swap": "สลับ TC กับเป้าหมาย",
  "lucky-key": "โอกาส 2× TC บนกล่องถัดไป",
  "treasure-radar": "เปิดเผย 3 กล่องข้างหน้า",
  "golden-pick": "+50 TC บนกล่องถัดไป (ไม่ใช้ช่องฉาก)",
};

const REACTION_EMOJI: Record<ReactionType, string> = {
  laugh: "😂",
  shock: "😱",
  fire: "🔥",
  clap: "👏",
  skull: "💀",
  heart: "❤️",
};

const REACTION_TYPES: ReactionType[] = ["laugh", "shock", "fire", "clap", "skull", "heart"];

const ACHIEVEMENT_LABEL: Record<AchievementResult["type"], string> = {
  "treasure-hunter": "🗺️ Treasure Hunter",
  "master-defender": "🛡️ Master Defender",
  "chaos-maker": "💣 Chaos Maker",
  "crown-collector": "👑 Crown Collector",
  "smart-banker": "🏦 Smart Banker",
};

const ACHIEVEMENT_DESC: Record<AchievementResult["type"], string> = {
  "treasure-hunter": "เปิดกล่องสมบัติมากที่สุด",
  "master-defender": "บล็อกโจมตีได้มากที่สุด",
  "chaos-maker": "ส่งโจมตีมากที่สุด",
  "crown-collector": "เก็บ Crown ได้มากที่สุด",
  "smart-banker": "ประสิทธิภาพการเก็บแต้มสูงสุด",
};

const AVATAR_COLORS = ["#e2685d", "#f29a4a", "#e0a21b", "#7cc36a", "#4aa3c7", "#b48ad8", "#d977a8", "#8a6a45"];
const TICK_MS = 500;

function avatarColor(uid: string): string {
  let sum = 0;
  for (let i = 0; i < uid.length; i++) sum += uid.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function useNow(intervalMs: number, isActive: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, isActive]);
  return nowMs;
}

export function TreasureRush({ board, members, user, isAdmin, onAdvancePhase }: TreasureRushProps) {
  const gameId = board.farmActiveGameId;
  return (
    <TreasureRound
      key={gameId ?? "none"}
      gameId={gameId}
      board={board}
      members={members}
      user={user}
      isAdmin={isAdmin}
      onAdvancePhase={onAdvancePhase}
    />
  );
}

function TreasureRound({
  gameId,
  board,
  members,
  user,
  isAdmin,
  onAdvancePhase,
}: TreasureRushProps & { gameId: string | null }) {
  const [game, setGame] = useState<TreasureGame | null | undefined>(gameId === null ? null : undefined);
  const [playerStates, setPlayerStates] = useState<TreasurePlayerState[]>([]);
  const [myChests, setMyChests] = useState<TreasureChest[] | null>(null);
  const [powerPoints, setPowerPoints] = useState<PowerPoints[]>([]);
  const [powerActions, setPowerActions] = useState<TreasurePowerAction[]>([]);
  const [durationSec, setDurationSec] = useState<60 | 90 | 120 | 180>(90);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<TreasurePowerActionType | null>(null);
  const [openedReveal, setOpenedReveal] = useState<{ index: number; emoji: string; pts: number } | null>(null);
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [attacks, setAttacks] = useState<AttackDocument[]>([]);
  const [battleFeed, setBattleFeed] = useState<BattleFeedEvent[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [shopOpen, setShopOpen] = useState(false);
  const [targetSelectItem, setTargetSelectItem] = useState<BattleItemType | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const floatIdRef = useRef(0);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToTreasureGame(board.id, gameId, setGame, () => setLoadError("โหลดข้อมูลรอบเกมไม่สำเร็จ"));
  }, [board.id, gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToTreasurePlayerStates(board.id, gameId, setPlayerStates, () =>
      setLoadError("โหลดข้อมูลผู้เล่นไม่สำเร็จ"),
    );
  }, [board.id, gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToMyChestBoard(board.id, gameId, user.uid, setMyChests, () =>
      setLoadError("โหลดกล่องสมบัติไม่สำเร็จ"),
    );
  }, [board.id, gameId, user.uid]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToFishingPowerPoints(board.id, gameId, setPowerPoints, () =>
      setLoadError("โหลด Power Points ไม่สำเร็จ"),
    );
  }, [board.id, gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToTreasurePowerActions(board.id, gameId, setPowerActions, () =>
      setLoadError("โหลด Power Actions ไม่สำเร็จ"),
    );
  }, [board.id, gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToInventory(board.id, gameId, user.uid, setInventory, () => {});
  }, [board.id, gameId, user.uid]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToAttacks(board.id, gameId, setAttacks, () => {});
  }, [board.id, gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToBattleFeed(board.id, gameId, setBattleFeed, () => {});
  }, [board.id, gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeToReactions(board.id, gameId, setReactions, () => {});
  }, [board.id, gameId]);

  const prevReactionCountRef = useRef(0);
  useEffect(() => {
    const newCount = reactions.length;
    if (newCount <= prevReactionCountRef.current) {
      prevReactionCountRef.current = newCount;
      return;
    }
    const newest = reactions.slice(prevReactionCountRef.current);
    prevReactionCountRef.current = newCount;
    for (const r of newest) {
      if (r.uid === user.uid) continue;
      const emoji = REACTION_EMOJI[r.type];
      const id = floatIdRef.current++;
      const x = 20 + Math.random() * 60;
      setFloatingReactions((prev) => [...prev.slice(-8), { id, emoji, x }]);
      setTimeout(() => setFloatingReactions((prev) => prev.filter((f) => f.id !== id)), 2000);
    }
  }, [reactions, user.uid]);

  const phase = game?.status ?? "idle";
  const nowMs = useNow(TICK_MS, phase === "playing");
  const endsAt = game?.endsAt ?? null;
  const timeLeftMs =
    phase === "playing" && endsAt ? Math.max(0, endsAt.getTime() - nowMs) : null;
  const isLive = timeLeftMs !== null && timeLeftMs > 0;

  if (loadError !== null || game === undefined) {
    return (
      <section className="tr-root" aria-label="Treasure Rush">
        <TreasureStyles />
        <p className={loadError === null ? "farm-hint" : "farm-warning"} role={loadError ? "alert" : undefined}>
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

  const ignoredUids = game?.ignoredUids ?? [];
  const winnerUid = game?.winnerUid ?? null;
  const hasHandedOver = phase === "finished" && winnerUid !== null && board.hostUid === winnerUid;
  const hostOfRound = hasHandedOver
    ? board.pastHostUids[board.pastHostUids.length - 1]
    : currentHostUid(board);
  const excludedUids = hasHandedOver
    ? [...new Set(board.pastHostUids)].sort()
    : excludedHostUids(board);

  const eligibilityOf = (uid: string): Eligibility => {
    if (uid === hostOfRound) return "current-host";
    if (excludedUids.includes(uid)) return "past-host";
    return ignoredUids.includes(uid) ? "ignored" : "included";
  };
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? "ไม่ทราบชื่อ";

  const myState = playerStates.find((s) => s.uid === user.uid);
  const myPP = powerPoints.find((pp) => pp.uid === user.uid);
  const myAction = powerActions.find((a) => a.uid === user.uid);

  const scored: ScoredTreasureParticipant[] = calcTreasureScores(
    members.map((m) => {
      const s = playerStates.find((ps) => ps.uid === m.uid);
      return (
        s ?? {
          uid: m.uid,
          openedCount: 0,
          currentRunPoints: 0,
          currentRunGem: 0,
          currentRunCoin: 0,
          currentRunCrown: 0,
          bankedPoints: 0,
          gemBanked: 0,
          coinBanked: 0,
          crownBanked: 0,
          bankCount: 0,
          trapHit: false,
          maxSingleReward: 0,
          score: 0,
          lastActionAt: null,
          updatedAt: null,
          tcSpentOnItems: 0,
          attacksSent: 0,
          attacksBlocked: 0,
          tcLostToAttacks: 0,
          frozenUntilMs: null,
        }
      );
    }),
    members,
    game?.activityModifier ?? null,
    phase === "settlement" || phase === "host_selection" || phase === "finished" ? powerActions : [],
  );

  const candidates = buildTreasureCandidates(members, ignoredUids, excludedUids);
  const resolvedState = game?.resolvedState ?? null;
  const wheelCandidates = resolvedState
    ? resolvedState.finalCandidateUids.map((uid) => ({ uid, name: nameOf(uid) }))
    : candidates;

  const reSpinGrantCount = resolvedState?.reSpinGrantCount ?? 0;
  const reSpinCount = game?.reSpinCount ?? 0;
  const reSpinsRemaining = Math.max(0, Math.min(reSpinGrantCount, TREASURE_MAX_RESPINS) - reSpinCount);

  async function handleStart() {
    await run(() => startTreasureRush(board.id, durationSec).then(() => {}));
  }

  async function handleSpinAndStart() {
    if (!game) return;
    const modifier = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)].id;
    const seed = Date.now();
    const boards = members.map((m, i) => ({
      uid: m.uid,
      chests: generateChestBoard(seed + i),
    }));
    await run(async () => {
      await writeChestBoards(board.id, game.id, boards);
      await spinTreasureWheel(board.id, game.id, modifier);
    });
  }

  async function handleEndGame() {
    if (!game) return;
    await run(() => endTreasureRush(board.id, game.id));
  }

  async function handleOpenChest(index: number) {
    if (!game || !myChests) return;
    const chest = myChests[index];
    if (!chest) return;
    await run(async () => {
      await openChest(board.id, game.id, user.uid, index);
      const pts = chest.basePoints;
      setOpenedReveal({ index, emoji: CHEST_EMOJI[chest.type] ?? "📦", pts });
      setTimeout(() => setOpenedReveal(null), 1800);
    });
  }

  async function handleBank() {
    if (!game) return;
    await run(() => bankTreasure(board.id, game.id, user.uid));
  }

  async function handleLockScores() {
    if (!game) return;
    await run(async () => {
      const ppMap = scored.map((p) => {
        const state = playerStates.find((s) => s.uid === p.uid);
        const earned = earnedPP(state?.bankedPoints ?? 0);
        const existing = powerPoints.find((pp) => pp.uid === p.uid);
        return {
          uid: p.uid,
          balance: (existing?.balance ?? 0) + earned,
          earned: (existing?.earned ?? 0) + earned,
        };
      });
      await lockPowerPoints(board.id, game.id, ppMap);
      const achievements = calcAchievements(playerStates, attacks);
      const resolved = resolveTreasureActions({
        actions: powerActions,
        allMemberUids: members.map((m) => m.uid),
        ignoredUids,
        hostExcludedUids: excludedUids,
      });
      await lockSettlement(board.id, game.id, achievements, scored.map((p) => ({ uid: p.uid, score: p.score })), {
        finalCandidateUids: resolved.finalCandidateUids,
        reSpinGrantCount: resolved.reSpinGrantCount,
      });
    });
  }

  async function handleBuyItem(itemType: BattleItemType) {
    if (!game) return;
    await run(() => buyBattleItem(board.id, game.id, user.uid, itemType));
  }

  async function handleUseOffensiveItem(targetUid: string) {
    if (!game || !targetSelectItem) return;
    const item = targetSelectItem;
    setTargetSelectItem(null);
    setShopOpen(false);
    await run(async () => {
      const attackId = await fireOffensiveItem(board.id, game.id, user.uid, targetUid, item);
      setTimeout(() => {
        resolveAttack(board.id, game.id, attackId).catch(() => {});
      }, ATTACK_WARNING_MS + 200);
    });
  }

  async function handleDefend(attackId: string, defenseItem: BattleItemType) {
    if (!game) return;
    await run(() => fireDefensiveItem(board.id, game.id, user.uid, attackId, defenseItem));
  }

  async function handleReaction(type: ReactionType) {
    if (!game) return;
    const emoji = REACTION_EMOJI[type];
    const id = floatIdRef.current++;
    const x = 20 + Math.random() * 60;
    setFloatingReactions((prev) => [...prev.slice(-8), { id, emoji, x }]);
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
    await sendReaction(board.id, game.id, user.uid, type).catch(() => {});
  }

  async function handleSubmitPowerAction() {
    if (!game || !selectedAction) return;
    await run(async () => {
      await submitTreasurePowerAction(board.id, game.id, user.uid, selectedAction);
      setSelectedAction(null);
    });
  }

  async function handleSpinWheel() {
    if (!game) return;
    const winner = pickWinnerUid(wheelCandidates);
    if (!winner) return;
    await run(() => spinTreasureHostWheel(board.id, game.id, winner));
  }

  async function handleReSpin() {
    if (!game) return;
    await run(() => reSpinTreasureHostWheel(board.id, game.id).then(() => {}));
  }

  async function handleHandOver() {
    await run(async () => {
      await handOverHost(board.id);
      onAdvancePhase?.();
    });
  }

  async function handleIgnoreToggle(uid: string) {
    if (!game) return;
    const next = ignoredUids.includes(uid)
      ? ignoredUids.filter((u) => u !== uid)
      : [...ignoredUids, uid];
    await run(() => setIgnoredUids(board.id, game.id, next));
  }

  const canEditIgnored = isAdmin && game !== null && (phase === "idle" || phase === "preparation");
  const modifierInfo = MODIFIERS.find((m) => m.id === game?.activityModifier);

  return (
    <section className="tr-root" aria-label="Treasure Rush">
      <TreasureStyles />

      {/* Header */}
      <div className="tr-header">
        <h2 className="tr-title">
          <span className="tr-title-icon">🏴‍☠️</span> Treasure Rush
        </h2>
        {modifierInfo && phase !== "idle" && (
          <div className="tr-modifier-badge" style={{ background: modifierInfo.color + "33", borderColor: modifierInfo.color }}>
            {modifierInfo.emoji} {modifierInfo.label}
          </div>
        )}
        {myPP && (
          <div className="tr-pp-badge">
            ⚡ {myPP.balance} PP
          </div>
        )}
      </div>

      {error && (
        <p className="farm-warning" role="alert">
          {error}
        </p>
      )}

      {/* ── IDLE / PREPARATION ────────────────────────── */}
      {(phase === "idle" || phase === "preparation" || game === null) && (
        <div className="tr-panel">
          <p className="farm-hint">ผู้ดูแลระบบจะเริ่มรอบเกมและหมุนวงล้อ Activity</p>

          {isAdmin && game === null && (
            <div className="tr-admin-setup">
              <label className="tr-label">ระยะเวลา</label>
              <div className="tr-duration-row">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    className={`tr-btn tr-btn-sm ${durationSec === d ? "tr-btn-active" : ""}`}
                    onClick={() => setDurationSec(d)}
                    disabled={isBusy}
                  >
                    {d}s
                  </button>
                ))}
              </div>
              <button className="tr-btn tr-btn-primary" onClick={handleStart} disabled={isBusy} data-testid="btn-create-game">
                🚀 สร้างรอบเกม
              </button>
            </div>
          )}

          {isAdmin && game !== null && (phase === "idle" || phase === "preparation") && (
            <div className="tr-admin-setup">
              <p className="farm-hint">กล่องสมบัติพร้อมแล้ว — กด Spin เพื่อเลือก Activity และเริ่มรอบ</p>
              <div className="tr-eligibility-list">
                {members.map((m) => {
                  const e = eligibilityOf(m.uid);
                  const mark = e === "included" ? "✅" : e === "ignored" ? "❌" : "🔒";
                  return (
                    <div key={m.uid} className="tr-eligibility-row">
                      <span className="tr-avatar" style={{ background: avatarColor(m.uid) }}>
                        {m.displayName.charAt(0).toUpperCase()}
                      </span>
                      <span className="tr-name">{m.displayName}</span>
                      <span className="tr-mark">{mark}</span>
                      {canEditIgnored && e !== "current-host" && e !== "past-host" && (
                        <button
                          className="tr-btn tr-btn-xs"
                          onClick={() => void handleIgnoreToggle(m.uid)}
                          disabled={isBusy}
                        >
                          {e === "ignored" ? "เพิ่ม" : "ข้าม"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button className="tr-btn tr-btn-primary" onClick={() => void handleSpinAndStart()} disabled={isBusy} data-testid="btn-spin-start">
                🎰 Spin Activity & เริ่มรอบ
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PLAYING ───────────────────────────────────── */}
      {phase === "playing" && (
        <div className="tr-panel">
          {/* Timer */}
          <div className="tr-timer-row">
            {timeLeftMs !== null && (
              <span className={`tr-timer ${timeLeftMs < 15_000 ? "tr-timer-warn" : ""}`}>
                ⏱ {formatClock(timeLeftMs)}
              </span>
            )}
            {!isLive && <span className="tr-hint">หมดเวลา!</span>}
          </div>

          {/* My stats */}
          {myState && (
            <div className="tr-my-stats">
              <div className="tr-stat-pill">
                <span className="tr-stat-label">กล่องที่เปิดแล้ว</span>
                <span className="tr-stat-value">{myState.openedCount}/12</span>
              </div>
              <div className="tr-stat-pill">
                <span className="tr-stat-label">แต้มรอบนี้</span>
                <span className="tr-stat-value">{myState.currentRunPoints}</span>
              </div>
              <div className="tr-stat-pill">
                <span className="tr-stat-label">แต้มธนาคาร</span>
                <span className="tr-stat-value tr-banked">{myState.bankedPoints}</span>
              </div>
            </div>
          )}

          {/* Chest grid */}
          {myChests ? (
            <div className="tr-chest-grid" role="grid" aria-label="กล่องสมบัติ">
              {myChests.map((chest, idx) => {
                const opened = (myState?.openedCount ?? 0) > idx;
                const isNext = (myState?.openedCount ?? 0) === idx && isLive;
                const reveal = openedReveal?.index === idx ? openedReveal : null;
                return (
                  <button
                    key={idx}
                    className={`tr-chest ${opened ? "tr-chest-opened" : ""} ${isNext ? "tr-chest-next" : ""}`}
                    onClick={() => void handleOpenChest(idx)}
                    disabled={!isNext || isBusy}
                    aria-label={opened ? `กล่อง ${idx + 1}: ${chest.type}` : `กล่อง ${idx + 1}`}
                  >
                    {opened ? (
                      <span className="tr-chest-reveal">{CHEST_EMOJI[chest.type] ?? "📦"}</span>
                    ) : reveal ? (
                      <span className="tr-chest-flash">{reveal.emoji}</span>
                    ) : (
                      <span className="tr-chest-closed">📦</span>
                    )}
                    {opened && (
                      <span className={`tr-chest-pts ${chest.basePoints < 0 ? "tr-pts-neg" : ""}`}>
                        {chest.basePoints > 0 ? "+" : ""}{chest.basePoints}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="farm-hint">กำลังโหลดกล่องสมบัติ…</p>
          )}

          {/* Player actions */}
          {isLive && myChests && (
            <div className="tr-action-row">
              <button
                className="tr-btn tr-btn-primary"
                onClick={() => void handleOpenChest(myState?.openedCount ?? 0)}
                disabled={isBusy || (myState?.openedCount ?? 0) >= 12}
                data-testid="btn-open-chest"
              >
                🔓 เปิดกล่อง
              </button>
              <button
                className="tr-btn tr-btn-bank"
                onClick={() => void handleBank()}
                disabled={isBusy || (myState?.currentRunPoints ?? 0) === 0}
                data-testid="btn-bank"
              >
                🏦 เก็บแต้ม ({myState?.currentRunPoints ?? 0})
              </button>
            </div>
          )}

          {/* Final Rush banner */}
          {endsAt && isFinalRush(endsAt.getTime(), nowMs) && (
            <FinalRushBanner
              endsAtMs={endsAt.getTime()}
              nowMs={nowMs}
              shutdownMs={FINAL_RUSH_ATTACK_SHUTDOWN_MS}
            />
          )}

          {/* Attack warnings for this player */}
          {attacks
            .filter((a) => a.targetUid === user.uid && a.status === "warning")
            .map((a) => (
              <AttackWarningCard
                key={a.id}
                attack={a}
                nowMs={nowMs}
                inventory={inventory}
                nameOf={nameOf}
                isBusy={isBusy}
                onDefend={handleDefend}
              />
            ))}

          {/* Target selector overlay */}
          {targetSelectItem && (
            <TargetSelector
              item={targetSelectItem}
              members={members}
              myUid={user.uid}
              nameOf={nameOf}
              isBusy={isBusy}
              onSelect={handleUseOffensiveItem}
              onCancel={() => setTargetSelectItem(null)}
            />
          )}

          {/* Inventory bar */}
          <InventoryBar
            inventory={inventory}
            isBusy={isBusy}
            frozenUntilMs={myState?.frozenUntilMs ?? null}
            nowMs={nowMs}
            onActivateOffensive={(itemType) => setTargetSelectItem(itemType)}
          />

          {/* Battle shop toggle */}
          <div className="tr-action-row">
            <button
              className={`tr-btn ${shopOpen ? "tr-btn-active" : "tr-btn-primary"}`}
              onClick={() => setShopOpen(!shopOpen)}
              disabled={isBusy}
              data-testid="btn-battle-shop"
            >
              🛒 Battle Shop
            </button>
          </div>

          {shopOpen && (
            <BattleShop
              currentRunPoints={myState?.currentRunPoints ?? 0}
              frozenUntilMs={myState?.frozenUntilMs ?? null}
              nowMs={nowMs}
              inventorySlots={inventory?.slots.length ?? 0}
              isBusy={isBusy}
              onBuy={handleBuyItem}
              onSelectOffensive={(itemType) => { setTargetSelectItem(itemType); setShopOpen(false); }}
            />
          )}

          {/* Battle feed */}
          <BattleFeedPanel events={battleFeed} nameOf={nameOf} />

          {/* Reactions bar */}
          <ReactionsBar floatingReactions={floatingReactions} onReact={handleReaction} />

          {/* Admin end-game */}
          {isAdmin && (
            <div className="tr-admin-row">
              <button className="tr-btn tr-btn-danger" onClick={() => void handleEndGame()} disabled={isBusy} data-testid="btn-end-game">
                ⏹ จบรอบ
              </button>
            </div>
          )}

          {/* Leaderboard */}
          <Leaderboard scored={scored} myUid={user.uid} phase={phase} nameOf={nameOf} />
        </div>
      )}

      {/* ── SETTLEMENT ───────────────────────────────────── */}
      {phase === "settlement" && (
        <div className="tr-panel">
          <h3 className="tr-section-title">📊 ผลคะแนนรอบนี้</h3>
          <Leaderboard scored={scored} myUid={user.uid} phase={phase} nameOf={nameOf} />

          {/* Power Shop for players */}
          {!myAction && (
            <div className="tr-shop">
              <h4 className="tr-shop-title">🏪 Power Shop</h4>
              <p className="tr-shop-pp">⚡ คุณมี {myPP?.balance ?? 0} PP</p>
              <div className="tr-shop-grid">
                {POWER_ACTION_ORDER.map((type) => {
                  const cost = TREASURE_POWER_ACTION_COSTS[type];
                  const canAfford = (myPP?.balance ?? 0) >= cost;
                  return (
                    <button
                      key={type}
                      className={`tr-shop-item ${selectedAction === type ? "tr-shop-selected" : ""} ${!canAfford ? "tr-shop-disabled" : ""}`}
                      onClick={() => setSelectedAction(selectedAction === type ? null : type)}
                      disabled={!canAfford || isBusy}
                    >
                      <span className="tr-shop-icon">{ACTION_ICON[type]}</span>
                      <span className="tr-shop-name">{ACTION_LABEL[type]}</span>
                      <span className="tr-shop-cost">{cost} PP</span>
                      <span className="tr-shop-desc">{ACTION_DESC[type]}</span>
                    </button>
                  );
                })}
              </div>
              {selectedAction && (
                <button
                  className="tr-btn tr-btn-primary"
                  onClick={() => void handleSubmitPowerAction()}
                  disabled={isBusy}
                >
                  ✅ ยืนยันใช้ {ACTION_LABEL[selectedAction]} ({TREASURE_POWER_ACTION_COSTS[selectedAction]} PP)
                </button>
              )}
            </div>
          )}
          {myAction && (
            <p className="tr-confirmed">✅ คุณใช้ {ACTION_LABEL[myAction.type]} แล้ว ({myAction.cost} PP)</p>
          )}

          {/* Admin lock */}
          {isAdmin && (
            <div className="tr-admin-row">
              <p className="farm-hint">ตรวจสอบให้ทุกคนซื้อ Ability ครบแล้วก่อนกด Lock</p>
              <button className="tr-btn tr-btn-primary" onClick={() => void handleLockScores()} disabled={isBusy}>
                🔒 Lock Scores &amp; ไปวงล้อ
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── HOST SELECTION ─────────────────────────────── */}
      {(phase === "host_selection" || phase === "finished") && (
        <div className="tr-panel">
          <h3 className="tr-section-title">🎡 เลือก Host คนถัดไป</h3>
          {game?.achievements && game.achievements.length > 0 && (
            <AchievementsPanel achievements={game.achievements} nameOf={nameOf} />
          )}
          <Leaderboard scored={scored} myUid={user.uid} phase={phase} nameOf={nameOf} />
          {wheelCandidates.length > 0 ? (
            <HostWheel
              key={`${game?.id ?? "none"}:${phase === "host_selection" ? reSpinCount : (game?.resolvedAt?.getTime() ?? "none")}`}
              candidates={phase === "host_selection" ? wheelCandidates : candidates}
              winnerUid={phase === "finished" ? winnerUid : null}
              spunAt={phase === "finished" ? (game?.resolvedAt ?? null) : null}
              canSpin={isAdmin && phase === "host_selection" && !isBusy}
              hint={reSpinsRemaining > 0 ? `หมุนใหม่ได้อีก ${reSpinsRemaining} ครั้ง` : null}
              onSpin={phase === "host_selection" ? handleSpinWheel : () => {}}
            />
          ) : (
            <p className="farm-warning">ไม่มีผู้เล่นที่มีสิทธิ์ในวงล้อ</p>
          )}

          {phase === "finished" && winnerUid && (
            <div className="tr-winner-banner">
              <span className="tr-winner-crown">👑</span>
              <span className="tr-winner-name">{nameOf(winnerUid)}</span>
              <span className="tr-winner-label">คือ Next Host!</span>
              {isAdmin && (
                <div className="tr-admin-row">
                  {!hasHandedOver ? (
                    <button
                      className="tr-btn tr-btn-primary"
                      onClick={() => void handleHandOver()}
                      disabled={isBusy}
                      data-testid="btn-handover-host"
                    >
                      🤝 มอบตำแหน่ง Host
                    </button>
                  ) : (
                    <button
                      className="tr-btn tr-btn-primary"
                      onClick={() => onAdvancePhase?.()}
                      disabled={isBusy}
                    >
                      ➡️ ขั้นตอนถัดไป
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FinalRushBanner({ endsAtMs, nowMs, shutdownMs }: { endsAtMs: number; nowMs: number; shutdownMs: number }) {
  const timeLeft = endsAtMs - nowMs;
  const isShutdown = timeLeft <= shutdownMs;
  return (
    <div className={`tr-final-rush ${isShutdown ? "tr-final-rush-shutdown" : ""}`} role="alert" data-testid="final-rush-banner">
      <span className="tr-final-rush-icon">⚡</span>
      <span className="tr-final-rush-label">FINAL RUSH — 2× TC</span>
      {isShutdown && <span className="tr-final-rush-lock">🔒 ล็อกโจมตี</span>}
    </div>
  );
}

function AttackWarningCard({
  attack,
  nowMs,
  inventory,
  nameOf,
  isBusy,
  onDefend,
}: {
  attack: AttackDocument;
  nowMs: number;
  inventory: InventoryState | null;
  nameOf: (uid: string) => string;
  isBusy: boolean;
  onDefend: (attackId: string, item: BattleItemType) => void;
}) {
  const warningLeft = attack.createdAt ? Math.max(0, attack.createdAt.getTime() + ATTACK_WARNING_MS - nowMs) : 0;
  const defenseItems = (inventory?.slots ?? []).filter((s) =>
    s.itemType === "magic-shield" || s.itemType === "treasure-lock" || s.itemType === "mirror-shield"
  );
  return (
    <div className="tr-attack-warning" role="alert">
      <div className="tr-attack-warning-header">
        <span className="tr-attack-warning-icon">⚠️</span>
        <span className="tr-attack-warning-text">
          {nameOf(attack.attackerUid)} ส่ง {BATTLE_ITEM_EMOJI[attack.itemType]} {BATTLE_ITEM_LABEL[attack.itemType]}!
        </span>
        <span className="tr-attack-warning-countdown">{(warningLeft / 1000).toFixed(1)}s</span>
      </div>
      {defenseItems.length > 0 && (
        <div className="tr-attack-defense-row">
          {defenseItems.map((slot, i) => (
            <button
              key={i}
              className="tr-btn tr-btn-xs tr-btn-defend"
              onClick={() => onDefend(attack.id, slot.itemType)}
              disabled={isBusy}
            >
              {BATTLE_ITEM_EMOJI[slot.itemType]} {BATTLE_ITEM_LABEL[slot.itemType]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InventoryBar({
  inventory,
  isBusy,
  frozenUntilMs,
  nowMs,
  onActivateOffensive,
}: {
  inventory: InventoryState | null;
  isBusy: boolean;
  frozenUntilMs: number | null;
  nowMs: number;
  onActivateOffensive: (item: BattleItemType) => void;
}) {
  const slots = inventory?.slots ?? [];
  const isFrozen = frozenUntilMs !== null && frozenUntilMs > nowMs;
  return (
    <div className="tr-inventory" data-testid="inventory-bar">
      <span className="tr-inventory-label">🎒 ฉาก ({slots.length}/3)</span>
      {isFrozen && <span className="tr-frozen-badge">🧊 แช่แข็ง</span>}
      <div className="tr-inventory-slots">
        {[0, 1, 2].map((i) => {
          const slot = slots[i];
          const isOffensive = slot ? BATTLE_ITEM_CATEGORIES[slot.itemType] === "offensive" : false;
          return (
            <div key={i} className={`tr-inv-slot ${slot ? "tr-inv-slot-filled" : "tr-inv-slot-empty"}`}>
              {slot ? (
                <>
                  <span className="tr-inv-emoji">{BATTLE_ITEM_EMOJI[slot.itemType]}</span>
                  <span className="tr-inv-name">{BATTLE_ITEM_LABEL[slot.itemType]}</span>
                  {isOffensive && (
                    <button
                      className="tr-btn tr-btn-xs tr-btn-use"
                      onClick={() => onActivateOffensive(slot.itemType)}
                      disabled={isBusy || isFrozen}
                    >
                      ใช้
                    </button>
                  )}
                </>
              ) : (
                <span className="tr-inv-empty">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TargetSelector({
  item,
  members,
  myUid,
  nameOf,
  isBusy,
  onSelect,
  onCancel,
}: {
  item: BattleItemType;
  members: { uid: string }[];
  myUid: string;
  nameOf: (uid: string) => string;
  isBusy: boolean;
  onSelect: (uid: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="tr-target-overlay" role="dialog" aria-label="เลือกเป้าหมาย">
      <div className="tr-target-header">
        <span>{BATTLE_ITEM_EMOJI[item]} {BATTLE_ITEM_LABEL[item]} — เลือกเป้าหมาย</span>
        <button className="tr-btn tr-btn-xs" onClick={onCancel} disabled={isBusy}>✕</button>
      </div>
      <div className="tr-target-list">
        {members
          .filter((m) => m.uid !== myUid)
          .map((m) => (
            <button
              key={m.uid}
              className="tr-btn tr-btn-target"
              onClick={() => onSelect(m.uid)}
              disabled={isBusy}
            >
              {nameOf(m.uid)}
            </button>
          ))}
      </div>
    </div>
  );
}

function BattleShop({
  currentRunPoints,
  frozenUntilMs,
  nowMs,
  inventorySlots,
  isBusy,
  onBuy,
  onSelectOffensive,
}: {
  currentRunPoints: number;
  frozenUntilMs: number | null;
  nowMs: number;
  inventorySlots: number;
  isBusy: boolean;
  onBuy: (item: BattleItemType) => void;
  onSelectOffensive: (item: BattleItemType) => void;
}) {
  const isFrozen = frozenUntilMs !== null && frozenUntilMs > nowMs;
  const categories: BattleItemType[][] = [
    ["magic-shield", "treasure-lock", "recovery-potion", "mirror-shield"],
    ["bomb-gift", "sneaky-thief", "ice-trap", "chaos-swap"],
    ["lucky-key", "treasure-radar", "golden-pick"],
  ];
  const catLabels = ["🛡️ Defensive", "⚔️ Offensive", "🍀 Lucky"];
  const isInstant = (item: BattleItemType) => item === "recovery-potion" || item === "golden-pick";
  return (
    <div className="tr-shop" data-testid="battle-shop">
      <div className="tr-shop-tc-row">
        <span className="tr-shop-tc">💰 TC: {currentRunPoints}</span>
        {isFrozen && <span className="tr-frozen-badge">🧊 แช่แข็ง</span>}
      </div>
      {categories.map((items, ci) => (
        <div key={ci} className="tr-shop-category">
          <div className="tr-shop-cat-label">{catLabels[ci]}</div>
          <div className="tr-shop-grid">
            {items.map((item) => {
              const cost = BATTLE_ITEM_COSTS[item];
              const canAfford = currentRunPoints >= cost;
              const slotFull = !isInstant(item) && inventorySlots >= 3;
              const disabled = isBusy || isFrozen || !canAfford || slotFull;
              const isOff = BATTLE_ITEM_CATEGORIES[item] === "offensive";
              return (
                <button
                  key={item}
                  className={`tr-shop-item ${!canAfford || slotFull ? "tr-shop-disabled" : ""}`}
                  onClick={() => isOff ? onSelectOffensive(item) : onBuy(item)}
                  disabled={disabled}
                  title={BATTLE_ITEM_DESC[item]}
                >
                  <span className="tr-shop-icon">{BATTLE_ITEM_EMOJI[item]}</span>
                  <span className="tr-shop-name">{BATTLE_ITEM_LABEL[item]}</span>
                  <span className="tr-shop-cost">{cost} TC</span>
                  {isInstant(item) && <span className="tr-shop-instant">⚡ทันที</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BattleFeedPanel({ events, nameOf }: { events: BattleFeedEvent[]; nameOf: (uid: string) => string }) {
  const sorted = [...events].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 10);
  if (sorted.length === 0) return null;
  function eventText(e: BattleFeedEvent): string {
    const actor = nameOf(e.actorUid);
    const target = e.targetUid ? nameOf(e.targetUid) : null;
    const item = e.itemType ? `${BATTLE_ITEM_EMOJI[e.itemType]} ${BATTLE_ITEM_LABEL[e.itemType]}` : "";
    switch (e.type) {
      case "item-bought": return `${actor} ซื้อ ${item}`;
      case "attack-sent": return `${actor} ส่ง ${item} ไปยัง ${target}`;
      case "attack-resolved": return `${item} ถูก ${target}: ${(e.tcDelta ?? 0) < 0 ? e.tcDelta : `+${e.tcDelta}`} TC`;
      case "attack-blocked": return `${target} บล็อก ${item} ของ ${actor}`;
      case "attack-reflected": return `${target} สะท้อน ${item} กลับ ${actor}`;
      case "bank": return `${actor} เก็บแต้ม ${(e.tcDelta ?? 0) > 0 ? `+${e.tcDelta}` : e.tcDelta} TC`;
      case "chest-opened": return `${actor} เปิดกล่อง ${(e.tcDelta ?? 0) > 0 ? `+${e.tcDelta}` : e.tcDelta} TC`;
      case "final-rush": return "⚡ FINAL RUSH เริ่มแล้ว — 2× TC";
      case "achievement": return `🏆 ${actor} ได้ Achievement`;
      default: return `${actor} ${e.type}`;
    }
  }
  return (
    <div className="tr-feed" data-testid="battle-feed">
      <div className="tr-feed-title">📋 Battle Feed</div>
      <ul className="tr-feed-list">
        {sorted.map((e) => (
          <li key={e.id} className="tr-feed-item">{eventText(e)}</li>
        ))}
      </ul>
    </div>
  );
}

function ReactionsBar({
  floatingReactions,
  onReact,
}: {
  floatingReactions: { id: number; emoji: string; x: number }[];
  onReact: (type: ReactionType) => void;
}) {
  return (
    <div className="tr-reactions" data-testid="reactions-bar">
      <div className="tr-reaction-floats" aria-hidden>
        {floatingReactions.map((r) => (
          <span key={r.id} className="tr-float-emoji" style={{ left: `${r.x}%` }}>{r.emoji}</span>
        ))}
      </div>
      <div className="tr-reaction-btns">
        {REACTION_TYPES.map((type) => (
          <button key={type} className="tr-reaction-btn" onClick={() => onReact(type)} aria-label={type}>
            {REACTION_EMOJI[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

function AchievementsPanel({ achievements, nameOf }: { achievements: AchievementResult[]; nameOf: (uid: string) => string }) {
  return (
    <div className="tr-achievements">
      <div className="tr-ach-title">🏆 Achievements</div>
      <div className="tr-ach-list">
        {achievements.map((a) => (
          <div key={a.type} className="tr-ach-row">
            <span className="tr-ach-label">{ACHIEVEMENT_LABEL[a.type]}</span>
            <span className="tr-ach-desc">{ACHIEVEMENT_DESC[a.type]}</span>
            <span className="tr-ach-winner">{nameOf(a.winnerUid)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({
  scored,
  myUid,
  phase,
  nameOf,
}: {
  scored: ScoredTreasureParticipant[];
  myUid: string;
  phase: string;
  nameOf: (uid: string) => string;
}) {
  return (
    <div className="tr-leaderboard" data-testid="leaderboard">
      <h4 className="tr-lb-title">🏆 ตารางคะแนน</h4>
      <ol className="tr-lb-list">
        {scored.map((p) => (
          <li key={p.uid} className={`tr-lb-row ${p.uid === myUid ? "tr-lb-me" : ""}`}>
            <span className="tr-lb-rank">#{p.rank}</span>
            <span className="tr-lb-avatar" style={{ background: avatarColor(p.uid) }}>
              {nameOf(p.uid).charAt(0).toUpperCase()}
            </span>
            <span className="tr-lb-name">{nameOf(p.uid)}</span>
            <span className="tr-lb-score">{phase === "settlement" || phase === "host_selection" || phase === "finished" ? p.score : (scored.find(s => s.uid === p.uid)?.score ?? 0)} แต้ม</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TreasureStyles() {
  return (
    <style>{`
      .tr-root {
        font-family: 'Press Start 2P', 'Courier New', monospace;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        min-height: 100%;
        background: var(--tr-bg, #1a1a2e);
        color: var(--tr-fg, #e8e8e8);
        image-rendering: pixelated;
      }
      .tr-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .tr-title {
        font-size: 1rem;
        margin: 0;
        color: #f7dc6f;
        text-shadow: 2px 2px 0 #b8860b;
      }
      .tr-title-icon { font-size: 1.25rem; }
      .tr-modifier-badge {
        font-size: 0.6rem;
        padding: 0.25rem 0.5rem;
        border: 2px solid;
        border-radius: 4px;
      }
      .tr-pp-badge {
        margin-left: auto;
        font-size: 0.65rem;
        padding: 0.25rem 0.5rem;
        background: #2d2d4e;
        border: 2px solid #7cc36a;
        border-radius: 4px;
        color: #7cc36a;
      }
      .tr-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .tr-section-title {
        font-size: 0.75rem;
        margin: 0;
        color: #f29a4a;
      }
      .tr-admin-setup {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        background: #16213e;
        padding: 1rem;
        border: 2px solid #4a4a7a;
        border-radius: 4px;
      }
      .tr-label { font-size: 0.6rem; color: #aaa; }
      .tr-duration-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .tr-btn {
        font-family: inherit;
        font-size: 0.6rem;
        padding: 0.5rem 1rem;
        border: 2px solid currentColor;
        border-radius: 4px;
        cursor: pointer;
        background: transparent;
        color: #e8e8e8;
        transition: background 0.1s, transform 0.1s;
        image-rendering: pixelated;
      }
      .tr-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
      .tr-btn:active:not(:disabled) { transform: scale(0.97); }
      .tr-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .tr-btn-sm { padding: 0.3rem 0.6rem; }
      .tr-btn-xs { padding: 0.2rem 0.4rem; font-size: 0.5rem; }
      .tr-btn-active { background: #4a4a7a; border-color: #b48ad8; color: #b48ad8; }
      .tr-btn-primary { border-color: #7cc36a; color: #7cc36a; }
      .tr-btn-primary:hover:not(:disabled) { background: rgba(124,195,106,0.15); }
      .tr-btn-bank { border-color: #f7dc6f; color: #f7dc6f; }
      .tr-btn-bank:hover:not(:disabled) { background: rgba(247,220,111,0.15); }
      .tr-btn-danger { border-color: #e2685d; color: #e2685d; }
      .tr-btn-danger:hover:not(:disabled) { background: rgba(226,104,93,0.15); }
      .tr-eligibility-list { display: flex; flex-direction: column; gap: 0.4rem; }
      .tr-eligibility-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.5rem;
        background: #0f0f1a;
        border-radius: 3px;
      }
      .tr-avatar {
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.6rem;
        font-weight: bold;
        flex-shrink: 0;
      }
      .tr-name { flex: 1; font-size: 0.6rem; }
      .tr-mark { font-size: 0.75rem; }
      .tr-timer-row { display: flex; align-items: center; gap: 0.75rem; }
      .tr-timer { font-size: 1.25rem; color: #7cc36a; }
      .tr-timer-warn { color: #e2685d; animation: tr-blink 0.6s step-end infinite; }
      @keyframes tr-blink { 50% { opacity: 0.3; } }
      .tr-hint { font-size: 0.6rem; color: #aaa; }
      .tr-my-stats {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .tr-stat-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.4rem 0.75rem;
        background: #16213e;
        border: 2px solid #4a4a7a;
        border-radius: 4px;
        min-width: 70px;
      }
      .tr-stat-label { font-size: 0.45rem; color: #aaa; }
      .tr-stat-value { font-size: 0.85rem; color: #f7dc6f; }
      .tr-banked { color: #7cc36a; }
      .tr-chest-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
      }
      .tr-chest {
        font-family: inherit;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.1rem;
        border: 2px solid #4a4a7a;
        border-radius: 4px;
        cursor: pointer;
        background: #16213e;
        transition: border-color 0.15s, background 0.15s;
        font-size: 1.25rem;
        padding: 0.25rem;
        position: relative;
        overflow: hidden;
      }
      .tr-chest-next {
        border-color: #f7dc6f;
        box-shadow: 0 0 8px #f7dc6f88;
        animation: tr-pulse 1s ease-in-out infinite;
      }
      @keyframes tr-pulse { 0%,100% { box-shadow: 0 0 6px #f7dc6f88; } 50% { box-shadow: 0 0 14px #f7dc6fcc; } }
      .tr-chest-opened { background: #0f0f1a; border-color: #2d2d4e; }
      .tr-chest-reveal { font-size: 1.4rem; }
      .tr-chest-flash {
        font-size: 1.4rem;
        animation: tr-pop 0.3s ease-out;
      }
      @keyframes tr-pop { from { transform: scale(0.5); opacity: 0.5; } to { transform: scale(1); opacity: 1; } }
      .tr-chest-closed { font-size: 1.25rem; opacity: 0.6; }
      .tr-chest-pts {
        font-size: 0.45rem;
        color: #7cc36a;
      }
      .tr-pts-neg { color: #e2685d; }
      .tr-action-row {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .tr-admin-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #4a4a7a;
      }
      .tr-leaderboard {
        background: #16213e;
        border: 2px solid #4a4a7a;
        border-radius: 4px;
        padding: 0.75rem;
      }
      .tr-lb-title { font-size: 0.6rem; margin: 0 0 0.5rem; color: #f29a4a; }
      .tr-lb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
      .tr-lb-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.5rem;
        border-radius: 3px;
        font-size: 0.55rem;
      }
      .tr-lb-me { background: #2d2d1e; border: 1px solid #f7dc6f44; }
      .tr-lb-rank { width: 1.5rem; color: #aaa; }
      .tr-lb-avatar {
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.5rem;
        font-weight: bold;
        flex-shrink: 0;
      }
      .tr-lb-name { flex: 1; }
      .tr-lb-score { color: #f7dc6f; }
      .tr-shop {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        background: #16213e;
        border: 2px solid #b48ad8;
        border-radius: 4px;
        padding: 0.75rem;
      }
      .tr-shop-title { font-size: 0.65rem; margin: 0; color: #b48ad8; }
      .tr-shop-pp { font-size: 0.55rem; color: #7cc36a; margin: 0; }
      .tr-shop-grid { display: flex; flex-direction: column; gap: 0.4rem; }
      .tr-shop-item {
        font-family: inherit;
        display: grid;
        grid-template-columns: 1.5rem 1fr auto;
        grid-template-rows: auto auto;
        gap: 0.1rem 0.4rem;
        padding: 0.5rem;
        border: 2px solid #4a4a7a;
        border-radius: 3px;
        cursor: pointer;
        background: #0f0f1a;
        text-align: left;
        transition: border-color 0.1s, background 0.1s;
      }
      .tr-shop-item:hover:not(:disabled) { border-color: #b48ad8; background: #1a1a2e; }
      .tr-shop-selected { border-color: #7cc36a; background: #0f1a0f; }
      .tr-shop-disabled { opacity: 0.35; cursor: not-allowed; }
      .tr-shop-icon { grid-row: 1/3; align-self: center; font-size: 1rem; }
      .tr-shop-name { font-size: 0.55rem; color: #e8e8e8; }
      .tr-shop-cost { font-size: 0.55rem; color: #f29a4a; }
      .tr-shop-desc { grid-column: 2/4; font-size: 0.45rem; color: #aaa; }
      .tr-confirmed { font-size: 0.55rem; color: #7cc36a; padding: 0.5rem; background: #0f1a0f; border-radius: 3px; }
      .tr-winner-banner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1.5rem;
        background: #2d1a0f;
        border: 2px solid #f7dc6f;
        border-radius: 4px;
        text-align: center;
      }
      .tr-winner-crown { font-size: 2rem; }
      .tr-winner-name { font-size: 0.85rem; color: #f7dc6f; }
      .tr-winner-label { font-size: 0.6rem; color: #f29a4a; }
      .farm-hint { font-size: 0.6rem; color: #888; margin: 0; }
      .farm-warning { font-size: 0.6rem; color: #e2685d; margin: 0; padding: 0.5rem; background: #2d0f0f; border-radius: 3px; }
      /* ── Chaos Battle ───────────────────────────── */
      .tr-final-rush {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.5rem 0.75rem; border-radius: 4px;
        background: #2d1a00; border: 2px solid #f29a4a;
        animation: tr-blink 0.8s step-end infinite;
        font-size: 0.65rem; color: #f29a4a;
      }
      .tr-final-rush-shutdown { border-color: #e2685d; color: #e2685d; }
      .tr-final-rush-icon { font-size: 1rem; }
      .tr-final-rush-label { flex: 1; }
      .tr-final-rush-lock { font-size: 0.55rem; }
      .tr-attack-warning {
        padding: 0.75rem; border-radius: 4px;
        background: #2d0f0f; border: 2px solid #e2685d;
        display: flex; flex-direction: column; gap: 0.5rem;
      }
      .tr-attack-warning-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.6rem; }
      .tr-attack-warning-icon { font-size: 1rem; }
      .tr-attack-warning-text { flex: 1; }
      .tr-attack-warning-countdown { color: #e2685d; font-size: 0.75rem; min-width: 2.5rem; text-align: right; }
      .tr-attack-defense-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .tr-btn-defend { border-color: #7cc36a; color: #7cc36a; }
      .tr-inventory {
        display: flex; flex-direction: column; gap: 0.4rem;
        padding: 0.5rem; background: #16213e; border: 2px solid #4a4a7a; border-radius: 4px;
      }
      .tr-inventory-label { font-size: 0.55rem; color: #aaa; }
      .tr-frozen-badge { font-size: 0.55rem; color: #4aa3c7; padding: 0.1rem 0.3rem; background: #0f1a2d; border-radius: 3px; }
      .tr-inventory-slots { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .tr-inv-slot {
        flex: 1; min-width: 5rem; padding: 0.4rem; border-radius: 3px;
        display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
        font-size: 0.5rem; border: 2px solid #4a4a7a;
      }
      .tr-inv-slot-filled { border-color: #b48ad8; background: #1a1a2e; }
      .tr-inv-slot-empty { opacity: 0.4; }
      .tr-inv-emoji { font-size: 1rem; }
      .tr-inv-name { font-size: 0.45rem; text-align: center; }
      .tr-inv-empty { font-size: 0.75rem; }
      .tr-btn-use { border-color: #e0a21b; color: #e0a21b; }
      .tr-target-overlay {
        position: relative; padding: 0.75rem;
        background: #0f0f1a; border: 2px solid #b48ad8; border-radius: 4px;
        display: flex; flex-direction: column; gap: 0.5rem;
      }
      .tr-target-header { display: flex; align-items: center; justify-content: space-between; font-size: 0.6rem; color: #b48ad8; }
      .tr-target-list { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .tr-btn-target { border-color: #d977a8; color: #d977a8; padding: 0.4rem 0.75rem; }
      .tr-shop-tc-row { display: flex; align-items: center; gap: 0.5rem; }
      .tr-shop-tc { font-size: 0.65rem; color: #f29a4a; }
      .tr-shop-category { display: flex; flex-direction: column; gap: 0.3rem; }
      .tr-shop-cat-label { font-size: 0.55rem; color: #aaa; padding: 0.2rem 0; border-bottom: 1px solid #2a2a4a; }
      .tr-shop-instant { font-size: 0.45rem; color: #7cc36a; }
      .tr-feed {
        padding: 0.5rem; background: #0f0f1a; border: 2px solid #2a2a4a; border-radius: 4px;
        max-height: 8rem; overflow: hidden;
      }
      .tr-feed-title { font-size: 0.55rem; color: #aaa; margin-bottom: 0.3rem; }
      .tr-feed-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; }
      .tr-feed-item { font-size: 0.5rem; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tr-reactions {
        position: relative; padding: 0.4rem 0;
        display: flex; flex-direction: column; gap: 0.3rem;
      }
      .tr-reaction-floats {
        position: absolute; top: -3rem; left: 0; right: 0; height: 3rem;
        pointer-events: none; overflow: hidden;
      }
      .tr-float-emoji {
        position: absolute; bottom: 0; font-size: 1.5rem;
        animation: tr-float-up 2s ease-out forwards;
      }
      @keyframes tr-float-up {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-3rem); }
      }
      .tr-reaction-btns { display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap; }
      .tr-reaction-btn {
        font-size: 1.25rem; background: none; border: 2px solid #2a2a4a; border-radius: 50%;
        width: 2.5rem; height: 2.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: border-color 0.1s, transform 0.1s;
      }
      .tr-reaction-btn:hover { border-color: #b48ad8; transform: scale(1.15); }
      .tr-reaction-btn:active { transform: scale(0.9); }
      .tr-achievements {
        padding: 0.75rem; background: #1a1a0f; border: 2px solid #f7dc6f; border-radius: 4px;
        display: flex; flex-direction: column; gap: 0.5rem;
      }
      .tr-ach-title { font-size: 0.65rem; color: #f7dc6f; }
      .tr-ach-list { display: flex; flex-direction: column; gap: 0.3rem; }
      .tr-ach-row {
        display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem;
        align-items: center; padding: 0.3rem; background: #0f0f0f; border-radius: 3px;
      }
      .tr-ach-label { font-size: 0.55rem; color: #e0a21b; }
      .tr-ach-desc { font-size: 0.45rem; color: #888; }
      .tr-ach-winner { font-size: 0.55rem; color: #7cc36a; }
      @media (max-width: 480px) {
        .tr-chest-grid { grid-template-columns: repeat(3, 1fr); }
        .tr-title { font-size: 0.75rem; }
        .tr-inventory-slots { flex-direction: column; }
        .tr-reaction-btns { gap: 0.3rem; }
      }
    `}</style>
  );
}
