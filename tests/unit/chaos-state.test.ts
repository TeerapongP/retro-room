import { describe, expect, it } from "vitest";
import { CHAOS_ITEMS, type ChaosItemId } from "../../lib/chaos/catalog";
import {
  closeChaosShopping,
  createChaosGame,
  finalHostProbabilities,
  nextChaosTurn,
  purchaseChaosItem,
  resolveChaosEvent,
  setChaosEligibility,
  spinChaosEvent,
  spinChaosPlayer,
  startChaosShopping,
  setFinalHostExclusions,
  selectFinalHost,
} from "../../lib/chaos/state";

const players = ["a", "b", "c", "d", "e", "f", "g"];

describe("Wheel of Chaos domain", () => {
  it("contains exactly 35 distinct item abilities", () => {
    expect(CHAOS_ITEMS).toHaveLength(35);
    expect(new Set(CHAOS_ITEMS.map(item => item.id)).size).toBe(35);
    expect(new Set(CHAOS_ITEMS.map(item => item.mechanic)).size).toBe(35);
    expect(CHAOS_ITEMS.every(item => item.price > 0 && item.price <= 100)).toBe(true);
  });

  it("accepts variable player counts and gives every selected player 100 Eris when shopping opens", () => {
    expect(() => createChaosGame([])).toThrow();
    expect(() => createChaosGame(["a", "a"])).toThrow();
    for (const count of [1, 3, 7]) {
      const selected = Array.from({ length: count }, (_, index) => `player-${index}`);
      const state = startChaosShopping(createChaosGame(selected));
      expect(Object.keys(state.players)).toHaveLength(count);
      expect(Object.values(state.players).map(player => player.eris)).toEqual(Array(count).fill(100));
    }
  });

  it("sells each item only once and does not charge a losing buyer", () => {
    const state = startChaosShopping(createChaosGame(players));
    const sold = purchaseChaosItem(state, "a", "holy-shield");
    expect(sold.players.a.eris).toBe(80);
    expect(() => purchaseChaosItem(sold, "b", "holy-shield")).toThrow("SOLD OUT");
    expect(sold.players.b.eris).toBe(100);
  });

  it("rejects prototype property names as item IDs", () => {
    const state = startChaosShopping(createChaosGame(players));
    expect(() => purchaseChaosItem(state, "a", "toString" as ChaosItemId)).toThrow("Unknown item");
  });

  it("expires unanswered proposals when their shopping or turn window closes", () => {
    const shopping = startChaosShopping(createChaosGame(players));
    const shoppingProposal = closeChaosShopping({
      ...shopping,
      proposal: { kind: "pact", actorUid: "a", targetUid: "b" },
    });
    expect(shoppingProposal.proposal).toBeNull();
    expect(shoppingProposal.history.at(-1)).toContain("proposal-expired");

    const turnProposal = nextChaosTurn({
      ...shoppingProposal,
      turn: 1,
      turnPhase: "turn_complete",
      proposal: { kind: "curse-swap", actorUid: "a", targetUid: "b" },
    });
    expect(turnProposal.proposal).toBeNull();
    expect(turnProposal.history.at(-1)).toContain("proposal-expired");
  });

  it("enforces eligibility, five slots, and affordability", () => {
    const state = startChaosShopping(setChaosEligibility(createChaosGame(players), ["a"]));
    expect(() => purchaseChaosItem(state, "b", "holy-shield")).toThrow();
    let bought = state;
    for (const id of ["fortune-cookie", "lucky-seven", "chaos-compass", "wheel-peek", "curse-cleanser"] as const) {
      bought = purchaseChaosItem(bought, "a", id);
    }
    expect(bought.players.a.items).toHaveLength(5);
    expect(() => purchaseChaosItem(bought, "a", "freeze-spell")).toThrow("Inventory limit");
  });

  it("allows eligibility changes before the first spin and after a completed turn only", () => {
    const firstRoundReady = closeChaosShopping(startChaosShopping(createChaosGame(players)));
    expect(setChaosEligibility(firstRoundReady, ["a", "b"]).eligibleUids).toEqual(["a", "b"]);
    expect(() => setChaosEligibility({ ...firstRoundReady, turnPhase: "player_spin", selectedUid: "a" }, ["b"])).toThrow("Eligibility is locked during a turn");
    expect(() => setChaosEligibility({ ...firstRoundReady, turn: 2 }, ["b"])).toThrow("Eligibility is locked during a turn");
  });

  it("advances five turns and excludes ineligible players from draws", () => {
    let state = closeChaosShopping(startChaosShopping(setChaosEligibility(createChaosGame(players), ["b"])));
    for (let turn = 1; turn <= 5; turn++) {
      state = spinChaosPlayer(state, 0.99);
      expect(state.selectedUid).toBe("b");
      state = spinChaosEvent(state, 0.01);
      state = resolveChaosEvent(state);
      state = nextChaosTurn(state);
    }
    expect(state.phase).toBe("final_host_selection");
    expect(state.players.b.curse).toBe(5);
  });

  it("resolves Double Trouble through one nonrecursive bonus event", () => {
    let state = closeChaosShopping(startChaosShopping(createChaosGame(players)));
    state = spinChaosPlayer(state, 0);
    state = spinChaosEvent(state, 0.88);
    expect(state.eventId).toBe("double-trouble");
    state = resolveChaosEvent(state);
    expect(state.turnPhase).toBe("event_spin");
    state = spinChaosEvent(state, 0.99);
    expect(state.eventId).not.toBe("double-trouble");
    state = resolveChaosEvent(state);
    expect(state.turnPhase).toBe("turn_complete");
  });

  it("never selects the current Host or an excluded prior Host", () => {
    let state = closeChaosShopping(startChaosShopping(createChaosGame(players)));
    for (let turn = 1; turn <= 5; turn++) {
      state = nextChaosTurn(resolveChaosEvent(spinChaosEvent(spinChaosPlayer(state, 0), 0.4)));
    }
    state = setFinalHostExclusions(state, ["b"], "a");
    expect(() => setFinalHostExclusions(state, players.filter(uid => uid !== "a"), "a")).toThrow("Invalid final Host exclusions");
    const distribution = finalHostProbabilities(state, "a");
    expect(distribution.map(entry => entry.uid)).toEqual(["c", "d", "e", "f", "g"]);
    expect(distribution.reduce((sum, entry) => sum + entry.probability, 0)).toBeCloseTo(1);
    const selected = selectFinalHost(state, "a", 0);
    expect(selected.selectedHostUid).toBe("c");
    expect(selectFinalHost(selected, "a", 0.99).selectedHostUid).toBe("c");
  });
});
