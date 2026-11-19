"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Roulette, type RouletteButtonProps, type RouletteController } from "@jdevs/react-roulette";
import { CHAOS_ITEM_BY_ID, CHAOS_ITEMS, type ChaosItem, type ChaosItemId } from "@/lib/chaos/catalog";
import { CHAOS_ADMIN_EMAIL } from "@/lib/chaos/access";
import { CHAOS_UI, formatChaosHistory, localizeChaosError, phaseLabel, turnLabel } from "@/lib/chaos/locale";
import type { ChaosEventId, ChaosGameState } from "@/lib/chaos/state";
import { getChaosItemTargetOptions, type ChaosActivation } from "@/lib/chaos/effects";
import { runChaosAction, subscribeChaosGame } from "@/lib/chaos/client";
import { handOverHost } from "@/lib/firebase/farm";
import { isMockMode } from "@/lib/mock";
import { PixelItemIcon } from "@/components/chaos/PixelItemIcon";
import type { Board, BoardMember } from "@/lib/firebase/types";

type Props = { board: Board; members: BoardMember[]; user: User; isAdmin: boolean; onAdvancePhase?: () => void };
type Tab = "wheel" | "shop" | "players" | "history";
type ItemTarget = Pick<ChaosActivation, "targetUid" | "targetItemId" | "offeredItemId">;
type ActivationOptions = Omit<ChaosActivation, "predeterminedEventId">;

function ChaosSpinButton({ isSpinning, className, ...buttonProps }: RouletteButtonProps) {
  return <button {...buttonProps} className={className} aria-label={isSpinning ? "กำลังหมุนวงล้อ" : "หมุนวงล้อ"}>{isSpinning ? "กำลังหมุน…" : "หมุนวงล้อ"}</button>;
}

const EVENT_IDS: readonly ChaosEventId[] = ["cursed", "frozen", "reverse", "targeted", "safe", "fortune", "double-trouble", "royal-favor"];
const EVENT_MARKS: Record<ChaosEventId, string> = {
  cursed: "คำ", frozen: "แช่", reverse: "ย้อน", targeted: "เป้า", safe: "รอด", fortune: "โชค", "double-trouble": "คูณ", "royal-favor": "พร",
};

function canActivate(item: ChaosItem, game: ChaosGameState, uid: string, now: number): boolean {
  if (item.window === "shopping") return game.phase === "shopping";
  if (game.phase !== "chaos_rounds") return false;
  if ((game.turnPhase === "reaction_window" || game.pendingAction !== null) && now >= (game.reactionDeadlineMs ?? 0)) return false;
  if (item.id === "holy-shield" && (game.selectedUid !== uid || !["cursed", "frozen", "targeted"].includes(game.eventId ?? ""))) return false;
  if (item.id === "iron-will") return game.turnPhase === "ready" || game.turnPhase === "turn_complete" || game.turnPhase === "reaction_window";
  if (item.window === "automatic") return false;
  if (item.window === "reaction") return game.turnPhase === "reaction_window" || game.pendingAction !== null;
  if (item.window === "between-turns") return game.turnPhase === "turn_complete";
  if (item.window === "before-player-spin") return game.turnPhase === "ready";
  if (item.window === "after-player-spin" || item.window === "before-event-spin") return game.turnPhase === "player_spin";
  return false;
}

function privateMessage(value: unknown, nameOf: (uid: string) => string): string {
  if (Array.isArray(value) && value.every(item => typeof item === "string")) {
    return `ผลที่อาจเกิดขึ้น: ${value.map(id => CHAOS_UI.events[id as ChaosEventId] ?? "เหตุการณ์").join(" หรือ ")}`;
  }
  if (Array.isArray(value) && value.every(item => item && typeof item === "object" && "uid" in item && "probability" in item)) {
    return value.map(item => {
      const entry = item as { uid: string; probability: number };
      return `${nameOf(entry.uid)} ${Math.round(entry.probability * 100)}%`;
    }).join(" · ");
  }
  if (value && typeof value === "object" && "count" in value) {
    const result = value as { count: number; highestWeightUid?: string };
    return `ผู้มีสิทธิ์ ${result.count} คน · โอกาสสูงสุด ${result.highestWeightUid ? nameOf(result.highestWeightUid) : "—"}`;
  }
  return "ได้รับข้อมูลส่วนตัวแล้ว";
}

export function ChaosGame({ board, members, user, isAdmin, onAdvancePhase }: Props) {
  const [game, setGame] = useState<ChaosGameState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [selectedOverrides, setSelectedOverrides] = useState<string[] | null>(null);
  const [mockPlayerUid, setMockPlayerUid] = useState("");
  const [showMockPlayerControls, setShowMockPlayerControls] = useState(false);
  const chaosAdmin = isAdmin && user.email?.trim().toLowerCase() === CHAOS_ADMIN_EMAIL;
  const isMockSimulation = chaosAdmin && isMockMode();
  const canSimulateMockPlayer = isMockSimulation && showMockPlayerControls && mockPlayerUid !== "";
  const selectableMembers = members.filter(member => !chaosAdmin || member.uid !== user.uid);
  const selected = (selectedOverrides ?? selectableMembers.map(member => member.uid)).filter(uid => selectableMembers.some(member => member.uid === uid));
  const [eligible, setEligible] = useState<string[]>([]);
  const [hostExcluded, setHostExcluded] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ChaosItem["category"]>("all");
  const [configuringItem, setConfiguringItem] = useState<{ id: ChaosItemId; playerUid: string; gameId: string | null } | null>(null);
  const [itemTarget, setItemTarget] = useState<ItemTarget>({});
  const [subsetUids, setSubsetUids] = useState<string[]>([]);
  const [eventCategory, setEventCategory] = useState<ChaosEventId | "">("");
  const [privateResult, setPrivateResult] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("wheel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const currentHostUid = board.hostUid ?? board.ownerId;
  const canStartGame = selected.length > 0 && selected.some(uid => uid !== currentHostUid);
  const activeGameId = board.chaosActiveGameId ?? gameId;
  const nameOf = useCallback((uid: string) => members.find(member => member.uid === uid)?.displayName ?? uid, [members]);
  const roster = useMemo(() => Object.keys(game?.players ?? {}), [game?.players]);
  const activePlayerUid = canSimulateMockPlayer && roster.includes(mockPlayerUid)
    ? mockPlayerUid
    : user.uid;
  const myPlayer = game?.players[activePlayerUid];
  const eligibleTargets = roster.filter(uid => uid !== activePlayerUid && !!game?.eligibleUids.includes(uid));
  const visibleItems = useMemo(() => CHAOS_ITEMS.filter(item =>
    (category === "all" || item.category === category) && `${item.nameTh} ${item.descriptionTh}`.includes(query.trim())), [category, query]);
  const finalCandidates = useMemo(() => roster.filter(uid => uid !== currentHostUid && !hostExcluded.includes(uid)), [roster, currentHostUid, hostExcluded]);
  const wheelCandidates = useMemo(() => game?.phase === "final_host_selection" || game?.phase === "finished" ? finalCandidates : game?.eligibleUids ?? [], [game?.phase, game?.eligibleUids, finalCandidates]);
  const wheelResult = game?.phase === "final_host_selection" || game?.phase === "finished" ? game.selectedHostUid : game?.selectedUid;
  const wheelItems = useMemo(() => wheelCandidates.map(uid => ({ id: uid, label: members.find(member => member.uid === uid)?.displayName ?? uid })), [wheelCandidates, members]);
  const wheelFrameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The roulette library only accepts string labels, so style its SVG labels after render.
    wheelFrameRef.current?.querySelectorAll<SVGTextElement>(".rr-roulette__svg text").forEach((label, index) => {
      const uid = wheelItems[index]?.id;
      if (!uid) return;
      const weight = game?.players[uid]?.weightNext ?? 1;
      label.style.fontSize = `${Math.max(10, Math.min(18, Math.round(15 * Math.sqrt(weight))))}px`;
    });
  }, [game?.players, wheelItems]);
  const winningItem = wheelItems.find(item => item.id === wheelResult);
  const wheelSpinAction = game?.phase === "chaos_rounds" && game.turnPhase === "ready" ? "spinPlayer" : game?.phase === "final_host_selection" && !game.selectedHostUid ? "selectHost" : null;
  const wheelCanSpin = chaosAdmin && !!wheelSpinAction && !busy;
  const spinButton = useCallback((props: RouletteButtonProps) => (
    <ChaosSpinButton {...props} disabled={props.disabled || !wheelCanSpin} />
  ), [wheelCanSpin]);
  const rouletteRef = useRef<RouletteController>(null);
  const lastWheelSpin = useRef("");
  const reactionReady = !game?.reactionDeadlineMs || clock >= game.reactionDeadlineMs;
  const reactionSecondsLeft = game && (game.turnPhase === "reaction_window" || game.pendingAction) && typeof game.reactionDeadlineMs === "number"
    ? Math.max(0, Math.ceil((game.reactionDeadlineMs - clock) / 1000))
    : null;
  const shoppingSecondsLeft = game?.phase === "shopping" && typeof game.shoppingEndsAtMs === "number"
    ? Math.max(0, Math.ceil((game.shoppingEndsAtMs - clock) / 1000))
    : null;
  const shoppingCountdown = shoppingSecondsLeft === null
    ? null
    : `${Math.floor(shoppingSecondsLeft / 60)}:${String(shoppingSecondsLeft % 60).padStart(2, "0")}`;
  const autoClosedGameId = useRef<string | null>(null);

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      const mockActor = canSimulateMockPlayer && ["purchase", "activate", "respondProposal"].includes(action)
        ? { mockPlayerUid: activePlayerUid }
        : {};
      const result = await runChaosAction(board.id, crypto.randomUUID(), action, { gameId: activeGameId, ...payload, ...mockActor });
      setGameId(result.gameId);
      setGame(result.game);
      setClock(Date.now());
      if (result.privateResult !== undefined) setPrivateResult(privateMessage(result.privateResult, nameOf));
      return result.game;
    } catch (cause) {
      setError(localizeChaosError(cause instanceof Error ? cause.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }, [activeGameId, activePlayerUid, board.id, canSimulateMockPlayer, nameOf]);

  useEffect(() => {
    if (!activeGameId) return;
    return subscribeChaosGame(board.id, activeGameId, next => {
      setGame(next);
      if (next) {
        setEligible(next.eligibleUids);
        setHostExcluded(next.finalHostExcludedUids);
      }
    }, () => setError(CHAOS_UI.errors.network));
  }, [board.id, activeGameId]);

  useEffect(() => {
    if (!game || !wheelResult) return;
    const playerSpin = game.phase === "chaos_rounds" && game.turnPhase === "player_spin";
    const hostSpin = game.phase === "final_host_selection";
    if (!playerSpin && !hostSpin) return;
    const spinKey = [activeGameId, game.phase, game.turn, wheelResult].join(":");
    const winner = wheelCandidates.includes(wheelResult) && members.find(member => member.uid === wheelResult);
    if (!winner || lastWheelSpin.current === spinKey || !rouletteRef.current) return;
    lastWheelSpin.current = spinKey;
    rouletteRef.current.start({ id: wheelResult, label: winner.displayName });
  }, [activeGameId, game, wheelResult, wheelCandidates, members]);

  useEffect(() => {
    if (!game || (game.phase !== "shopping" && game.turnPhase !== "reaction_window" && !game.pendingAction)) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [game]);

  useEffect(() => {
    if (!activeGameId || game?.phase !== "shopping" || shoppingSecondsLeft !== 0 || autoClosedGameId.current === activeGameId) return;
    autoClosedGameId.current = activeGameId;
    void act("closeShopping");
  }, [activeGameId, act, game?.phase, shoppingSecondsLeft]);

  async function handOver() {
    setBusy(true);
    setError("");
    try { await handOverHost(board.id); }
    catch (cause) { setError(localizeChaosError(cause instanceof Error ? cause.message : "")); }
    finally { setBusy(false); }
  }

  function toggle(value: string, values: string[], setValues: (next: string[]) => void) {
    setValues(values.includes(value) ? values.filter(entry => entry !== value) : [...values, value]);
  }

  async function updateEligibility(next: string[]) {
    if (!game) return;
    setEligible(next);
    if (!await act("setEligibility", { eligibleUids: next, finalExcludedUids: hostExcluded })) setEligible(game.eligibleUids);
  }

  function openItemConfig(id: ChaosItemId) {
    setItemTarget({});
    setSubsetUids([]);
    setEventCategory("");
    setConfiguringItem({ id, playerUid: activePlayerUid, gameId: activeGameId });
  }

  async function activate(itemId: ChaosItemId, options: ActivationOptions = {}) {
    const { candidateUids, ...rest } = options;
    return act("activate", {
      itemId,
      ...rest,
      ...(candidateUids && { candidateUids: candidateUids.filter(uid => uid !== activePlayerUid) }),
    });
  }

  return <section className="chaos-root" aria-label={CHAOS_UI.title} lang="th">
    <style>{`
      body:has(.chaos-root) .board-scene{background:#9bc5d2;display:flex;flex-direction:column}
      body:has(.chaos-root) .board-scene > .board-content{flex:1;min-height:0}
      .chaos-root{--grass:#7fa65a;--leaf:#4f783d;--cream:#fff0c8;--beige:#e8d4a6;--wood:#94643f;--brown:#543b2a;--sky:#91c7d8;--gold:#e8b44d;--red:#d77a65;position:relative;isolation:isolate;overflow:hidden;display:flex;flex:1;flex-direction:column;color:var(--brown);font:500 15px/1.55 var(--font-body),Tahoma,sans-serif;background:linear-gradient(#91c7d8 0 22%,#b8d994 22% 34%,#7fa65a 34% 100%);border:5px solid #543b2a;padding:clamp(10px,2vw,22px);min-height:680px;box-shadow:inset 0 0 0 4px #e8d4a6,0 8px 0 #543b2a}
      .chaos-root *{box-sizing:border-box}.chaos-banner{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;margin-bottom:14px;background:repeating-linear-gradient(90deg,#fff0c8 0 28px,#f2d59b 28px 56px);border:4px solid #543b2a;box-shadow:0 5px 0 #6b5037}.chaos-banner:after{content:"✿   ✿   ✿";position:absolute;right:18px;top:-16px;color:#d77a65;letter-spacing:10px;text-shadow:1px 1px #fff0c8}.chaos-banner h2{position:relative;z-index:1;color:#4f783d;font:700 clamp(22px,3vw,34px)/1.2 var(--font-pixel),var(--font-body),sans-serif;margin:0;text-shadow:2px 2px #fff0c8}.chaos-subtitle{margin:4px 0 0;color:#543b2a}.chaos-phase{position:relative;z-index:1;padding:7px 12px;background:#fff0c8;border:2px solid #94643f;font-weight:700}.chaos-mock-bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin:0 0 12px;padding:8px 12px;background:#d8ebc2;border:3px dashed #4f783d;font-weight:700}.chaos-mock-bar span{color:#5d5144;font-size:12px}
      .chaos-shop-countdown{margin:6px 0 12px;text-align:center;font-size:20px;font-weight:800;color:#a24436;font-variant-numeric:tabular-nums}
      .chaos-reaction-timer{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;margin:0 auto 8px;padding:5px 12px;color:#543b2a;background:#fff0c8;border:3px solid #94643f;box-shadow:0 3px 0 #543b2a;font-weight:800;font-variant-numeric:tabular-nums}.chaos-reaction-timer strong{min-width:2.2em;color:#a24436;font-size:20px}.chaos-reaction-timer.urgent{background:#f7c5a8;border-color:#a24436}.chaos-reaction-timer.urgent strong{color:#a24436}
      .chaos-wheel-frame.has-reaction-countdown{margin-top:30px}
      .chaos-scene:before{display:none}
      .chaos-root .chaos-roulette{gap:2.25rem}
      .chaos-layout{display:grid;grid-template-columns:minmax(205px,250px) minmax(330px,1fr) minmax(225px,280px);gap:14px;align-items:stretch;flex:1;min-height:0}.chaos-left-stack{display:grid;grid-template-rows:auto minmax(0,1fr);gap:14px;align-content:stretch;align-self:stretch;min-height:0;min-width:0}.chaos-panel[data-panel="history"]{display:flex;flex-direction:column;min-height:0}.chaos-panel{background:#fff0c8;border:4px solid #94643f;box-shadow:inset 0 0 0 2px #e8d4a6,0 5px 0 #543b2a;padding:14px;min-width:0}.chaos-panel h3{color:#4f783d;font-size:18px;margin:0 0 10px}.chaos-panel p{margin:8px 0}.chaos-center{text-align:center;background:linear-gradient(#f8e5b6,#fff0c8 48%,#e4edc0)}.chaos-scene{position:relative;overflow:hidden;padding:18px 12px 14px;background:linear-gradient(#91c7d8 0 25%,#cee3a9 25% 42%,#7fa65a 42% 100%);border:3px solid #543b2a;box-shadow:inset 0 0 0 3px #fff0c8}.chaos-scene:before{content:"";position:absolute;inset:68% -2px auto;height:24px;background:repeating-linear-gradient(0deg,#94643f 0 5px,#c18a55 5px 9px);border-block:3px solid #543b2a}.chaos-sun{position:absolute;top:12px;right:15%;width:34px;height:34px;background:#e8b44d;border:4px solid #fff0c8;box-shadow:0 0 0 4px #e8b44d}.chaos-flower-row{display:flex;justify-content:space-around;margin-top:8px;color:#d77a65;font-size:22px;pointer-events:none}.chaos-turn{position:relative;margin:2px 0 13px;color:#543b2a;font-size:18px;font-weight:700}.chaos-wheel-frame{position:relative;margin:5px auto 12px}.chaos-candidate-list{position:relative;display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin:7px auto}.chaos-candidate-list span{background:#fff0c8;border:1px solid #94643f;padding:3px 7px;font-size:12px}.chaos-event-wheel{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:6px auto 12px}.chaos-event-symbol{display:grid;place-items:center;min-width:50px;min-height:46px;padding:4px;background:#e8d4a6;border:3px solid #94643f;color:#543b2a;font-weight:700;box-shadow:0 2px #543b2a}.chaos-event-symbol.active{background:#e8b44d;border-color:#543b2a;transform:translateY(-2px)}.chaos-controls{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:13px}.chaos-btn{min-height:44px;padding:8px 13px;color:#543b2a;background:#e8d4a6;border:3px solid #543b2a;box-shadow:0 3px 0 #6b5037;cursor:pointer;font:700 14px/1.3 var(--font-body),Tahoma,sans-serif;transition:transform .12s,filter .12s}.chaos-btn:hover:not(:disabled),.chaos-btn:focus-visible{filter:brightness(1.06);transform:translateY(-2px);outline:3px solid #91c7d8;outline-offset:2px}.chaos-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #6b5037}.chaos-btn:disabled{opacity:.52;cursor:not-allowed}.chaos-btn-gold{background:#e8b44d}.chaos-btn-danger{background:#d77a65}.chaos-error{padding:10px;border:3px solid #a24436;background:#f7c5a8;margin:0 0 12px}.chaos-private{background:#d8ebc2;border-color:#4f783d}.chaos-stat{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #c3a878}.chaos-stat strong{color:#4f783d}.chaos-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:12px 0}.chaos-slot{display:grid;place-items:center;min-height:42px;background:#e8d4a6;border:2px solid #94643f;color:#4f783d;overflow:hidden}.chaos-slot.filled{background:#fff0c8;border-color:#4f783d}.chaos-inventory{display:grid;gap:7px}.chaos-item{background:#fff0c8;border:3px solid #94643f;padding:10px;display:grid;gap:7px;box-shadow:0 2px #c3a878}.chaos-item.sold{background:#e3dcc8;opacity:.78}.chaos-item-head{display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:8px}.chaos-item-head strong{color:#4f783d}.chaos-item-icon{display:grid;place-items:center;width:44px;height:44px;background:#e8d4a6;border:2px solid #543b2a}.chaos-pixel-icon{width:34px;height:34px;image-rendering:pixelated}.chaos-item small{color:#6a5848}.chaos-sold{color:#a24436;font-weight:700}.chaos-available{color:#4f783d;font-weight:700}.chaos-tabs{display:none}.chaos-mini{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.chaos-final-list{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.chaos-final-list span{padding:6px;border:2px solid #94643f;background:#f5e3b8}.chaos-dialogue{position:relative;background:#fff9e8;border:4px solid #543b2a;box-shadow:inset 0 0 0 3px #e8d4a6;padding:14px;border-radius:10px}.chaos-root .host-wheel-panel.pixel-panel{background:#fff0c8;border-color:#94643f;color:#543b2a}
      .chaos-item-config{display:grid;gap:7px;padding:8px;background:#fff9e8;border:1px solid #c3a878}
      .chaos-inventory{gap:10px}
      .chaos-inventory article{display:grid;gap:8px;min-width:0;padding:11px;background:linear-gradient(135deg,#fff9e8,#f8e7bb);border:2px solid #c3a878;box-shadow:0 3px 0 #d7c08e}
      .chaos-inventory article>strong{padding-bottom:5px;color:#4f783d;font-size:14px;line-height:1.35;border-bottom:1px dashed #d7c08e}
      .chaos-inventory article>small{color:#6a5848;line-height:1.5;overflow-wrap:anywhere}
      .chaos-inventory article>.chaos-btn{width:100%;margin-top:2px}
      .chaos-inventory .chaos-item-config .chaos-controls .chaos-btn{flex:1}
      .chaos-item-field{display:grid;gap:4px;font-size:14px;font-weight:700}
      .chaos-item-field .chaos-select{width:100%;min-width:0}
      .chaos-item-candidates{margin:0;padding:6px 8px;min-width:0;border:1px solid #c3a878}
      .chaos-item-candidates legend{color:#4f783d;font-weight:700}
      .chaos-item-candidates label{display:flex;align-items:center;gap:8px;min-height:44px;overflow-wrap:anywhere}
      .chaos-item-candidates input{flex:0 0 18px;width:18px;height:18px;margin:0;accent-color:#4f783d}
      .chaos-item-field .chaos-select:focus-visible,.chaos-item-candidates label:focus-within{outline:3px solid #91c7d8;outline-offset:2px}
      .chaos-eligibility-header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-bottom:10px;border-bottom:2px solid #d7c08e}
      .chaos-eligibility-header h3{margin:0 0 4px}
      .chaos-config .chaos-eligibility-header p{margin:0;color:#6a5848}
      .chaos-eligibility-count{flex:0 0 auto;padding:7px 11px;background:#d8ebc2;border:2px solid #4f783d;color:#3e6230;font-weight:800;white-space:nowrap}
      .chaos-eligibility-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:8px;width:100%;max-width:1360px}.chaos-setup-host-info{margin:4px 0 6px;padding:8px}.chaos-setup-player-list{gap:12px}
      .chaos-config .chaos-eligibility-player{display:flex;align-items:center;gap:10px;min-height:54px;padding:9px 11px;background:#fff9e8;border:2px solid #c3a878;box-shadow:0 2px 0 #e8d4a6;cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
      .chaos-config .chaos-eligibility-player:hover{transform:translateY(-1px);border-color:#7fa65a}
      .chaos-config .chaos-eligibility-player.is-selected{background:#d8ebc2;border-color:#4f783d;box-shadow:inset 0 0 0 1px #4f783d,0 2px 0 #a8c785}
      .chaos-config .chaos-eligibility-player:focus-within{outline:3px solid #91c7d8;outline-offset:2px}
      .chaos-config .chaos-eligibility-player input[type=checkbox]{flex:0 0 20px;width:20px;height:20px;margin:0;accent-color:#4f783d}
      .chaos-eligibility-name{flex:1;font-weight:700}
      .chaos-eligibility-status{padding:2px 6px;background:#eee4c9;color:#6a5848;font-size:11px;font-weight:700;white-space:nowrap}
      .chaos-eligibility-player.is-selected .chaos-eligibility-status{background:#4f783d;color:#fff9e8}
      .chaos-eligibility-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:8px;border-top:1px solid #d7c08e}
      .chaos-config .chaos-eligibility-footer p{margin:0;color:#6a5848}
      .chaos-eligibility-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      @media(max-width:520px){.chaos-eligibility-header{align-items:flex-start;flex-direction:column}.chaos-eligibility-footer{align-items:stretch}.chaos-eligibility-actions{display:grid;grid-template-columns:1fr 1fr}.chaos-eligibility-actions>:only-child{grid-column:1/-1}}
      @media(max-width:980px){.chaos-layout{grid-template-columns:minmax(190px,1fr) minmax(0,2fr)}.chaos-right{grid-column:1/-1}}
      .chaos-layout [data-panel][data-active="true"]{flex:1;min-height:0}
      @media(max-width:700px){.chaos-root{padding:8px;min-height:0}.chaos-banner{padding:9px}.chaos-banner:after{display:none}.chaos-layout{display:flex;flex-direction:column}.chaos-layout [data-panel]{width:100%;display:none}.chaos-layout [data-panel][data-active=true]{display:block}.chaos-left-stack{grid-template-rows:auto auto;align-self:auto;min-height:0}.chaos-history{flex:initial;max-height:220px}.chaos-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-bottom:9px}.chaos-tabs button{padding:7px 3px;min-height:44px;font-size:12px}.chaos-wheel-frame{width:min(100%,340px)}.chaos-shop-grid{grid-template-columns:1fr;max-height:none}}
      @media(max-width:700px){.chaos-layout [data-panel="players"][data-active="true"]{min-height:100dvh}}
      @media(prefers-reduced-motion:reduce){.chaos-root *, .chaos-root *::before,.chaos-root *::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
      .chaos-roster-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.chaos-roster-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:9px 11px;background:#f5e3b8;border-left:4px solid #7fa65a}.chaos-roster-list li strong{flex:0 0 auto;color:#a24436;white-space:nowrap}.chaos-roster-host{margin:0;padding:7px;background:#d8ebc2;border-left:4px solid #e8b44d;font-weight:700;color:#4f783d}
    `}</style>

    <header className="chaos-banner">
      <div><h2>{CHAOS_UI.title}</h2><p className="chaos-subtitle">{CHAOS_UI.subtitle}</p></div>
      <span className="chaos-phase">{game ? phaseLabel(game.phase) : "เตรียมเกม"}</span>
    </header>
    {isMockSimulation && game && <div className="chaos-mock-bar">
      {showMockPlayerControls && <><label htmlFor="chaos-mock-player">จำลองเล่นในชื่อ</label>
      <select id="chaos-mock-player" className="chaos-select" value={mockPlayerUid} onChange={event => {
        setMockPlayerUid(event.target.value);
      }}>{roster.map(uid => <option key={uid} value={uid}>{nameOf(uid)}</option>)}</select></>}
      <span>Mock เท่านั้น · ผู้ดูแลยังควบคุมเกม</span>
      <button type="button" className="chaos-btn" aria-expanded={showMockPlayerControls} onClick={() => {
        const enabled = !showMockPlayerControls;
        if (enabled && !roster.includes(mockPlayerUid)) setMockPlayerUid(roster[0] ?? "");
        setShowMockPlayerControls(enabled);
      }}>
        {showMockPlayerControls ? "ซ่อนเครื่องมือผู้เล่น" : "เครื่องมือผู้เล่นสำหรับทดสอบ"}
      </button>
    </div>}
    {error && <p className="chaos-error" role="alert">{error}</p>}
    {privateResult && <p className="chaos-panel chaos-private" role="status">ข้อมูลลับของคุณ: {privateResult}</p>}

    {!game && <section className="chaos-panel chaos-config" aria-label="เลือกผู้เล่นเริ่มเกม">
      <header className="chaos-eligibility-header">
        <div><h3>จัดวงล้อเทศกาล</h3><p>เลือกผู้เล่นที่จะร่วมเกม ทุกคนจะได้รับคนละ 100 เอริสเมื่อเปิดร้านค้า</p></div>
        <strong className="chaos-eligibility-count">เลือกแล้ว {selected.length} คน · จากทั้งหมด {selectableMembers.length} คน</strong>
      </header>
      <div className="chaos-final-list chaos-setup-host-info" aria-label="ข้อมูลโฮสต์">
        <span>โฮสต์ปัจจุบัน: <strong>{nameOf(currentHostUid)}</strong></span>
        <span>ประวัติโฮสต์: {board.pastHostUids.length ? board.pastHostUids.map(nameOf).join(" · ") : "ยังไม่มีประวัติ"}</span>
      </div>
      <div className="chaos-eligibility-list chaos-setup-player-list chaos-config-list">{selectableMembers.map(member => {
        const isSelected = selected.includes(member.uid);
        return <label className={`chaos-eligibility-player${isSelected ? " is-selected" : ""}`} key={member.uid}>
          <input type="checkbox" checked={isSelected} disabled={!chaosAdmin || busy} onChange={() => setSelectedOverrides(isSelected ? selected.filter(uid => uid !== member.uid) : [...selected, member.uid])} />
          <span className="chaos-eligibility-name">{member.displayName}{member.uid === currentHostUid ? " · โฮสต์ปัจจุบัน" : ""}</span>
          <span className="chaos-eligibility-status">{isSelected ? "เลือกแล้ว" : "ไม่ได้เลือก"}</span>
        </label>;
      })}</div>
      <footer className="chaos-eligibility-footer">
        {chaosAdmin && <p>{canStartGame ? "พร้อมเริ่มเกมเมื่อเลือกผู้เล่นแล้ว" : "เลือกผู้เล่นอย่างน้อยหนึ่งคนที่ไม่ใช่โฮสต์ปัจจุบัน"}</p>}
        {!chaosAdmin && <p>รอผู้ดูแลเลือกผู้เล่นและเริ่มเกม</p>}
        {chaosAdmin && <div className="chaos-eligibility-actions"><button type="button" className="chaos-btn chaos-btn-gold" disabled={busy || !canStartGame} onClick={() => void act("create", { playerUids: selected })}>เริ่มเกม</button></div>}
      </footer>
    </section>}

    {game && <>
      <nav className="chaos-tabs" aria-label="เมนูเกม">
        {([["wheel", "วงล้อ"], ["shop", "ร้านค้า"], ["players", "ผู้เล่น"], ["history", "ประวัติ"]] as const).map(([id, label]) => <button className="chaos-btn" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="chaos-layout">
        <div className="chaos-left-stack">
          <aside className="chaos-panel chaos-left" data-panel="shop" data-active={tab === "shop"} aria-label="กระเป๋าไอเทมและยอดเอริส">
            <h3>{chaosAdmin && !canSimulateMockPlayer ? "ผู้ดูแลเกม" : nameOf(activePlayerUid)}</h3>
            {chaosAdmin && !canSimulateMockPlayer && <p className="chaos-muted">แอดมินดูแลวงล้อและไม่ได้เป็นผู้เล่น</p>}
            {myPlayer && <>
              <div className="chaos-stat"><span>เอริสคงเหลือ</span><strong>{myPlayer?.eris ?? "—"} เอริส</strong></div>
              <div className="chaos-stat"><span>แต้มมหาภัย</span><strong>{myPlayer?.curse ?? "—"}</strong></div>
              <div className="chaos-stat"><span>กระเป๋าไอเทม</span><strong>{myPlayer?.items.length ?? 0} / 5 ชิ้น</strong></div>
              <div className="chaos-slots" aria-label="ช่องไอเทม 5 ช่อง">{Array.from({ length: 5 }, (_, index) => <span className={myPlayer?.items[index] ? "chaos-slot filled" : "chaos-slot"} key={index} title={myPlayer?.items[index] ? CHAOS_ITEMS.find(item => item.id === myPlayer.items[index])?.nameTh : "ช่องว่าง"}>{myPlayer?.items[index] ? "✦" : "+"}</span>)}</div>
              <div className="chaos-inventory">{myPlayer.items.map(id => {
                const item = CHAOS_ITEMS.find(entry => entry.id === id);
                if (!item) return null;
                const used = game.usedItems.includes(id);
                const needsTarget = item.target === "player" || item.target === "item";
                const needsOffer = item.id === "chaos-auction";
                const needsTargetItem = item.target === "item" || needsOffer;
                const targetOptions = needsTarget ? getChaosItemTargetOptions(game, activePlayerUid, id) : null;
                const hasTarget = targetOptions === null || targetOptions.targetUids.length > 0;
                const usable = canActivate(item, game, activePlayerUid, clock) && !used && hasTarget;
                const responseClosed = (game.turnPhase === "reaction_window" || game.pendingAction !== null) && clock >= (game.reactionDeadlineMs ?? 0);
                const useHint = used ? ""
                  : responseClosed && item.window === "reaction" ? " · หมดเวลาตอบโต้แล้ว"
                  : needsOffer && !targetOptions?.offeredItemIds.length ? " · ไม่มีไอเทมของคุณให้แลก"
                  : !hasTarget ? " · ไม่มีเป้าหมายที่ใช้ได้"
                  : item.id === "holy-shield" && game.selectedUid !== activePlayerUid ? " · ใช้ได้เมื่อวงล้อเลือกคุณ"
                  : item.id === "holy-shield" && !["cursed", "frozen", "targeted"].includes(game.eventId ?? "") ? " · ไม่มีเหตุร้ายให้ป้องกัน"
                  : game.turnPhase === "reaction_window" && item.window === "between-turns" ? " · รอผู้ดูแลสรุปเหตุการณ์"
                  : "";
                const needsEvent = item.target === "event-category";
                const needsCandidates = item.target === "candidate-set";
                const needsConfig = needsTarget || needsEvent || needsCandidates;
                const configuring = configuringItem?.id === id
                  && configuringItem.playerUid === activePlayerUid
                  && configuringItem.gameId === activeGameId;
                const selectedCandidates = subsetUids.filter(uid => eligibleTargets.includes(uid));
                const targetUid = itemTarget.targetUid && targetOptions?.targetUids.includes(itemTarget.targetUid) ? itemTarget.targetUid : "";
                const targetItemIds = targetUid ? targetOptions?.targetItemsByUid[targetUid] ?? [] : [];
                const offeredItemIds = targetOptions?.offeredItemIds ?? [];
                const targetItemId = itemTarget.targetItemId && targetItemIds.includes(itemTarget.targetItemId) ? itemTarget.targetItemId : "";
                const offeredItemId = itemTarget.offeredItemId && offeredItemIds.includes(itemTarget.offeredItemId) ? itemTarget.offeredItemId : "";
                const targetSelector = targetOptions && <label className="chaos-item-field">ผู้เล่นเป้าหมาย
                  <select className="chaos-select" value={targetUid} disabled={busy} onChange={event =>
                    setItemTarget({ targetUid: event.target.value, offeredItemId: itemTarget.offeredItemId })}>
                    <option value="">เลือกผู้เล่น</option>
                    {targetOptions.targetUids.map(uid => <option key={uid} value={uid}>{nameOf(uid)}</option>)}
                  </select>
                </label>;
                const canConfirm = usable && (!needsEvent || !!eventCategory)
                  && (!needsCandidates || selectedCandidates.length >= 3)
                  && (!needsTarget || !!targetUid) && (!needsTargetItem || !!targetItemId) && (!needsOffer || !!offeredItemId);
                return <article key={id}><strong>{item.nameTh}</strong><small>{item.descriptionTh}</small>
                  <small>จังหวะใช้: {CHAOS_UI.windows[item.window]}{useHint}</small>
                  {configuring && !used ? <div className="chaos-item-config" id={`chaos-item-config-${id}`}>
                    {targetSelector}
                    {needsTargetItem && <label className="chaos-item-field">ไอเทมของเป้าหมาย
                      <select className="chaos-select" value={targetItemId} disabled={busy || !targetUid} onChange={event =>
                        setItemTarget({ ...itemTarget, targetItemId: targetItemIds.find(entry => entry === event.target.value) })}>
                        <option value="">เลือกไอเทม</option>
                        {targetItemIds.map(entry => <option key={entry} value={entry}>{CHAOS_ITEM_BY_ID[entry].nameTh}</option>)}
                      </select>
                    </label>}
                    {needsOffer && <label className="chaos-item-field">ไอเทมของคุณสำหรับแลก
                      <select className="chaos-select" value={offeredItemId} disabled={busy} onChange={event =>
                        setItemTarget({ ...itemTarget, offeredItemId: offeredItemIds.find(entry => entry === event.target.value) })}>
                        <option value="">เลือกไอเทม</option>
                        {offeredItemIds.map(entry => <option key={entry} value={entry}>{CHAOS_ITEM_BY_ID[entry].nameTh}</option>)}
                      </select>
                    </label>}
                    {needsEvent && <label className="chaos-item-field">เหตุการณ์ที่ต้องการเพิ่มโอกาส
                      <select className="chaos-select" value={eventCategory} disabled={busy} onChange={event =>
                        setEventCategory(EVENT_IDS.find(entry => entry === event.target.value) ?? "")}>
                        <option value="">เลือกเหตุการณ์</option>
                        {EVENT_IDS.map(entry => <option key={entry} value={entry}>{CHAOS_UI.events[entry]}</option>)}
                      </select>
                    </label>}
                    {needsCandidates && <fieldset className="chaos-item-candidates" disabled={busy}>
                      <legend>เลือกผู้เล่นอย่างน้อย 3 คน</legend>
                      {eligibleTargets.map(uid => <label key={uid}>
                        <input type="checkbox" checked={subsetUids.includes(uid)} onChange={() => toggle(uid, subsetUids, setSubsetUids)} />
                        {nameOf(uid)}
                      </label>)}
                    </fieldset>}
                    <div className="chaos-controls">
                      <button type="button" className="chaos-btn" disabled={busy} onClick={() => setConfiguringItem(null)}>ยกเลิก</button>
                      <button type="button" className="chaos-btn chaos-btn-gold" disabled={busy || !canConfirm} onClick={async () => {
                        if (await activate(id, {
                          ...(targetUid && { targetUid }),
                          ...(targetItemId && { targetItemId }),
                          ...(offeredItemId && { offeredItemId }),
                          ...(needsEvent && eventCategory && { eventCategory }),
                          ...(needsCandidates && { candidateUids: selectedCandidates }),
                        })) setConfiguringItem(current => current === configuringItem ? null : current);
                      }}>ยืนยันใช้ไอเทม</button>
                    </div>
                  </div> : <>
                    {!used && !needsTargetItem && targetSelector}
                    <button type="button" className="chaos-btn" disabled={busy || !usable} title={usable ? item.nameTh : CHAOS_UI.windows[item.window]} onClick={() => {
                      if (needsConfig && !(needsTarget && !needsTargetItem && targetUid)) openItemConfig(id);
                      else void activate(id, targetUid ? { targetUid } : undefined);
                    }}>{used ? "ใช้ไอเทมแล้ว" : "ใช้ไอเทม"}</button>
                  </>}
                </article>;
              })}</div>
              {game.phase === "shopping" && <p className="chaos-muted">เริ่มต้น 100 เอริส · คงเหลือ {myPlayer?.eris ?? 100} เอริส</p>}
            </>}
          </aside>

          <aside className="chaos-panel chaos-right" data-panel="history" data-active={tab === "history"} aria-label="ประวัติเกม">
            <h3>บันทึกเหตุการณ์</h3>
            <ol className="chaos-history">{game.history.slice(-20).reverse().map((entry, index) => <li key={`${entry}-${index}`}>{formatChaosHistory(entry, nameOf)}</li>)}</ol>
          </aside>
        </div>

        <main className="chaos-panel chaos-center" data-panel="wheel" data-active={tab === "wheel"}>
          <div className="chaos-scene">
            <span className="chaos-sun" aria-hidden="true" />
            <p className="chaos-turn">รอบที่ {Math.max(1, Math.min(game.turn, 5))} / 5 · {turnLabel(game.turnPhase)}</p>
            {reactionSecondsLeft !== null && <div className={`chaos-reaction-timer${reactionSecondsLeft <= 5 ? " urgent" : ""}`} role="timer" aria-live="off" aria-label={reactionSecondsLeft ? `เหลือเวลาตอบโต้ ${reactionSecondsLeft} วินาที` : "หมดเวลาตอบโต้แล้ว"}>
              <span aria-hidden="true">⏱</span><span>เวลาตอบโต้</span><strong>{reactionSecondsLeft ? `${reactionSecondsLeft} วินาที` : "หมดเวลา"}</strong>
            </div>}
            <div ref={wheelFrameRef} className={`chaos-wheel-frame ${wheelCanSpin ? "" : "chaos-wheel-readonly"} ${reactionSecondsLeft !== null ? "has-reaction-countdown" : ""}`} aria-label="วงล้อผู้เล่น">
              <Roulette ref={rouletteRef} items={wheelItems} winner={winningItem} size={410} duration={1800} rotations={5} buttonComponent={spinButton} className="chaos-roulette" wheelClassName="chaos-roulette-wheel" ariaLabel="วงล้อผู้เล่น" onSpin={async () => { if (chaosAdmin && wheelSpinAction && !busy) await act(wheelSpinAction); }} />
              {!chaosAdmin && <p className="chaos-wheel-waiting" role="status">{game.pendingAction ? "รอผู้ดูแลสรุปผลการโจมตี" : game.turnPhase === "reaction_window" ? "รอผู้ดูแลสรุปเหตุการณ์" : "รอผู้ดูแลดำเนินการต่อ"}</p>}
              <strong className="chaos-wheel-result" role="status">{winningItem?.label ?? "รอผลการหมุน"}</strong>
            </div>
            <div className="chaos-candidate-list" aria-label="รายชื่อผู้มีสิทธิ์">{wheelCandidates.map(uid => <span key={uid}>{nameOf(uid)}</span>)}</div>
            <p>{wheelCandidates.length ? `ผู้มีสิทธิ์ ${wheelCandidates.length} คน` : "ยังไม่มีผู้มีสิทธิ์ กรุณาปรับรายชื่อ"}</p>
            <h3>วงล้อมหาภัย</h3>
            <div className="chaos-event-wheel" aria-label="วงล้อเหตุการณ์มหาภัย">{EVENT_IDS.map(id => <span key={id} className={`chaos-event-symbol ${game.eventId === id ? "active" : ""}`} title={CHAOS_UI.events[id]}>{EVENT_MARKS[id]}</span>)}</div>
            <strong role="status">{game.eventId ? CHAOS_UI.events[game.eventId] : "รอหมุนวงล้อเหตุการณ์"}</strong>
            <div className="chaos-flower-row" aria-hidden="true">✿　✿　✿　✿　✿</div>
          </div>
          {game.turnPhase === "reaction_window" && <p className="chaos-dialogue" role="alert">เปิดช่วงตอบโต้แล้ว ใช้ไอเทมป้องกันได้ก่อนหมดเวลา</p>}
          {game.pendingAction && <p className="chaos-dialogue" role="alert">มีการโจมตีที่ยังไม่เกิดผล ผู้ถูกเล็งสามารถใช้ไอเทมตอบโต้</p>}
          {game.proposal && <section className="chaos-dialogue" aria-label="ข้อเสนอรอคำตอบ">
            <strong>{nameOf(game.proposal.actorUid)} ส่งข้อเสนอถึงคุณ</strong>
            <p>{game.proposal.kind === "curse-swap" ? "แลกแต้มมหาภัยทั้งหมด" : game.proposal.kind === "pact" ? "ทำข้อตกลงคุ้มครองกัน" : "แลกเปลี่ยนไอเทม"}</p>
            {game.proposal.targetUid === activePlayerUid && <div className="chaos-controls"><button className="chaos-btn chaos-btn-gold" disabled={busy} onClick={() => void act("respondProposal", { accept: true })}>ยอมรับ</button><button className="chaos-btn chaos-btn-danger" disabled={busy} onClick={() => void act("respondProposal", { accept: false })}>ปฏิเสธ</button></div>}
          </section>}
          {chaosAdmin && <div className="chaos-controls">
            {game.phase === "setup" && <button className="chaos-btn chaos-btn-gold" disabled={busy || eligible.length === 0} onClick={() => void act("startShopping")}>เปิดร้านค้า</button>}
            {game.phase === "shopping" && <button className="chaos-btn chaos-btn-gold" disabled={busy} onClick={() => void act("closeShopping")}>ปิดร้านค้า</button>}
            {game.phase === "chaos_rounds" && <>
              {(game.turnPhase === "player_spin" || game.turnPhase === "event_spin") && <button className="chaos-btn chaos-btn-gold" disabled={busy} onClick={() => void act("spinEvent")}>{game.turnPhase === "event_spin" ? "หมุนเหตุการณ์เพิ่มเติม" : "หมุนวงล้อเหตุการณ์"}</button>}
              {game.turnPhase === "reaction_window" && <button className="chaos-btn chaos-btn-gold" disabled={busy || !reactionReady} title={reactionReady ? "" : "รอให้ผู้เล่นตอบโต้ก่อน"} onClick={() => void act("resolve")}>{reactionReady ? "สรุปผลเหตุการณ์" : "กำลังรอการตอบโต้"}</button>}
              {game.pendingAction && <button className="chaos-btn chaos-btn-gold" disabled={busy || !reactionReady} onClick={() => void act("resolveAction")}>{reactionReady ? "สรุปผลการโจมตี" : "กำลังรอการตอบโต้"}</button>}
              {game.turnPhase === "turn_complete" && <button className="chaos-btn chaos-btn-gold" disabled={busy} onClick={() => void act("nextTurn")}>ไปยังรอบถัดไป</button>}
            </>}
            {game.phase === "final_host_selection" && <button className="chaos-btn" disabled={busy || !game.selectedHostUid} onClick={() => void act("confirmHost")}>ยืนยันโฮสต์คนถัดไป</button>}
            {game.phase === "finished" && game.selectedHostUid && board.hostUid !== game.selectedHostUid && <button className="chaos-btn chaos-btn-gold" disabled={busy || board.nextHostUid !== game.selectedHostUid} onClick={() => void handOver()}>ส่งต่อหน้าที่โฮสต์</button>}
            {game.phase === "finished" && onAdvancePhase && board.hostUid === game.selectedHostUid && <button className="chaos-btn" onClick={onAdvancePhase}>ไปหน้าสรุปผล</button>}
          </div>}
        </main>

        <aside className="chaos-panel chaos-right" data-panel="players" data-active={tab === "players"} aria-label="ผู้เล่นและแต้มมหาภัย">
          <h3>ผู้เล่นทั้งหมด ({roster.length}) คน</h3>
          <div className="chaos-roster">
            {game.phase === "final_host_selection" && !roster.includes(currentHostUid) && <p className="chaos-roster-host">👑 {nameOf(currentHostUid)} · โฮสต์</p>}
            <ol className="chaos-roster-list">{roster.sort((a, b) => (game.players[b]?.curse ?? 0) - (game.players[a]?.curse ?? 0)).map(uid => <li key={uid}><span>{nameOf(uid)}{uid === currentHostUid ? " · โฮสต์" : ""}</span><strong>{game.players[uid]?.curse ?? 0} แต้ม</strong></li>)}</ol>
          </div>
          <h3 style={{ marginTop: 18 }}>ประวัติโฮสต์</h3>
          <p className="chaos-muted">{board.pastHostUids.length ? board.pastHostUids.map(nameOf).join(" · ") : "ยังไม่มีประวัติโฮสต์"}</p>
          {game.phase === "final_host_selection" && <><h3>ผู้มีสิทธิ์เป็นโฮสต์</h3><div className="chaos-final-list">{finalCandidates.map(uid => <span key={uid}>{nameOf(uid)} · โอกาส {1 + Math.min(game.players[uid]?.curse ?? 0, 4) * .5} เท่า</span>)}</div></>}
          {game.selectedHostUid && <p className="chaos-dialogue">โฮสต์คนถัดไป: <strong>{nameOf(game.selectedHostUid)}</strong></p>}
        </aside>

      </div>

      {chaosAdmin && (game.phase === "setup" || game.phase === "chaos_rounds" && (game.turnPhase === "turn_complete" || game.turn === 1 && game.turnPhase === "ready")) && <section className="chaos-panel chaos-config" aria-label="ตั้งค่าวงล้อผู้เล่น">
        <header className="chaos-eligibility-header">
          <div><h3>รายชื่อผู้มีสิทธิ์ในวงล้อผู้เล่น</h3><p>ผู้เล่นที่ไม่ถูกเลือกยังดูเกมได้ แต่ซื้อหรือใช้ไอเทมไม่ได้</p></div>
          <strong className="chaos-eligibility-count">{eligible.length} / {roster.length} คน</strong>
        </header>
        <div className="chaos-eligibility-list">{roster.map(uid => {
          const isEligible = eligible.includes(uid);
          return <label className={`chaos-eligibility-player${isEligible ? " is-selected" : ""}`} key={uid}>
            <input type="checkbox" checked={isEligible} disabled={busy} onChange={() => void updateEligibility(isEligible ? eligible.filter(entry => entry !== uid) : [...eligible, uid])} />
            <span className="chaos-eligibility-name">{nameOf(uid)}</span>
            <span className="chaos-eligibility-status">{isEligible ? "มีสิทธิ์" : "ไม่ได้เลือก"}</span>
          </label>;
        })}</div>
        <footer className="chaos-eligibility-footer">
          <p>เปลี่ยนรายชื่อแล้ว วงล้อจะอัปเดตให้อัตโนมัติ</p>
          <div className="chaos-eligibility-actions"><button type="button" className="chaos-btn chaos-btn-gold" disabled={busy} onClick={() => void updateEligibility(roster)}>เลือกทุกคน</button><button type="button" className="chaos-btn" disabled={busy} onClick={() => void updateEligibility([])}>ล้างรายชื่อ</button></div>
        </footer>
      </section>}

      {chaosAdmin && game.phase === "final_host_selection" && <section className="chaos-panel chaos-config" aria-label="ตั้งค่าผู้มีสิทธิ์เป็นโฮสต์">
        <header className="chaos-eligibility-header">
          <div><h3>ผู้มีสิทธิ์ในวงล้อโฮสต์</h3><p>โฮสต์ปัจจุบันถูกตัดสิทธิ์โดยอัตโนมัติ และรายชื่อนี้แยกจากวงล้อผู้เล่น</p></div>
          <strong className="chaos-eligibility-count">{finalCandidates.length} / {roster.filter(uid => uid !== currentHostUid).length} คน</strong>
        </header>
        <div className="chaos-eligibility-list">{roster.filter(uid => uid !== currentHostUid).map(uid => {
          const isEligible = !hostExcluded.includes(uid);
          return <label className={`chaos-eligibility-player${isEligible ? " is-selected" : ""}`} key={uid}>
            <input type="checkbox" checked={isEligible} disabled={busy} onChange={() => toggle(uid, hostExcluded, setHostExcluded)} />
            <span className="chaos-eligibility-name">{nameOf(uid)}{board.pastHostUids.includes(uid) ? " · โฮสต์เดิม" : ""}</span>
            <span className="chaos-eligibility-status">{isEligible ? "มีสิทธิ์" : "ไม่ได้เลือก"}</span>
          </label>;
        })}</div>
        <footer className="chaos-eligibility-footer">
          <p>เลือกผู้มีสิทธิ์แล้วกดบันทึกเพื่ออัปเดตวงล้อโฮสต์</p>
          <div className="chaos-eligibility-actions">
            <button type="button" className="chaos-btn" disabled={busy} onClick={() => setHostExcluded(roster.filter(uid => board.pastHostUids.includes(uid)))}>ตัดโฮสต์เดิมออก</button>
            <button type="button" className="chaos-btn chaos-btn-gold" disabled={busy || finalCandidates.length === 0} onClick={() => void act("setEligibility", { eligibleUids: eligible, finalExcludedUids: hostExcluded })}>บันทึกสิทธิ์โฮสต์</button>
          </div>
        </footer>
      </section>}

      {game.phase === "shopping" && <section className="chaos-panel chaos-shop" aria-label="ร้านค้าไอเทม">
        <h3>ร้านค้าของวิเศษ · ไอเทมพิเศษ 35 ชนิด</h3>
        {shoppingCountdown !== null && <p className="chaos-shop-countdown" role="timer" aria-live="off">ปิดร้านอัตโนมัติใน {shoppingCountdown}</p>}
        <div className="chaos-shop-tools"><input aria-label="ค้นหาไอเทม" placeholder="ค้นหาชื่อหรือความสามารถ" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="เลือกหมวดหมู่" value={category} onChange={event => setCategory(event.target.value as typeof category)}>{Object.entries(CHAOS_UI.categories).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
        </div>
        <div className="chaos-shop-grid">{visibleItems.map(item => {
          const owner = game.itemOwners[item.id as ChaosItemId];
          const canBuy = !!myPlayer && eligible.includes(activePlayerUid) && !owner && myPlayer.items.length < 5 && myPlayer.eris >= item.price;
          const reason = owner ? "ไอเทมนี้ขายหมดแล้ว" : !eligible.includes(activePlayerUid) ? "คุณไม่มีสิทธิ์ซื้อไอเทม" : (myPlayer?.items.length ?? 0) >= 5 ? "กระเป๋าไอเทมเต็มแล้ว" : "เอริสไม่เพียงพอ";
          return <article className={`chaos-item ${owner ? "sold" : ""}`} key={item.id}>
            <div className="chaos-item-head"><span className="chaos-item-icon"><PixelItemIcon itemId={item.id} label={`ไอคอน${item.nameTh}`} /></span><strong>{item.nameTh}</strong><span>ราคา {item.price} เอริส</span></div>
            <small>{item.descriptionTh}</small><small>ใช้ได้: {CHAOS_UI.windows[item.window]}</small>
            <span className={owner ? "chaos-sold" : "chaos-available"}>{owner ? `ขายหมดแล้ว · ${nameOf(owner)}` : "มี 1 ชิ้น"}</span>
            <button className="chaos-btn chaos-btn-gold" disabled={busy || !canBuy} title={canBuy ? `ซื้อ${item.nameTh}` : reason} onClick={() => void act("purchase", { itemId: item.id })}>ซื้อไอเทม · {item.price} เอริส</button>
          </article>;
        })}</div>
      </section>}

    </>}
  </section>;
}
