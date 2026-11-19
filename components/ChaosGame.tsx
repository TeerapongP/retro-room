"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Roulette, type RouletteButtonProps, type RouletteController } from "@jdevs/react-roulette";
import { CHAOS_ITEMS, type ChaosItem, type ChaosItemId } from "@/lib/chaos/catalog";
import { CHAOS_ADMIN_EMAIL } from "@/lib/chaos/access";
import { CHAOS_UI, formatChaosHistory, localizeChaosError, phaseLabel, turnLabel } from "@/lib/chaos/locale";
import type { ChaosEventId, ChaosGameState } from "@/lib/chaos/state";
import { runChaosAction, subscribeChaosGame } from "@/lib/chaos/client";
import { handOverHost } from "@/lib/firebase/farm";
import { isMockMode } from "@/lib/mock";
import { PixelItemIcon } from "@/components/chaos/PixelItemIcon";
import type { Board, BoardMember } from "@/lib/firebase/types";

type Props = { board: Board; members: BoardMember[]; user: User; isAdmin: boolean; onAdvancePhase?: () => void };
type Tab = "wheel" | "shop" | "players" | "history";

function ChaosSpinButton({ isSpinning, className, ...buttonProps }: RouletteButtonProps) {
  return <button {...buttonProps} className={className} aria-label={isSpinning ? "กำลังหมุนวงล้อ" : "หมุนวงล้อ"}>{isSpinning ? "กำลังหมุน…" : "หมุนวงล้อ"}</button>;
}

const EVENT_IDS: readonly ChaosEventId[] = ["cursed", "frozen", "reverse", "targeted", "safe", "fortune", "double-trouble", "royal-favor"];
const EVENT_MARKS: Record<ChaosEventId, string> = {
  cursed: "คำ", frozen: "แช่", reverse: "ย้อน", targeted: "เป้า", safe: "รอด", fortune: "โชค", "double-trouble": "คูณ", "royal-favor": "พร",
};

function canActivate(item: ChaosItem, game: ChaosGameState): boolean {
  if (item.window === "shopping") return game.phase === "shopping";
  if (game.phase !== "chaos_rounds") return false;
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
  const [targetUid, setTargetUid] = useState("");
  const [targetItemId, setTargetItemId] = useState<ChaosItemId | "">("");
  const [offeredItemId, setOfferedItemId] = useState<ChaosItemId | "">("");
  const [subsetUids, setSubsetUids] = useState<string[]>([]);
  const [eventCategory, setEventCategory] = useState<ChaosEventId>("cursed");
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
  const visibleItems = useMemo(() => CHAOS_ITEMS.filter(item =>
    (category === "all" || item.category === category) && `${item.nameTh} ${item.descriptionTh}`.includes(query.trim())), [category, query]);
  const finalCandidates = useMemo(() => roster.filter(uid => uid !== currentHostUid && !hostExcluded.includes(uid)), [roster, currentHostUid, hostExcluded]);
  const wheelCandidates = useMemo(() => game?.phase === "final_host_selection" || game?.phase === "finished" ? finalCandidates : game?.eligibleUids ?? [], [game?.phase, game?.eligibleUids, finalCandidates]);
  const wheelResult = game?.phase === "final_host_selection" || game?.phase === "finished" ? game.selectedHostUid : game?.selectedUid;
  const wheelItems = useMemo(() => wheelCandidates.map(uid => ({ id: uid, label: members.find(member => member.uid === uid)?.displayName ?? uid })), [wheelCandidates, members]);
  const winningItem = wheelItems.find(item => item.id === wheelResult);
  const wheelSpinAction = game?.phase === "chaos_rounds" && game.turnPhase === "ready" ? "spinPlayer" : game?.phase === "final_host_selection" && !game.selectedHostUid ? "selectHost" : null;
  const wheelCanSpin = chaosAdmin && !!wheelSpinAction && !busy;
  const spinButton = useCallback((props: RouletteButtonProps) => (
    <ChaosSpinButton {...props} disabled={props.disabled || !wheelCanSpin} />
  ), [wheelCanSpin]);
  const rouletteRef = useRef<RouletteController>(null);
  const lastWheelSpin = useRef("");
  const reactionReady = !game?.reactionDeadlineMs || clock >= game.reactionDeadlineMs;
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

  function activate(itemId: ChaosItemId) {
    void act("activate", {
      itemId,
      targetUid: targetUid || undefined,
      targetItemId: targetItemId || undefined,
      offeredItemId: offeredItemId || undefined,
      candidateUids: subsetUids,
      eventCategory,
    });
  }

  return <section className="chaos-root" aria-label={CHAOS_UI.title} lang="th">
    <style>{`
      body:has(.chaos-root) .board-scene{background:#9bc5d2}
      .chaos-root{--grass:#7fa65a;--leaf:#4f783d;--cream:#fff0c8;--beige:#e8d4a6;--wood:#94643f;--brown:#543b2a;--sky:#91c7d8;--gold:#e8b44d;--red:#d77a65;position:relative;isolation:isolate;overflow:hidden;color:var(--brown);font:500 15px/1.55 var(--font-body),Tahoma,sans-serif;background:linear-gradient(#91c7d8 0 22%,#b8d994 22% 34%,#7fa65a 34% 100%);border:5px solid #543b2a;padding:clamp(10px,2vw,22px);min-height:680px;box-shadow:inset 0 0 0 4px #e8d4a6,0 8px 0 #543b2a}
      .chaos-root *{box-sizing:border-box}.chaos-banner{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;margin-bottom:14px;background:repeating-linear-gradient(90deg,#fff0c8 0 28px,#f2d59b 28px 56px);border:4px solid #543b2a;box-shadow:0 5px 0 #6b5037}.chaos-banner:after{content:"✿   ✿   ✿";position:absolute;right:18px;top:-16px;color:#d77a65;letter-spacing:10px;text-shadow:1px 1px #fff0c8}.chaos-banner h2{position:relative;z-index:1;color:#4f783d;font:700 clamp(22px,3vw,34px)/1.2 var(--font-pixel),var(--font-body),sans-serif;margin:0;text-shadow:2px 2px #fff0c8}.chaos-subtitle{margin:4px 0 0;color:#543b2a}.chaos-phase{position:relative;z-index:1;padding:7px 12px;background:#fff0c8;border:2px solid #94643f;font-weight:700}.chaos-mock-bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin:0 0 12px;padding:8px 12px;background:#d8ebc2;border:3px dashed #4f783d;font-weight:700}.chaos-mock-bar span{color:#5d5144;font-size:12px}
      .chaos-shop-countdown{margin:6px 0 12px;text-align:center;font-size:20px;font-weight:800;color:#a24436;font-variant-numeric:tabular-nums}
      .chaos-scene:before{display:none}
      .chaos-root .chaos-roulette{gap:2.25rem}
      .chaos-layout{display:grid;grid-template-columns:minmax(205px,250px) minmax(330px,1fr) minmax(225px,280px);gap:14px;align-items:start}.chaos-left-stack{display:grid;grid-template-rows:auto minmax(0,1fr);gap:14px;align-content:stretch;align-self:stretch;min-height:0;min-width:0}.chaos-panel[data-panel="history"]{display:flex;flex-direction:column;min-height:0}.chaos-panel{background:#fff0c8;border:4px solid #94643f;box-shadow:inset 0 0 0 2px #e8d4a6,0 5px 0 #543b2a;padding:14px;min-width:0}.chaos-panel h3{color:#4f783d;font-size:18px;margin:0 0 10px}.chaos-panel p{margin:8px 0}.chaos-center{text-align:center;background:linear-gradient(#f8e5b6,#fff0c8 48%,#e4edc0)}.chaos-scene{position:relative;overflow:hidden;padding:18px 12px 14px;background:linear-gradient(#91c7d8 0 25%,#cee3a9 25% 42%,#7fa65a 42% 100%);border:3px solid #543b2a;box-shadow:inset 0 0 0 3px #fff0c8}.chaos-scene:before{content:"";position:absolute;inset:68% -2px auto;height:24px;background:repeating-linear-gradient(0deg,#94643f 0 5px,#c18a55 5px 9px);border-block:3px solid #543b2a}.chaos-sun{position:absolute;top:12px;right:15%;width:34px;height:34px;background:#e8b44d;border:4px solid #fff0c8;box-shadow:0 0 0 4px #e8b44d}.chaos-flower-row{display:flex;justify-content:space-around;margin-top:8px;color:#d77a65;font-size:22px;pointer-events:none}.chaos-turn{position:relative;margin:2px 0 13px;color:#543b2a;font-size:18px;font-weight:700}.chaos-wheel-frame{position:relative;margin:5px auto 12px}.chaos-candidate-list{position:relative;display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin:7px auto}.chaos-candidate-list span{background:#fff0c8;border:1px solid #94643f;padding:3px 7px;font-size:12px}.chaos-event-wheel{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:6px auto 12px}.chaos-event-symbol{display:grid;place-items:center;min-width:50px;min-height:46px;padding:4px;background:#e8d4a6;border:3px solid #94643f;color:#543b2a;font-weight:700;box-shadow:0 2px #543b2a}.chaos-event-symbol.active{background:#e8b44d;border-color:#543b2a;transform:translateY(-2px)}.chaos-controls{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:13px}.chaos-btn{min-height:44px;padding:8px 13px;color:#543b2a;background:#e8d4a6;border:3px solid #543b2a;box-shadow:0 3px 0 #6b5037;cursor:pointer;font:700 14px/1.3 var(--font-body),Tahoma,sans-serif;transition:transform .12s,filter .12s}.chaos-btn:hover:not(:disabled),.chaos-btn:focus-visible{filter:brightness(1.06);transform:translateY(-2px);outline:3px solid #91c7d8;outline-offset:2px}.chaos-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #6b5037}.chaos-btn:disabled{opacity:.52;cursor:not-allowed}.chaos-btn-gold{background:#e8b44d}.chaos-btn-danger{background:#d77a65}.chaos-error{padding:10px;border:3px solid #a24436;background:#f7c5a8;margin:0 0 12px}.chaos-private{background:#d8ebc2;border-color:#4f783d}.chaos-stat{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #c3a878}.chaos-stat strong{color:#4f783d}.chaos-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:12px 0}.chaos-slot{display:grid;place-items:center;min-height:42px;background:#e8d4a6;border:2px solid #94643f;color:#4f783d;overflow:hidden}.chaos-slot.filled{background:#fff0c8;border-color:#4f783d}.chaos-inventory{display:grid;gap:7px}.chaos-inventory article{background:#f5e3b8;padding:8px;border:2px solid #c3a878;display:grid;gap:6px}.chaos-roster,.chaos-history{list-style:none;margin:0;padding:0;display:grid;gap:6px}.chaos-roster li{display:flex;justify-content:space-between;gap:8px;background:#f5e3b8;padding:7px;border-left:4px solid #7fa65a}.chaos-roster strong{color:#a24436}.chaos-history{flex:1;min-height:0;max-height:none;overflow:auto;align-content:start}.chaos-history li{background:#f5e3b8;padding:7px;border-left:4px solid #e8b44d}.chaos-muted{color:#6a5848}.chaos-config{display:grid;gap:12px;margin-top:14px}.chaos-config-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:6px}.chaos-config label{display:flex;gap:8px;align-items:center;padding:8px;background:#f5e3b8;border:1px solid #c3a878}.chaos-config input[type=checkbox]{width:18px;height:18px;accent-color:#4f783d}.chaos-shop{margin-top:14px;background:#f7e4b6}.chaos-shop-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.chaos-shop-tools input,.chaos-shop-tools select,.chaos-select{min-height:42px;padding:8px 10px;color:#543b2a;background:#fff9e8;border:2px solid #94643f;font:inherit;max-width:100%}.chaos-shop-tools input{flex:1;min-width:150px}.chaos-shop-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px;max-height:560px;overflow:auto;padding:3px}.chaos-item{background:#fff0c8;border:3px solid #94643f;padding:10px;display:grid;gap:7px;box-shadow:0 2px #c3a878}.chaos-item.sold{background:#e3dcc8;opacity:.78}.chaos-item-head{display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:8px}.chaos-item-head strong{color:#4f783d}.chaos-item-icon{display:grid;place-items:center;width:44px;height:44px;background:#e8d4a6;border:2px solid #543b2a}.chaos-pixel-icon{width:34px;height:34px;image-rendering:pixelated}.chaos-item small{color:#6a5848}.chaos-sold{color:#a24436;font-weight:700}.chaos-available{color:#4f783d;font-weight:700}.chaos-tabs{display:none}.chaos-mini{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.chaos-final-list{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.chaos-final-list span{padding:6px;border:2px solid #94643f;background:#f5e3b8}.chaos-dialogue{position:relative;background:#fff9e8;border:4px solid #543b2a;box-shadow:inset 0 0 0 3px #e8d4a6;padding:14px;border-radius:10px}.chaos-root .host-wheel-panel.pixel-panel{background:#fff0c8;border-color:#94643f;color:#543b2a}
      .chaos-panel.chaos-targets{display:grid;grid-template-columns:1fr;gap:13px;margin:10px 0;background:linear-gradient(145deg,#fff3d2,#f5e3b8)}
      .chaos-targets-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:10px;border-bottom:2px solid #d7c08e}
      .chaos-targets-header h3{margin:0;color:#4f783d;font-size:19px}
      .chaos-targets-header p{margin:3px 0 0;color:#6a5848}
      .chaos-target-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .chaos-target-field{display:grid;gap:6px;align-content:start;padding:10px;background:#fff9e8;border:1px solid #c3a878;color:#543b2a;font-size:14px;font-weight:700}
      .chaos-target-field .chaos-select{width:100%;min-width:0}
      .chaos-target-roster{margin:0;padding:9px 11px 11px;min-width:0;border:2px dashed #c3a878;background:#fff8e5}
      .chaos-target-roster legend{padding:0 7px;color:#4f783d;font-weight:700}
      .chaos-target-roster p{margin:0 0 8px;color:#6a5848}
      .chaos-target-roster-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px}
      .chaos-targets .chaos-target-player{display:flex;align-items:center;gap:9px;flex:initial;min-width:0;min-height:44px;padding:8px 10px;background:#f5e3b8;border:1px solid #c3a878;cursor:pointer;transition:background .12s,border-color .12s}
      .chaos-targets .chaos-target-player:hover{background:#e8d4a6;border-color:#94643f}
      .chaos-targets .chaos-target-player:focus-within{outline:3px solid #91c7d8;outline-offset:2px}
      .chaos-target-player input[type=checkbox]{flex:0 0 18px;width:18px;height:18px;margin:0;accent-color:#4f783d}
      .chaos-targets .chaos-select:focus-visible{outline:3px solid #91c7d8;outline-offset:2px}
      @media(max-width:900px){.chaos-target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:520px){.chaos-targets-header{align-items:flex-start}.chaos-target-grid,.chaos-target-roster-list{grid-template-columns:1fr}}
      @media(max-width:980px){.chaos-layout{grid-template-columns:minmax(190px,1fr) minmax(0,2fr)}.chaos-right{grid-column:1/-1}}
      @media(max-width:700px){.chaos-root{padding:8px;min-height:0}.chaos-banner{padding:9px}.chaos-banner:after{display:none}.chaos-layout{display:flex;flex-direction:column}.chaos-layout [data-panel]{width:100%;display:none}.chaos-layout [data-panel][data-active=true]{display:block}.chaos-left-stack{grid-template-rows:auto auto;align-self:auto;min-height:0}.chaos-history{flex:initial;max-height:220px}.chaos-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-bottom:9px}.chaos-tabs button{padding:7px 3px;min-height:44px;font-size:12px}.chaos-wheel-frame{width:min(100%,340px)}.chaos-shop-grid{grid-template-columns:1fr;max-height:none}.chaos-config-list{grid-template-columns:1fr 1fr}}
      @media(prefers-reduced-motion:reduce){.chaos-root *, .chaos-root *::before,.chaos-root *::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
      .chaos-roster-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.chaos-roster-host{margin:0;padding:7px;background:#d8ebc2;border-left:4px solid #e8b44d;font-weight:700;color:#4f783d}
    `}</style>

    <header className="chaos-banner">
      <div><h2>{CHAOS_UI.title}</h2><p className="chaos-subtitle">{CHAOS_UI.subtitle}</p></div>
      <span className="chaos-phase">{game ? phaseLabel(game.phase) : "เตรียมเกม"}</span>
    </header>
    {isMockSimulation && game && <div className="chaos-mock-bar">
      {showMockPlayerControls && <><label htmlFor="chaos-mock-player">จำลองเล่นในชื่อ</label>
      <select id="chaos-mock-player" className="chaos-select" value={mockPlayerUid} onChange={event => {
        setMockPlayerUid(event.target.value);
        setTargetUid("");
        setTargetItemId("");
        setOfferedItemId("");
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
      <h3>จัดวงล้อเทศกาล</h3>
      <p>เลือกผู้เล่นตามต้องการ ทุกคนจะได้รับคนละ 100 เอริสเมื่อเปิดร้านค้า</p>
      <p>โฮสต์ปัจจุบัน: <strong>{nameOf(currentHostUid)}</strong></p>
      <p>ประวัติโฮสต์: {board.pastHostUids.length ? board.pastHostUids.map(nameOf).join(" · ") : "ยังไม่มีประวัติ"}</p>
      <div className="chaos-config-list">{selectableMembers.map(member => <label key={member.uid}>
        <input type="checkbox" checked={selected.includes(member.uid)} disabled={!chaosAdmin} onChange={() => setSelectedOverrides(selected.includes(member.uid) ? selected.filter(uid => uid !== member.uid) : [...selected, member.uid])} />
        {member.displayName}{member.uid === currentHostUid ? " · โฮสต์ปัจจุบัน" : ""}
      </label>)}</div>
      <p>เลือกแล้ว {selected.length} คน · จากทั้งหมด {selectableMembers.length} คน</p>
      {!canStartGame && <p className="chaos-muted">เลือกผู้เล่นอย่างน้อยหนึ่งคนที่ไม่ใช่โฮสต์ปัจจุบัน</p>}
      {chaosAdmin && <button className="chaos-btn chaos-btn-gold" disabled={busy || !canStartGame} onClick={() => void act("create", { playerUids: selected })}>เริ่มเกม</button>}
    </section>}

    {game && <>
      <nav className="chaos-tabs" aria-label="เมนูเกม">
        {([["wheel", "วงล้อ"], ["shop", "ร้านค้า"], ["players", "ผู้เล่น"], ["history", "ประวัติ"]] as const).map(([id, label]) => <button className="chaos-btn" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="chaos-layout">
        <div className="chaos-left-stack">
          <aside className="chaos-panel chaos-left" data-panel="shop" data-active={tab === "shop"} aria-label="กระเป๋าไอเทมและยอดเอริส">
            <h3>{chaosAdmin ? "ผู้ดูแลเกม" : nameOf(user.uid)}</h3>
            {chaosAdmin && !canSimulateMockPlayer && <p className="chaos-muted">แอดมินดูแลวงล้อและไม่ได้เป็นผู้เล่น</p>}
            {myPlayer && <>
              <div className="chaos-stat"><span>เอริสคงเหลือ</span><strong>{myPlayer?.eris ?? "—"} เอริส</strong></div>
              <div className="chaos-stat"><span>แต้มมหาภัย</span><strong>{myPlayer?.curse ?? "—"}</strong></div>
              <div className="chaos-stat"><span>กระเป๋าไอเทม</span><strong>{myPlayer?.items.length ?? 0} / 5 ชิ้น</strong></div>
              <div className="chaos-slots" aria-label="ช่องไอเทม 5 ช่อง">{Array.from({ length: 5 }, (_, index) => <span className={myPlayer?.items[index] ? "chaos-slot filled" : "chaos-slot"} key={index} title={myPlayer?.items[index] ? CHAOS_ITEMS.find(item => item.id === myPlayer.items[index])?.nameTh : "ช่องว่าง"}>{myPlayer?.items[index] ? "✦" : "+"}</span>)}</div>
              <div className="chaos-inventory">{myPlayer?.items.map(id => {
                const item = CHAOS_ITEMS.find(entry => entry.id === id);
                if (!item) return null;
                const usable = canActivate(item, game) && !game.usedItems.includes(id);
                return <article key={id}><strong>{item.nameTh}</strong><small>{item.descriptionTh}</small>
                  <small>จังหวะใช้: {CHAOS_UI.windows[item.window]}</small>
                  <button className="chaos-btn" disabled={busy || !usable} title={usable ? item.nameTh : CHAOS_UI.windows[item.window]} onClick={() => activate(id)}>{game.usedItems.includes(id) ? "ใช้ไอเทมแล้ว" : "ใช้ไอเทม"}</button>
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
            <div className={`chaos-wheel-frame ${wheelCanSpin ? "" : "chaos-wheel-readonly"}`} aria-label="วงล้อผู้เล่น">
              <Roulette ref={rouletteRef} items={wheelItems} winner={winningItem} size={410} duration={1800} rotations={5} buttonComponent={spinButton} className="chaos-roulette" wheelClassName="chaos-roulette-wheel" ariaLabel="วงล้อผู้เล่น" onSpin={async () => { if (chaosAdmin && wheelSpinAction && !busy) await act(wheelSpinAction); }} />
              {!chaosAdmin && <button type="button" className="chaos-btn chaos-btn-gold" aria-label="หมุนวงล้อ" disabled>หมุนวงล้อ</button>}
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
        <h3>รายชื่อผู้มีสิทธิ์ในวงล้อผู้เล่น</h3><p>ผู้เล่นที่ไม่ถูกเลือกยังดูเกมได้ แต่ซื้อหรือใช้ไอเทมไม่ได้</p>
        <div className="chaos-config-list">{roster.map(uid => <label key={uid}><input type="checkbox" checked={eligible.includes(uid)} disabled={busy} onChange={() => void updateEligibility(eligible.includes(uid) ? eligible.filter(entry => entry !== uid) : [...eligible, uid])} />{nameOf(uid)}</label>)}</div>
        <p>เปลี่ยนรายชื่อแล้ว วงล้อจะอัปเดตให้อัตโนมัติ</p>
        <div className="chaos-controls"><button className="chaos-btn" disabled={busy} onClick={() => void updateEligibility(roster)}>เลือกทุกคน</button><button className="chaos-btn" disabled={busy} onClick={() => void updateEligibility([])}>ล้างรายชื่อ</button></div>
      </section>}

      {chaosAdmin && game.phase === "final_host_selection" && <section className="chaos-panel chaos-config" aria-label="ตั้งค่าผู้มีสิทธิ์เป็นโฮสต์">
        <h3>ผู้มีสิทธิ์ในวงล้อโฮสต์</h3><p>โฮสต์ปัจจุบันถูกตัดสิทธิ์โดยอัตโนมัติ และรายชื่อนี้แยกจากวงล้อผู้เล่น</p>
        <div className="chaos-config-list">{roster.filter(uid => uid !== currentHostUid).map(uid => <label key={uid}><input type="checkbox" checked={!hostExcluded.includes(uid)} onChange={() => toggle(uid, hostExcluded, setHostExcluded)} />{nameOf(uid)}{board.pastHostUids.includes(uid) ? " · โฮสต์เดิม" : ""}</label>)}</div>
        <div className="chaos-controls"><button className="chaos-btn" onClick={() => setHostExcluded(roster.filter(uid => board.pastHostUids.includes(uid)))}>ตัดโฮสต์เดิมออก</button><button className="chaos-btn chaos-btn-gold" disabled={busy || !roster.some(uid => uid !== currentHostUid && !hostExcluded.includes(uid))} onClick={() => void act("setEligibility", { eligibleUids: eligible, finalExcludedUids: hostExcluded })}>บันทึกสิทธิ์โฮสต์</button></div>
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

      {myPlayer && (!chaosAdmin || canSimulateMockPlayer) && <section className="chaos-panel chaos-targets" aria-labelledby="chaos-targets-title">
        <div className="chaos-targets-header"><div><h3 id="chaos-targets-title">ตั้งเป้าหมายไอเทม</h3><p>เลือกผู้เล่นและไอเทมสำหรับวางแผนในรอบนี้</p></div></div>
        <div className="chaos-target-grid">
          <label className="chaos-target-field">ผู้เล่นเป้าหมาย<select className="chaos-select" value={targetUid} onChange={event => setTargetUid(event.target.value)}><option value="">เลือกผู้เล่น</option>{roster.filter(uid => uid !== activePlayerUid && eligible.includes(uid)).map(uid => <option key={uid} value={uid}>{nameOf(uid)}</option>)}</select></label>
          <label className="chaos-target-field">ไอเทมของเป้าหมาย<select className="chaos-select" value={targetItemId} onChange={event => setTargetItemId(event.target.value as ChaosItemId | "")}><option value="">เลือกไอเทม</option>{CHAOS_ITEMS.filter(item => game.itemOwners[item.id] === targetUid && !game.usedItems.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.nameTh}</option>)}</select></label>
          <label className="chaos-target-field">ไอเทมของคุณสำหรับแลก<select className="chaos-select" value={offeredItemId} onChange={event => setOfferedItemId(event.target.value as ChaosItemId | "")}><option value="">เลือกไอเทม</option>{myPlayer.items.filter(id => !game.usedItems.includes(id)).map(id => <option key={id} value={id}>{CHAOS_ITEMS.find(item => item.id === id)?.nameTh}</option>)}</select></label>
          <label className="chaos-target-field">เหตุการณ์ที่ต้องการเพิ่มโอกาส<select className="chaos-select" value={eventCategory} onChange={event => setEventCategory(event.target.value as ChaosEventId)}>{EVENT_IDS.map(id => <option key={id} value={id}>{CHAOS_UI.events[id]}</option>)}</select></label>
        </div>
        <fieldset className="chaos-target-roster"><legend>เลือกผู้เล่นสำหรับราชโองการ</legend><p>เลือกผู้เล่นอย่างน้อย 3 คน</p><div className="chaos-target-roster-list">{roster.filter(uid => eligible.includes(uid)).map(uid => <label className="chaos-target-player" key={uid}><input type="checkbox" checked={subsetUids.includes(uid)} onChange={() => toggle(uid, subsetUids, setSubsetUids)} />{nameOf(uid)}</label>)}</div></fieldset>
      </section>}
    </>}
  </section>;
}
