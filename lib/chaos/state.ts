import { CHAOS_ITEM_BY_ID, isChaosItemId, type ChaosItemId } from "./catalog";

export const CHAOS_REACTION_WINDOW_MS = 15_000;

export type ChaosPhase = "setup" | "shopping" | "chaos_rounds" | "final_host_selection" | "finished";
export type ChaosTurnPhase = "ready" | "player_spin" | "event_spin" | "reaction_window" | "resolving" | "turn_complete";
export type ChaosPlayer = { eris: number; curse: number; items: ChaosItemId[]; frozenUntilTurn: number; weightNext: number; shieldCharges: number };
export type ChaosEventId = "cursed" | "frozen" | "reverse" | "targeted" | "safe" | "fortune" | "double-trouble" | "royal-favor";
export type ChaosPendingAction = { actorUid: string; targetUid: string; kind: "curse" | "freeze" | "transfer" | "nuisance"; redirected: boolean; reflected: boolean };
export type ChaosProposal = { kind: "curse-swap" | "pact" | "trade"; actorUid: string; targetUid: string; actorItemId?: ChaosItemId; targetItemId?: ChaosItemId };
export const CHAOS_EVENTS: readonly { id: ChaosEventId; weight: number }[] = [
  { id: "cursed", weight: 25 }, { id: "frozen", weight: 15 }, { id: "reverse", weight: 10 },
  { id: "targeted", weight: 15 }, { id: "safe", weight: 10 }, { id: "fortune", weight: 10 },
  { id: "double-trouble", weight: 10 }, { id: "royal-favor", weight: 5 },
];
export type ChaosGameState = {
  phase: ChaosPhase;
  shoppingEndsAtMs?: number | null;
  turn: number;
  turnPhase: ChaosTurnPhase;
  reactionDeadlineMs?: number;
  players: Record<string, ChaosPlayer>;
  itemOwners: Partial<Record<ChaosItemId, string>>;
  usedItems: ChaosItemId[];
  eligibleUids: string[];
  finalHostExcludedUids: string[];
  selectedUid: string | null;
  selectedHostUid: string | null;
  eventId: ChaosEventId | null;
  fortuneRequestId: string | null;
  bonusEventsRemaining: number;
  bonusSpinActive: boolean;
  pendingAction: ChaosPendingAction | null;
  proposal: ChaosProposal | null;
  safePassageUid: string | null;
  subsetUids: string[] | null;
  delayedSpin: boolean;
  spinDelayUsed: boolean;
  guardianUids: string[];
  insuranceUids: string[];
  lastStandUids: string[];
  statusGuardUids: string[];
  pactPairs: [string, string][];
  disabledItems: ChaosItemId[];
  eventCategoryShift: ChaosEventId | null;
  rerolledThisTurn: boolean;
  replacedThisTurn: boolean;
  history: string[];
};

export function hasAvailableChaosReaction(state: ChaosGameState): boolean {
  if (state.phase !== "chaos_rounds" || state.proposal) return false;

  return Object.entries(state.players).some(([uid, player]) => player.items.some(itemId => {
    const item = CHAOS_ITEM_BY_ID[itemId];
    if (state.itemOwners[itemId] !== uid || state.usedItems.includes(itemId) || state.disabledItems.includes(itemId)
      || item.window !== "reaction" || item.category === "chaos" && player.frozenUntilTurn >= state.turn && player.frozenUntilTurn > 0) return false;

    switch (itemId) {
      case "holy-shield": return state.selectedUid === uid && ["cursed", "frozen", "targeted"].includes(state.eventId ?? "");
      case "second-chance": return !!state.eventId && !state.replacedThisTurn;
      case "iron-will": return player.frozenUntilTurn >= state.turn && player.frozenUntilTurn > 0 || !(state.statusGuardUids ?? []).includes(uid);
      case "mirror-guard": return state.pendingAction?.targetUid === uid && !state.pendingAction.reflected;
      case "reverse-card": return state.pendingAction?.targetUid === uid && !state.pendingAction.redirected;
      case "time-rewind": return state.pendingAction?.targetUid === uid;
      case "final-verdict": return state.turn === 5 && !!state.eventId;
      default: return false;
    }
  }));
}

function requirePhase(state: ChaosGameState, phase: ChaosPhase) {
  if (state.phase !== phase) throw new Error(`Expected ${phase} phase`);
}

export function createChaosGame(playerUids: string[]): ChaosGameState {
  if (!Array.isArray(playerUids) || playerUids.length === 0 || new Set(playerUids).size !== playerUids.length || playerUids.some(uid => typeof uid !== "string" || !uid)) throw new Error("At least one distinct player is required");
  return {
    phase: "setup", shoppingEndsAtMs: null, turn: 0, turnPhase: "ready",
    players: Object.fromEntries(playerUids.map(uid => [uid, { eris: 0, curse: 0, items: [], frozenUntilTurn: 0, weightNext: 1, shieldCharges: 0 }])),
    itemOwners: {}, usedItems: [], eligibleUids: [...playerUids], finalHostExcludedUids: [], selectedUid: null, selectedHostUid: null, eventId: null, fortuneRequestId: null, bonusEventsRemaining: 0, bonusSpinActive: false,
    pendingAction: null, proposal: null, safePassageUid: null, subsetUids: null, delayedSpin: false, spinDelayUsed: false,
    guardianUids: [], insuranceUids: [], lastStandUids: [], statusGuardUids: [], pactPairs: [], disabledItems: [], eventCategoryShift: null, rerolledThisTurn: false, replacedThisTurn: false, history: [],
  };
}

export function setChaosEligibility(state: ChaosGameState, uids: string[]): ChaosGameState {
  const canEdit = state.phase === "setup" || state.phase === "chaos_rounds" && (state.turnPhase === "turn_complete" || state.turn === 1 && state.turnPhase === "ready");
  if (!canEdit) throw new Error("Eligibility is locked during a turn");
  if (new Set(uids).size !== uids.length || uids.some(uid => !(uid in state.players))) throw new Error("Unknown or duplicate candidate");
  return { ...state, eligibleUids: [...uids], history: [...state.history, `eligibility:${uids.join(",")}`] };
}

export function startChaosShopping(state: ChaosGameState, nowMs = Date.now()): ChaosGameState {
  requirePhase(state, "setup");
  return { ...state, phase: "shopping", shoppingEndsAtMs: nowMs + 60_000, players: Object.fromEntries(Object.entries(state.players).map(([uid, p]) => [uid, { ...p, eris: 100 }])) };
}

export function purchaseChaosItem(state: ChaosGameState, uid: string, itemId: ChaosItemId): ChaosGameState {
  requirePhase(state, "shopping");
  if (!isChaosItemId(itemId)) throw new Error("Unknown item");
  const player = state.players[uid];
  const item = CHAOS_ITEM_BY_ID[itemId];
  if (!player || !state.eligibleUids.includes(uid)) throw new Error("Player is not eligible to shop");
  if (!item) throw new Error("Unknown item");
  if (state.itemOwners[itemId]) throw new Error("SOLD OUT");
  if (player.items.length >= 5) throw new Error("Inventory limit reached");
  if (player.eris < item.price) throw new Error("Insufficient Eris");
  return {
    ...state,
    players: { ...state.players, [uid]: { ...player, eris: player.eris - item.price, items: [...player.items, itemId] } },
    itemOwners: { ...state.itemOwners, [itemId]: uid },
    history: [...state.history, `purchase:${uid}:${itemId}`],
  };
}

export function closeChaosShopping(state: ChaosGameState): ChaosGameState {
  requirePhase(state, "shopping");
  if (state.eligibleUids.length === 0) throw new Error("No eligible players");
  return { ...state, phase: "chaos_rounds", shoppingEndsAtMs: null, turn: 1, turnPhase: "ready", proposal: null,
    history: state.proposal ? [...state.history, `proposal-expired:${state.proposal.kind}:${state.proposal.targetUid}`] : state.history };
}

export function weightedChoice<T>(values: readonly T[], weights: readonly number[], random: number): T {
  if (values.length === 0 || values.length !== weights.length || weights.some(weight => !Number.isFinite(weight) || weight <= 0) || !(random >= 0 && random < 1)) throw new Error("Invalid weighted draw");
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random * total;
  for (let i = 0; i < values.length; i++) {
    target -= weights[i];
    if (target < 0) return values[i];
  }
  return values[values.length - 1];
}

export function chaosEventWeights(state: ChaosGameState, events: readonly { id: ChaosEventId; weight: number }[]): number[] {
  const total = events.reduce((sum, event) => sum + event.weight, 0);
  const shifted = events.find(event => event.id === state.eventCategoryShift);
  if (!shifted || total <= 0) return events.map(event => event.weight);
  const probability = shifted.weight / total;
  const adjustedProbability = Math.min(1, probability + 0.1);
  const remainingScale = probability === 1 ? 0 : (1 - adjustedProbability) / (1 - probability);
  return events.map(event => event.id === shifted.id ? total * adjustedProbability : event.weight * remainingScale);
}

export function spinChaosPlayer(state: ChaosGameState, random: number): ChaosGameState {
  requirePhase(state, "chaos_rounds");
  if (state.turnPhase !== "ready") throw new Error("Player wheel is not ready");
  if (state.delayedSpin) return { ...state, delayedSpin: false, history: [...state.history, `spin-delayed:${state.turn}`] };
  const candidates = (state.subsetUids ?? state.eligibleUids).filter(uid => uid !== state.safePassageUid && state.eligibleUids.includes(uid));
  const selectedUid = weightedChoice(candidates, candidates.map(uid => state.players[uid].weightNext), random);
  return { ...state, turnPhase: "player_spin", selectedUid, safePassageUid: null, subsetUids: null, history: [...state.history, `player:${state.turn}:${selectedUid}`] };
}

export function spinChaosEvent(state: ChaosGameState, random: number, guaranteedEventId?: ChaosEventId): ChaosGameState {
  requirePhase(state, "chaos_rounds");
  if ((state.turnPhase !== "player_spin" && state.turnPhase !== "event_spin") || !state.selectedUid) throw new Error("Player wheel must resolve first");
  const events = state.bonusSpinActive ? CHAOS_EVENTS.filter(event => event.id !== "double-trouble") : CHAOS_EVENTS;
  const weights = chaosEventWeights(state, events);
  if (guaranteedEventId && !events.some(event => event.id === guaranteedEventId)) throw new Error("Guaranteed event is not available on this spin");
  const eventId = guaranteedEventId ?? weightedChoice(events.map(event => event.id), weights, random);
  return { ...state, turnPhase: "reaction_window", eventId, eventCategoryShift: null, history: [...state.history, `event:${state.turn}:${eventId}`] };
}

export function applyChaosCurse(state: ChaosGameState, uid: string): { state: ChaosGameState; increased: boolean } {
  const player = state.players[uid];
  if (!player || (state.lastStandUids ?? []).includes(uid)) return { state, increased: false };
  if (player.curse >= 3 && state.guardianUids.includes(uid)) {
    return { state: { ...state, guardianUids: state.guardianUids.filter(entry => entry !== uid) }, increased: false };
  }
  const nextPlayer = { ...player, curse: player.curse + 1 };
  let usedItems = state.usedItems;
  let lastStandUids = state.lastStandUids;
  if (nextPlayer.curse === 4 && state.itemOwners["last-stand"] === uid && !usedItems.includes("last-stand")) {
    nextPlayer.curse--;
    lastStandUids = [...lastStandUids, uid];
    usedItems = [...usedItems, "last-stand"];
  }
  const increased = nextPlayer.curse > player.curse;
  const insuranceUids = increased ? state.insuranceUids.filter(entry => entry !== uid) : state.insuranceUids;
  if (increased && state.insuranceUids.includes(uid)) nextPlayer.eris += 15;
  return {
    state: {
      ...state,
      players: { ...state.players, [uid]: nextPlayer },
      insuranceUids,
      lastStandUids,
      usedItems,
    },
    increased,
  };
}

export function resolveChaosEvent(state: ChaosGameState): ChaosGameState {
  requirePhase(state, "chaos_rounds");
  if (state.turnPhase !== "reaction_window" || !state.selectedUid || !state.eventId) throw new Error("No pending event");
  if (state.eventId === "double-trouble") {
    return { ...state, turnPhase: "event_spin", eventId: null, bonusEventsRemaining: 0, bonusSpinActive: true, history: [...state.history, `resolved:${state.turn}:double-trouble`] };
  }
  const uid = state.selectedUid;
  const player = state.players[uid];
  const next = { ...player };
  let current = state;
  let statusGuardUids = state.statusGuardUids ?? [];
  switch (state.eventId) {
    case "cursed":
      if (next.shieldCharges > 0) next.shieldCharges--;
      else {
        const result = applyChaosCurse({ ...state, players: { ...state.players, [uid]: next } }, uid);
        current = result.state;
        Object.assign(next, current.players[uid]);
      }
      break;
    case "frozen":
      if (statusGuardUids.includes(uid)) statusGuardUids = statusGuardUids.filter(entry => entry !== uid);
      else next.frozenUntilTurn = state.turn + 1;
      break;
    case "targeted": next.weightNext *= 1.5; break;
    case "fortune": next.shieldCharges++; break;
    case "royal-favor": next.curse = Math.max(0, next.curse - 1); break;
    case "reverse": case "safe": break;
  }
  const anotherEvent = state.bonusEventsRemaining > 0 && !state.bonusSpinActive;
  return { ...current, turnPhase: anotherEvent ? "event_spin" : "turn_complete", eventId: anotherEvent ? null : state.eventId, bonusEventsRemaining: 0, bonusSpinActive: anotherEvent, players: { ...current.players, [uid]: next }, statusGuardUids, history: [...state.history, `resolved:${state.turn}:${state.eventId}`] };
}

export function nextChaosTurn(state: ChaosGameState): ChaosGameState {
  requirePhase(state, "chaos_rounds");
  if (state.turnPhase !== "turn_complete") throw new Error("Turn has not resolved");
  const proposalHistory = state.proposal ? [...state.history, `proposal-expired:${state.proposal.kind}:${state.proposal.targetUid}`] : state.history;
  return state.turn === 5
    ? { ...state, phase: "final_host_selection", turnPhase: "ready", selectedUid: null, eventId: null, bonusEventsRemaining: 0, bonusSpinActive: false, proposal: null, history: proposalHistory }
    : { ...state, turn: state.turn + 1, turnPhase: "ready", selectedUid: null, eventId: null, bonusEventsRemaining: 0, bonusSpinActive: false, rerolledThisTurn: false, replacedThisTurn: false, insuranceUids: [], lastStandUids: [], pactPairs: [], disabledItems: [], proposal: null, history: proposalHistory,
      players: Object.fromEntries(Object.entries(state.players).map(([uid, p]) => [uid, { ...p, weightNext: 1 }])) };
}

export function finalHostProbabilities(state: ChaosGameState, currentHostUid: string): { uid: string; weight: number; probability: number }[] {
  requirePhase(state, "final_host_selection");
  const candidates = Object.entries(state.players)
    .filter(([uid]) => uid !== currentHostUid && !state.finalHostExcludedUids.includes(uid))
    .map(([uid, player]) => ({ uid, weight: 1 + Math.min(player.curse, 4) * 0.5 }));
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  return candidates.map(candidate => ({ ...candidate, probability: candidate.weight / total }));
}

export function setFinalHostExclusions(state: ChaosGameState, uids: string[], currentHostUid: string): ChaosGameState {
  requirePhase(state, "final_host_selection");
  if (state.selectedHostUid || new Set(uids).size !== uids.length || uids.some(uid => !(uid in state.players))
    || !Object.keys(state.players).some(uid => uid !== currentHostUid && !uids.includes(uid))) throw new Error("Invalid final Host exclusions");
  return { ...state, finalHostExcludedUids: [...uids], history: [...state.history, `host-exclusions:${uids.join(",")}`] };
}

export function selectFinalHost(state: ChaosGameState, currentHostUid: string, random: number): ChaosGameState {
  requirePhase(state, "final_host_selection");
  if (state.selectedHostUid) return state;
  const candidates = finalHostProbabilities(state, currentHostUid);
  const selectedHostUid = weightedChoice(candidates.map(candidate => candidate.uid), candidates.map(candidate => candidate.weight), random);
  return { ...state, selectedHostUid, history: [...state.history, `host-selected:${selectedHostUid}`] };
}
