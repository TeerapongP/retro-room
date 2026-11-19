import { describe, expect, it } from "vitest";
import { CHAOS_ITEMS, type ChaosItemId } from "../../lib/chaos/catalog";
import { activateChaosItem, getChaosItemTargetOptions, resolveChaosPendingAction, respondChaosProposal } from "../../lib/chaos/effects";
import { formatChaosHistory } from "../../lib/chaos/locale";
import { applyChaosCurse, closeChaosShopping, createChaosGame, purchaseChaosItem, resolveChaosEvent, startChaosShopping } from "../../lib/chaos/state";

const players = ["a", "b", "c", "d", "e", "f", "g"];
type Setup = { state: ReturnType<typeof createChaosGame>; input?: Parameters<typeof activateChaosItem>[3]; random?: number };

function stocked(itemId: ChaosItemId): ReturnType<typeof createChaosGame> {
  return purchaseChaosItem(startChaosShopping(createChaosGame(players)), "a", itemId);
}

function active(itemId: ChaosItemId): Setup {
  const base = closeChaosShopping(stocked(itemId));
  let state: ReturnType<typeof createChaosGame> = { ...base, turnPhase: "turn_complete", selectedUid: "a", eventId: "safe" };
  let input: Setup["input"] = {};
  let random = 0.5;
  switch (itemId) {
    case "holy-shield": case "second-chance": case "final-verdict": state = { ...state, turn: 5, turnPhase: "reaction_window", eventId: "cursed" }; break;
    case "mirror-guard": case "reverse-card": case "time-rewind":
      state = { ...state, pendingAction: { actorUid: "b", targetUid: "a", kind: "curse", redirected: false, reflected: false } }; break;
    case "curse-cleanser": state.players.a.curse = 1; break;
    case "safe-passage": state = { ...state, turnPhase: "ready" }; break;
    case "guardian-angel": case "iron-will": case "last-stand": break;
    case "chaos-bomb": case "freeze-spell": case "curse-transfer": case "target-mark": case "mischief-dice": case "destiny-swap": case "secret-pact": case "item-sabotage": case "chaos-auction":
      input = { targetUid: "b" }; break;
    case "eris-thief": state = { ...state, phase: "shopping", players: { ...state.players, a: { ...state.players.a, eris: 80 }, b: { ...state.players.b, eris: 8 } } }; input = { targetUid: "b" }; break;
    case "lucky-charm": case "lucky-seven": case "treasure-blessing": break;
    case "fate-insurance": state = { ...state, turnPhase: "player_spin" }; break;
    case "fortune-cookie": state = { ...state, turnPhase: "player_spin" }; input = { predeterminedEventId: "safe" }; break;
    case "probability-shift": state = { ...state, turnPhase: "player_spin" }; input = { eventCategory: "safe" }; break;
    case "re-spin-token": state = { ...state, turnPhase: "player_spin" }; random = 0.99; break;
    case "wheel-brake": case "spin-delay": case "chaos-compass": case "wheel-peek": case "royal-decree": state = { ...state, turnPhase: "ready" }; break;
    case "double-spin": state = { ...state, turnPhase: "player_spin" }; break;
    case "emergency-escape": state = { ...state, turnPhase: "player_spin" }; break;
  }
  if (itemId === "lucky-seven") state.players.a.curse = 7;
  if (itemId === "mischief-dice") { state.players.b.eris = 10; random = 0; }
  if (itemId === "wheel-brake") state.players.b.weightNext = 1.5;
  if (itemId === "item-sabotage") {
    state.itemOwners["chaos-bomb"] = "b";
    state.players.b.items = ["chaos-bomb"];
    input = { targetUid: "b", targetItemId: "chaos-bomb" };
  }
  if (itemId === "royal-decree") input = { candidateUids: ["a", "b", "c"] };
  if (itemId === "target-mark" || itemId === "lucky-charm") state = { ...state, turnPhase: "ready" };
  if (itemId === "treasure-blessing") state = { ...state, phase: "shopping" };
  if (itemId === "chaos-auction") {
    state = purchaseChaosItem(state.phase === "shopping" ? state : { ...state, phase: "shopping" }, "a", "holy-shield");
    state.itemOwners["curse-cleanser"] = "b";
    state.players.b.items = ["curse-cleanser"];
    input = { targetUid: "b", offeredItemId: "holy-shield", targetItemId: "curse-cleanser" };
  }
  if (itemId === "curse-transfer") state.players.a.curse = 1;
  if (itemId === "last-stand") {
    state.players.a.curse = 3;
    state.itemOwners[itemId] = "a";
    state.players.a.items = [itemId];
  }
  if (itemId === "chaos-compass" || itemId === "wheel-peek") state.players.b.weightNext = 2;
  return { state, input, random };
}

describe("Wheel of Chaos item effects", () => {
  it("allows a player to use a targeted attack during the opening shop", () => {
    const shopping = purchaseChaosItem(startChaosShopping(createChaosGame(players)), "a", "eris-thief");
    const result = activateChaosItem(shopping, "a", "eris-thief", { targetUid: "b" }).state;
    expect(result.players.a.eris).toBe(90);
    expect(result.players.b.eris).toBe(90);
    expect(result.history.at(-1)).toBe("item:a:eris-thief:b");
  });

  it("requires a named eligible opponent for a player-targeted item", () => {
    const state = { ...stocked("eris-thief"), eligibleUids: ["a", "b", "c"] };
    expect(getChaosItemTargetOptions(state, "a", "eris-thief").targetUids).toEqual(["b", "c"]);
    for (const targetUid of [undefined, "a", "d", "unknown"]) {
      expect(() => activateChaosItem(state, "a", "eris-thief", { targetUid })).toThrow("Invalid target");
    }
    const result = activateChaosItem(state, "a", "eris-thief", { targetUid: "c" }).state;
    expect(result.players.c.eris).toBe(90);
    expect(result.players.b.eris).toBe(100);
  });

  it("only sabotages an unused offensive item owned by the selected eligible opponent", () => {
    const { state } = active("item-sabotage");
    state.players.b.items.push("target-mark", "holy-shield");
    state.players.c.items.push("freeze-spell");
    Object.assign(state.itemOwners, { "target-mark": "b", "holy-shield": "b", "freeze-spell": "c" });
    state.usedItems.push("target-mark");
    state.eligibleUids = ["a", "b"];
    const options = getChaosItemTargetOptions(state, "a", "item-sabotage");
    expect(options.targetUids).toEqual(["b"]);
    expect(options.targetItemsByUid.b).toEqual(["chaos-bomb"]);
    for (const targetItemId of [undefined, "target-mark", "holy-shield", "freeze-spell"] as const) {
      expect(() => activateChaosItem(state, "a", "item-sabotage", { targetUid: "b", targetItemId })).toThrow("No eligible offensive item");
    }
  });

  it("requires a separate unused item from each player for an auction", () => {
    const { state, input } = active("chaos-auction");
    const options = getChaosItemTargetOptions(state, "a", "chaos-auction");
    expect(options.offeredItemIds).toEqual(["holy-shield"]);
    expect(options.targetUids).toEqual(["b"]);
    expect(options.targetItemsByUid.b).toEqual(["curse-cleanser"]);
    expect(() => activateChaosItem(state, "a", "chaos-auction", { ...input, offeredItemId: "chaos-auction" })).toThrow("Proposal unavailable");
    expect(() => activateChaosItem(state, "a", "chaos-auction", { ...input, targetItemId: "holy-shield" })).toThrow("Proposal unavailable");
  });

  it("records and names who a targeted or reflected item was used against", () => {
    const bomb = active("chaos-bomb");
    const attacked = activateChaosItem(bomb.state, "a", "chaos-bomb", bomb.input).state;
    expect(attacked.history.at(-1)).toBe("item:a:chaos-bomb:b");

    for (const itemId of ["mirror-guard", "reverse-card", "time-rewind"] as const) {
      const setup = active(itemId);
      const reflected = activateChaosItem(setup.state, "a", itemId).state;
      expect(reflected.history.at(-1)).toBe(`item:a:${itemId}:b`);
    }

    expect(formatChaosHistory(attacked.history.at(-1)!, uid => uid === "a" ? "พลอย" : "นก"))
      .toBe("พลอย ใช้ระเบิดมหาภัย ใส่ นก");
  });

  it("executes each of the 35 distinct abilities and consumes the item", () => {
    expect(CHAOS_ITEMS).toHaveLength(35);
    expect(new Set(CHAOS_ITEMS.map(item => item.mechanic)).size).toBe(35);
    for (const item of CHAOS_ITEMS) {
      const { state, input, random } = active(item.id);
      if (item.id === "last-stand") {
        expect(() => activateChaosItem(state, "a", item.id)).toThrow("automatically");
        const result = resolveChaosEvent({ ...state, turnPhase: "reaction_window", eventId: "cursed" });
        expect(result.players.a.curse).toBe(3);
        expect(result.usedItems).toContain(item.id);
        expect(result.lastStandUids).toContain("a");
        continue;
      }
      let activation: ReturnType<typeof activateChaosItem>;
      try { activation = activateChaosItem(state, "a", item.id, input, random); }
      catch (error) { throw new Error(`${item.id} failed: ${error instanceof Error ? error.message : String(error)}`); }
      const result = activation.state;
      expect(result.usedItems, item.name).toContain(item.id);
      switch (item.id) {
        case "holy-shield": case "final-verdict": expect(result.eventId).toBe("safe"); break;
        case "mirror-guard": expect(result.pendingAction?.reflected).toBe(true); break;
        case "second-chance": expect(result.replacedThisTurn).toBe(true); break;
        case "curse-cleanser": expect(result.players.a.curse).toBe(0); break;
        case "safe-passage": expect(result.safePassageUid).toBe("a"); break;
        case "guardian-angel": expect(result.guardianUids).toContain("a"); break;
        case "iron-will": expect(result.statusGuardUids).toContain("a"); break;
        case "chaos-bomb": expect(resolveChaosPendingAction(result).players.b.curse).toBe(1); break;
        case "freeze-spell": expect(resolveChaosPendingAction(result).players.b.frozenUntilTurn).toBe(2); break;
        case "eris-thief": expect(result.players.a.eris).toBe(88); expect(result.players.b.eris).toBe(0); break;
        case "curse-transfer": expect(resolveChaosPendingAction(result).players.a.curse).toBe(0); expect(result.pendingAction?.targetUid).toBe("b"); break;
        case "reverse-card": expect(result.pendingAction?.redirected).toBe(true); break;
        case "target-mark": expect(result.players.b.weightNext).toBe(1.5); break;
        case "mischief-dice": expect(result.players.b.eris).toBe(5); break;
        case "lucky-charm": expect(result.players.a.weightNext).toBe(0.6); break;
        case "fortune-cookie": expect(activation.privateResult).toHaveLength(2); break;
        case "destiny-swap": expect(result.proposal?.kind).toBe("curse-swap"); break;
        case "lucky-seven": expect(result.players.a.curse).toBe(4); break;
        case "probability-shift": expect(result.eventCategoryShift).toBe("safe"); break;
        case "treasure-blessing": expect(result.players.a.eris).toBe(100); break;
        case "fate-insurance": expect(result.insuranceUids).toContain("a"); break;
        case "re-spin-token": expect(result.selectedUid).not.toBe("a"); break;
        case "wheel-brake": expect(result.players.b.weightNext).toBe(1); break;
        case "double-spin": expect(result.bonusEventsRemaining).toBe(1); break;
        case "time-rewind": expect(result.pendingAction).toBeNull(); break;
        case "chaos-compass": expect(activation.privateResult).toMatchObject({ count: 7, highestWeightUid: "b" }); break;
        case "wheel-peek": expect(activation.privateResult).toHaveLength(7); break;
        case "spin-delay": expect(result.delayedSpin).toBe(true); expect(result.spinDelayUsed).toBe(true); break;
        case "royal-decree": expect(result.subsetUids).toEqual(["a", "b", "c"]); break;
        case "secret-pact": expect(respondChaosProposal(result, "b", true).pactPairs).toHaveLength(1); break;
        case "item-sabotage": expect(result.disabledItems).toContain("chaos-bomb"); break;
        case "emergency-escape": expect(result.selectedUid).not.toBe("a"); break;
        case "chaos-auction": expect(respondChaosProposal(result, "b", true).itemOwners["holy-shield"]).toBe("b"); break;
      }
    }
  });

  it("rejects every item outside its activation window", () => {
    for (const item of CHAOS_ITEMS) {
      const { state } = active(item.id);
      expect(() => activateChaosItem({ ...state, phase: "setup" }, "a", item.id), item.name).toThrow("Wrong activation window");
    }
  });

  it("rejects prototype property names for activated and targeted items", () => {
    const chaosBomb = closeChaosShopping(stocked("chaos-bomb"));
    expect(() => activateChaosItem(chaosBomb, "a", "toString" as ChaosItemId)).toThrow("Unknown item");
    const sabotage = active("item-sabotage");
    expect(() => activateChaosItem(sabotage.state, "a", "item-sabotage", { ...sabotage.input, targetItemId: "toString" as ChaosItemId })).toThrow("Unknown item");
  });

  it("keeps a Fortune Cookie result private and rewards insurance only after Curse increases", () => {
    const cookie = active("fortune-cookie");
    expect(activateChaosItem(cookie.state, "a", "fortune-cookie", cookie.input).privateResult).toHaveLength(2);
    const insurance = active("fate-insurance");
    const armed = activateChaosItem(insurance.state, "a", "fate-insurance").state;
    const cursed = resolveChaosEvent({ ...armed, turnPhase: "reaction_window", selectedUid: "a", eventId: "cursed" });
    expect(cursed.players.a.curse).toBe(1);
    expect(cursed.players.a.eris).toBe(95);
    expect(cursed.insuranceUids).not.toContain("a");
  });

  it("does not pay insurance when a shield prevents the Curse increase", () => {
    const insurance = active("fate-insurance");
    const armed = activateChaosItem(insurance.state, "a", "fate-insurance").state;
    const shielded = resolveChaosEvent({ ...armed, players: { ...armed.players, a: { ...armed.players.a, shieldCharges: 1 } }, turnPhase: "reaction_window", selectedUid: "a", eventId: "cursed" });
    expect(shielded.players.a.eris).toBe(80);
    expect(shielded.players.a.curse).toBe(0);
  });

  it("applies Guardian Angel, Last Stand, and insurance to item attacks", () => {
    const armed = { ...createChaosGame(players), guardianUids: ["b"] };
    armed.players.b.curse = 2;
    const lowerCurse = applyChaosCurse(armed, "b");
    expect(lowerCurse.state.players.b.curse).toBe(3);
    expect(lowerCurse.state.guardianUids).toContain("b");

    const bombState = { ...closeChaosShopping(stocked("chaos-bomb")), turnPhase: "turn_complete" as const };
    const bomb = activateChaosItem(bombState, "a", "chaos-bomb", { targetUid: "b" }).state;
    const guarded = resolveChaosPendingAction({
      ...bomb,
      players: { ...bomb.players, b: { ...bomb.players.b, curse: 3 } },
      guardianUids: ["b"],
    });
    expect(guarded.players.b.curse).toBe(3);
    expect(guarded.guardianUids).toEqual([]);

    const standing = resolveChaosPendingAction({
      ...bomb,
      players: { ...bomb.players, b: { ...bomb.players.b, curse: 3, items: ["last-stand"] } },
      itemOwners: { ...bomb.itemOwners, "last-stand": "b" },
    });
    expect(standing.players.b.curse).toBe(3);
    expect(standing.usedItems).toContain("last-stand");
    expect(standing.lastStandUids).toContain("b");

    const insured = resolveChaosPendingAction({
      ...bomb,
      insuranceUids: ["b"],
    });
    expect(insured.players.b.curse).toBe(1);
    expect(insured.players.b.eris).toBe(115);
    expect(insured.insuranceUids).toEqual([]);
  });

  it("does not transfer a Curse through a target Guardian Angel", () => {
    const stockedTransfer = { ...closeChaosShopping(stocked("curse-transfer")), turnPhase: "turn_complete" as const };
    stockedTransfer.players.a.curse = 1;
    const transfer = activateChaosItem(stockedTransfer, "a", "curse-transfer", { targetUid: "b" }).state;
    const result = resolveChaosPendingAction({
      ...transfer,
      players: {
        ...transfer.players,
        a: { ...transfer.players.a, curse: 1 },
        b: { ...transfer.players.b, curse: 3 },
      },
      guardianUids: ["b"],
    });
    expect(result.players.a.curse).toBe(1);
    expect(result.players.b.curse).toBe(3);
  });
});
