import { CHAOS_ITEM_BY_ID, isChaosItemId, type ChaosItemId } from "./catalog";
import { applyChaosCurse, CHAOS_EVENTS, weightedChoice, type ChaosEventId, type ChaosGameState } from "./state";

export type ChaosActivation = {
  targetUid?: string;
  targetItemId?: ChaosItemId;
  offeredItemId?: ChaosItemId;
  candidateUids?: string[];
  eventCategory?: ChaosEventId;
  predeterminedEventId?: ChaosEventId;
};
export type ChaosEffectResult = { state: ChaosGameState; privateResult?: unknown; serverOnly?: { fortuneEventId?: ChaosEventId } };
export type RandomChaosItemTarget = Pick<ChaosActivation, "targetUid" | "targetItemId" | "offeredItemId">;

function availableItems(state: ChaosGameState, uid: string, itemId: ChaosItemId): ChaosItemId[] {
  return (state.players[uid]?.items ?? []).filter(candidate => candidate !== itemId
    && state.itemOwners[candidate] === uid
    && !state.usedItems.includes(candidate)
    && (itemId !== "item-sabotage" || CHAOS_ITEM_BY_ID[candidate].category === "chaos"));
}

function randomEntry<T>(entries: T[], random: () => number): T {
  return entries[Math.min(Math.floor(random() * entries.length), entries.length - 1)];
}

export function getChaosItemTargetOptions(state: ChaosGameState, uid: string, itemId: ChaosItemId) {
  const item = CHAOS_ITEM_BY_ID[itemId];
  const trade = itemId === "chaos-auction";
  const needsItem = item.target === "item" || trade;
  const offeredItemIds = trade ? availableItems(state, uid, itemId) : [];
  const candidates = state.eligibleUids.filter(candidate => candidate !== uid && Object.hasOwn(state.players, candidate));
  const targetItemsByUid: Partial<Record<string, ChaosItemId[]>> = Object.fromEntries(
    needsItem ? candidates.map(candidate => [candidate, availableItems(state, candidate, itemId)]) : [],
  );
  const targetUids = (item.target === "player" || item.target === "item") && (!trade || offeredItemIds.length > 0)
    ? candidates.filter(candidate => !needsItem || !!targetItemsByUid[candidate]?.length)
    : [];
  return { targetUids, targetItemsByUid, offeredItemIds };
}

export function chooseRandomChaosItemTarget(
  state: ChaosGameState,
  uid: string,
  itemId: ChaosItemId,
  random: () => number,
): RandomChaosItemTarget {
  const item = CHAOS_ITEM_BY_ID[itemId];
  if (!item || (item.target !== "player" && item.target !== "item")) return {};
  const { targetUids, targetItemsByUid, offeredItemIds } = getChaosItemTargetOptions(state, uid, itemId);
  if (!targetUids.length) throw new Error("No eligible target");

  const targetUid = randomEntry(targetUids, random);
  const selection: RandomChaosItemTarget = { targetUid };
  const targetItems = targetItemsByUid[targetUid];
  if (targetItems?.length) selection.targetItemId = randomEntry(targetItems, random);
  if (offeredItemIds.length) selection.offeredItemId = randomEntry(offeredItemIds, random);
  return selection;
}

export function activateChaosItem(state: ChaosGameState, uid: string, itemId: ChaosItemId, input: ChaosActivation = {}, random = 0): ChaosEffectResult {
  if (!isChaosItemId(itemId) || (input.targetItemId !== undefined && !isChaosItemId(input.targetItemId)) || (input.offeredItemId !== undefined && !isChaosItemId(input.offeredItemId))) throw new Error("Unknown item");
  const item = CHAOS_ITEM_BY_ID[itemId];
  const owner = state.players[uid];
  if (!item || !owner || state.itemOwners[itemId] !== uid || state.usedItems.includes(itemId)) throw new Error("Item is unavailable");
  if (state.proposal) throw new Error("Resolve the pending proposal first");
  const inWindow = itemId === "iron-will" ? state.phase === "chaos_rounds" && (state.turnPhase === "ready" || state.turnPhase === "turn_complete" || state.turnPhase === "reaction_window")
    : item.window === "shopping" ? state.phase === "shopping"
    : item.window === "reaction" ? state.phase === "chaos_rounds" && (state.turnPhase === "reaction_window" || state.pendingAction !== null)
    : item.window === "after-player-spin" ? state.phase === "chaos_rounds" && state.turnPhase === "player_spin"
    : item.window === "before-event-spin" ? state.phase === "chaos_rounds" && state.turnPhase === "player_spin"
    : item.window === "before-player-spin" ? state.phase === "chaos_rounds" && state.turnPhase === "ready"
    : state.phase === "chaos_rounds" && state.turnPhase === "turn_complete";
  if (!inWindow) throw new Error("Wrong activation window");
  if (owner.frozenUntilTurn > 0 && owner.frozenUntilTurn >= state.turn && item.category === "chaos") throw new Error("Offensive items are frozen");
  if (state.disabledItems.includes(itemId)) throw new Error("Item is sabotaged");
  const targetOptions = item.target === "player" || item.target === "item" ? getChaosItemTargetOptions(state, uid, itemId) : null;
  const targetUid = targetOptions ? input.targetUid : undefined;
  if (targetOptions && (!targetUid || !targetOptions.targetUids.includes(targetUid))) throw new Error("Invalid target");
  const target = targetUid ? state.players[targetUid] : undefined;
  const targetItems = targetUid ? targetOptions?.targetItemsByUid[targetUid] : undefined;
  const reportedTargetUid = targetUid ?? (["mirror-guard", "reverse-card", "time-rewind"].includes(itemId) ? state.pendingAction?.actorUid : undefined);
  const next: ChaosGameState = { ...state, players: { ...state.players }, usedItems: [...state.usedItems, itemId], history: [...state.history, `item:${uid}:${itemId}${reportedTargetUid ? `:${reportedTargetUid}` : ""}`] };
  let privateResult: unknown;
  let serverOnly: ChaosEffectResult["serverOnly"];
  const mutate = (playerUid: string, patch: Partial<typeof owner>) => { next.players[playerUid] = { ...next.players[playerUid], ...patch }; };
  switch (itemId) {
    case "holy-shield":
      if (next.selectedUid !== uid || !["cursed", "frozen", "targeted"].includes(next.eventId ?? "")) throw new Error("No eligible hazard");
      next.eventId = "safe"; break;
    case "mirror-guard":
      if (!next.pendingAction || next.pendingAction.targetUid !== uid || next.pendingAction.reflected) throw new Error("No reflectable attack");
      next.pendingAction = { ...next.pendingAction, targetUid: next.pendingAction.actorUid, reflected: true }; break;
    case "second-chance":
      if (!next.eventId || next.replacedThisTurn) throw new Error("Event cannot be replaced");
      next.eventId = weightedChoice(CHAOS_EVENTS.map(event => event.id), CHAOS_EVENTS.map(event => event.weight), random);
      next.replacedThisTurn = true; break;
    case "curse-cleanser":
      if (!owner.curse) throw new Error("No Curse to remove"); mutate(uid, { curse: owner.curse - 1 }); break;
    case "safe-passage":
      if (next.eligibleUids.length <= 1) throw new Error("No alternative candidate"); next.safePassageUid = uid; break;
    case "guardian-angel":
      if (next.guardianUids.includes(uid)) throw new Error("Guardian Angel is already armed");
      next.guardianUids = [...next.guardianUids, uid]; break;
    case "iron-will":
      if (owner.frozenUntilTurn >= next.turn && owner.frozenUntilTurn > 0) mutate(uid, { frozenUntilTurn: 0 });
      else if (!(next.statusGuardUids ?? []).includes(uid)) next.statusGuardUids = [...(next.statusGuardUids ?? []), uid];
      else throw new Error("Iron Will is already armed");
      break;
    case "chaos-bomb": case "freeze-spell": case "curse-transfer":
      if (next.pendingAction || (itemId === "curse-transfer" && owner.curse === 0)) throw new Error("Action unavailable");
      next.pendingAction = { actorUid: uid, targetUid: targetUid!, kind: itemId === "chaos-bomb" ? "curse" : itemId === "freeze-spell" ? "freeze" : "transfer", redirected: false, reflected: false }; break;
    case "eris-thief": {
      const amount = Math.min(10, target!.eris); mutate(targetUid!, { eris: target!.eris - amount }); mutate(uid, { eris: owner.eris + amount }); break;
    }
    case "reverse-card":
      if (!next.pendingAction || next.pendingAction.targetUid !== uid || next.pendingAction.redirected) throw new Error("No redirectable attack");
      next.pendingAction = { ...next.pendingAction, targetUid: next.pendingAction.actorUid, redirected: true }; break;
    case "target-mark": mutate(targetUid!, { weightNext: target!.weightNext * 1.5 }); break;
    case "mischief-dice": {
      const roll = Math.floor(random * 3);
      if (roll === 0) mutate(targetUid!, { eris: Math.max(0, target!.eris - 5) });
      else if (roll === 1) mutate(targetUid!, { frozenUntilTurn: next.turn + 1 });
      else mutate(targetUid!, { weightNext: target!.weightNext * 1.25 });
      break;
    }
    case "lucky-charm": mutate(uid, { weightNext: Math.max(0.01, owner.weightNext * 0.6) }); break;
    case "fortune-cookie":
      if (!input.predeterminedEventId) throw new Error("Server must preselect the event");
      {
        const availableEvents = next.bonusSpinActive ? CHAOS_EVENTS.filter(event => event.id !== "double-trouble") : CHAOS_EVENTS;
        const options = availableEvents.filter(event => event.id !== input.predeterminedEventId);
        const alternative = weightedChoice(options.map(event => event.id), options.map(event => event.weight), random);
        privateResult = random < 0.5 ? [input.predeterminedEventId, alternative] : [alternative, input.predeterminedEventId];
        serverOnly = { fortuneEventId: input.predeterminedEventId };
      }
      break;
    case "destiny-swap": case "secret-pact":
      if (next.proposal) throw new Error("Proposal unavailable");
      next.proposal = { kind: itemId === "destiny-swap" ? "curse-swap" : "pact", actorUid: uid, targetUid: targetUid! }; break;
    case "chaos-auction":
      if (!input.offeredItemId || !targetOptions?.offeredItemIds.includes(input.offeredItemId)
        || !input.targetItemId || !targetItems?.includes(input.targetItemId)) throw new Error("Proposal unavailable");
      next.proposal = { kind: "trade", actorUid: uid, targetUid: targetUid!, actorItemId: input.offeredItemId, targetItemId: input.targetItemId };
      break;
    case "lucky-seven": if (owner.curse !== 7) throw new Error("Requires exactly seven Curse"); mutate(uid, { curse: 4 }); break;
    case "probability-shift":
      if (!input.eventCategory || !CHAOS_EVENTS.some(event => event.id === input.eventCategory)) throw new Error("Invalid category");
      next.eventCategoryShift = input.eventCategory; break;
    case "treasure-blessing": mutate(uid, { eris: owner.eris + 15 }); break;
    case "fate-insurance": next.insuranceUids = [...next.insuranceUids, uid]; break;
    case "re-spin-token":
      if (next.rerolledThisTurn) throw new Error("Player already rerolled");
      {
        const candidates = next.eligibleUids.filter(candidate => candidate !== next.selectedUid);
        next.selectedUid = weightedChoice(candidates, candidates.map(candidate => next.players[candidate].weightNext), random);
      }
      next.rerolledThisTurn = true; break;
    case "wheel-brake": next.players = Object.fromEntries(Object.entries(next.players).map(([candidate, player]) => [candidate, { ...player, weightNext: 1 }])); break;
    case "double-spin": if (next.bonusEventsRemaining) throw new Error("Bonus event already queued"); next.bonusEventsRemaining = 1; break;
    case "time-rewind": if (!next.pendingAction || next.pendingAction.targetUid !== uid) throw new Error("No pending item action"); next.pendingAction = null; break;
    case "chaos-compass": {
      const candidates = next.eligibleUids.map(candidate => ({ uid: candidate, weight: next.players[candidate].weightNext })).sort((a, b) => b.weight - a.weight || a.uid.localeCompare(b.uid));
      privateResult = { count: candidates.length, highestWeightUid: candidates[0]?.uid }; break;
    }
    case "wheel-peek": {
      const total = next.eligibleUids.reduce((sum, candidate) => sum + next.players[candidate].weightNext, 0);
      privateResult = next.eligibleUids.map(candidate => ({ uid: candidate, probability: next.players[candidate].weightNext / total })); break;
    }
    case "spin-delay":
      if (next.spinDelayUsed) throw new Error("Spin Delay has already been used");
      next.delayedSpin = true;
      next.spinDelayUsed = true;
      break;
    case "royal-decree":
      if (!input.candidateUids || input.candidateUids.length < 3 || new Set(input.candidateUids).size !== input.candidateUids.length || input.candidateUids.some(candidate => !next.eligibleUids.includes(candidate))) throw new Error("Invalid candidate subset");
      next.subsetUids = [...input.candidateUids]; break;
    case "item-sabotage":
      if (!input.targetItemId || !targetItems?.includes(input.targetItemId)) throw new Error("No eligible offensive item");
      next.disabledItems = [...next.disabledItems, input.targetItemId]; break;
    case "emergency-escape":
      if (next.selectedUid !== uid || next.eligibleUids.length <= 1) throw new Error("No alternative candidate");
      const alternatives = next.eligibleUids.filter(candidate => candidate !== uid);
      next.selectedUid = weightedChoice(alternatives, alternatives.map(candidate => next.players[candidate].weightNext), random); break;
    case "last-stand": throw new Error("Last Stand triggers automatically at four Curse");
    case "final-verdict":
      if (next.turn !== 5 || !next.eventId) throw new Error("Final turn event required");
      next.eventId = "safe"; break;
  }
  return { state: next, privateResult, serverOnly };
}

export function respondChaosProposal(state: ChaosGameState, targetUid: string, accept: boolean): ChaosGameState {
  const proposal = state.proposal;
  if (!proposal || proposal.targetUid !== targetUid) throw new Error("No proposal for player");
  const next: ChaosGameState = { ...state, players: { ...state.players }, itemOwners: { ...state.itemOwners }, proposal: null };
  if (!accept) return next;
  const actor = next.players[proposal.actorUid];
  const target = next.players[targetUid];
  if (proposal.kind === "curse-swap") {
    next.players[proposal.actorUid] = { ...actor, curse: target.curse };
    next.players[targetUid] = { ...target, curse: actor.curse };
  } else if (proposal.kind === "pact") next.pactPairs = [...next.pactPairs, [proposal.actorUid, targetUid]];
  else {
    if (!proposal.actorItemId || !proposal.targetItemId) throw new Error("Invalid trade");
    next.itemOwners[proposal.actorItemId] = targetUid;
    next.itemOwners[proposal.targetItemId] = proposal.actorUid;
    next.players[proposal.actorUid] = { ...actor, items: actor.items.map(item => item === proposal.actorItemId ? proposal.targetItemId! : item) };
    next.players[targetUid] = { ...target, items: target.items.map(item => item === proposal.targetItemId ? proposal.actorItemId! : item) };
  }
  return next;
}

export function resolveChaosPendingAction(state: ChaosGameState): ChaosGameState {
  const action = state.pendingAction;
  if (!action) throw new Error("No pending action");
  const blockedByPact = state.pactPairs.some(([a, b]) =>
    (a === action.actorUid && b === action.targetUid) || (b === action.actorUid && a === action.targetUid));
  const next: ChaosGameState = { ...state, pendingAction: null, players: { ...state.players }, history: [...state.history, `${blockedByPact ? "blocked" : "applied"}:${action.kind}:${action.targetUid}`] };
  if (blockedByPact || action.targetUid === action.actorUid && action.kind === "transfer") return next;
  const target = next.players[action.targetUid];
  if (!target) throw new Error("Target is no longer in the game");
  if (action.kind === "freeze") next.players[action.targetUid] = { ...target, frozenUntilTurn: next.turn + 1 };
  else if (action.kind === "curse" || action.kind === "transfer") {
    const result = applyChaosCurse(next, action.targetUid);
    if (action.kind === "transfer" && !result.increased) return result.state;
    next.players = result.state.players;
    next.guardianUids = result.state.guardianUids;
    next.insuranceUids = result.state.insuranceUids;
    next.lastStandUids = result.state.lastStandUids;
    next.usedItems = result.state.usedItems;
    if (action.kind === "transfer") {
      const actor = next.players[action.actorUid];
      if (actor.curse <= 0) throw new Error("Curse is no longer transferable");
      next.players[action.actorUid] = { ...actor, curse: actor.curse - 1 };
    }
  }
  return next;
}
