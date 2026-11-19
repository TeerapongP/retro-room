import { describe, expect, it } from "vitest";
import { activateChaosItem, chooseRandomChaosItemTarget } from "../../lib/chaos/effects";
import { closeChaosShopping, createChaosGame, purchaseChaosItem, startChaosShopping } from "../../lib/chaos/state";

describe("random Chaos item targets", () => {
  it("selects an eligible opponent without allowing the user to target themselves", () => {
    const game = { ...closeChaosShopping(purchaseChaosItem(startChaosShopping(createChaosGame(["a", "b", "c"])), "a", "chaos-bomb")), turnPhase: "turn_complete" as const };
    const selected = chooseRandomChaosItemTarget(game, "a", "chaos-bomb", () => 0.99);
    const activated = activateChaosItem(game, "a", "chaos-bomb", selected).state;

    expect(selected).toEqual({ targetUid: "c" });
    expect(activated.pendingAction?.targetUid).toBe("c");
  });

  it("randomly selects an unused offensive item for Item Sabotage", () => {
    let game = startChaosShopping(createChaosGame(["a", "b", "c"]));
    game = purchaseChaosItem(game, "a", "item-sabotage");
    game = purchaseChaosItem(game, "b", "chaos-bomb");
    game = purchaseChaosItem(game, "c", "freeze-spell");
    game = { ...closeChaosShopping(game), turnPhase: "turn_complete" };

    const selected = chooseRandomChaosItemTarget(game, "a", "item-sabotage", () => 0.99);
    const activated = activateChaosItem(game, "a", "item-sabotage", selected).state;
    expect(selected).toEqual({
      targetUid: "c",
      targetItemId: "freeze-spell",
    });
    expect(activated.disabledItems).toContain("freeze-spell");
  });

  it("randomly chooses the partner and both items for Chaos Auction", () => {
    let game = startChaosShopping(createChaosGame(["a", "b", "c"]));
    game = purchaseChaosItem(game, "a", "chaos-auction");
    game = purchaseChaosItem(game, "a", "holy-shield");
    game = purchaseChaosItem(game, "b", "curse-cleanser");
    game = purchaseChaosItem(game, "c", "mirror-guard");

    const selected = chooseRandomChaosItemTarget(game, "a", "chaos-auction", () => 0.99);
    const activated = activateChaosItem(game, "a", "chaos-auction", selected).state;
    expect(selected).toEqual({
      targetUid: "c",
      targetItemId: "mirror-guard",
      offeredItemId: "holy-shield",
    });
    expect(activated.proposal).toMatchObject({ kind: "trade", targetUid: "c", targetItemId: "mirror-guard", actorItemId: "holy-shield" });
  });

  it("rejects random targeting when there is no eligible opponent", () => {
    const game = closeChaosShopping(purchaseChaosItem(startChaosShopping(createChaosGame(["a"])), "a", "chaos-bomb"));
    expect(() => chooseRandomChaosItemTarget(game, "a", "chaos-bomb", () => 0)).toThrow("No eligible target");
  });
});
