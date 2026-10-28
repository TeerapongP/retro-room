import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBoard, getOwnMembership, joinBoard } from "@/lib/firebase/boards";
import { getPlayerName, savePlayerName } from "@/lib/firebase/profile";
import { createTestUser, resetEmulators, type TestUser } from "./helpers";

let newcomer: TestUser;
let owner: TestUser;

beforeEach(async () => {
  await resetEmulators();
  newcomer = await createTestUser("newcomer", "Google Real Name", { withPlayerName: false });
  owner = await createTestUser("owner", "Owner");
});

afterEach(async () => {
  await resetEmulators();
});

describe("player name setup", () => {
  it(`should report no player name when a user has not chosen one`, async () => {
    expect(await getPlayerName(newcomer.uid, newcomer.db)).toBeNull();
  });

  it(`should reject instead of reporting no name when reading another user's profile is denied`, async () => {
    await expect(getPlayerName(owner.uid, newcomer.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it(`should save the trimmed player name and read it back when the user chooses one`, async () => {
    const saved = await savePlayerName(newcomer.user, "  ชาวนาน้อย  ", newcomer.db);

    expect(saved).toBe("ชาวนาน้อย");
    expect(await getPlayerName(newcomer.uid, newcomer.db)).toBe("ชาวนาน้อย");
  });

  it(`should reject an invalid name before writing when it is empty, blank, or too long`, async () => {
    await expect(savePlayerName(newcomer.user, "", newcomer.db)).rejects.toThrow("Invalid player name");
    await expect(savePlayerName(newcomer.user, "   ", newcomer.db)).rejects.toThrow("Invalid player name");
    await expect(
      savePlayerName(newcomer.user, "x".repeat(21), newcomer.db),
    ).rejects.toThrow("Invalid player name");
    expect(await getPlayerName(newcomer.uid, newcomer.db)).toBeNull();
  });

  it(`should deny changing the name when it was already chosen`, async () => {
    await savePlayerName(newcomer.user, "First", newcomer.db);

    await expect(savePlayerName(newcomer.user, "Second", newcomer.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(await getPlayerName(newcomer.uid, newcomer.db)).toBe("First");
  });

  it(`should deny creating a board or joining before a player name is chosen`, async () => {
    await expect(
      createBoard(newcomer.user, "Early board", "Google Real Name", newcomer.db),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const boardId = await createBoard(owner.user, "Owner board", owner.name, owner.db);
    await expect(
      joinBoard(boardId, newcomer.user, "Google Real Name", newcomer.db),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it(`should deny joining with a different name than the chosen player name`, async () => {
    await savePlayerName(newcomer.user, "Chosen", newcomer.db);
    const boardId = await createBoard(owner.user, "Owner board", owner.name, owner.db);

    await expect(joinBoard(boardId, newcomer.user, "Impostor", newcomer.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(joinBoard(boardId, newcomer.user, "Chosen", newcomer.db)).resolves.toBeUndefined();
  });

  it(`should keep the chosen name in the member list`, async () => {
    await savePlayerName(newcomer.user, "Chosen", newcomer.db);
    const boardId = await createBoard(owner.user, "Owner board", owner.name, owner.db);
    await joinBoard(boardId, newcomer.user, "Chosen", newcomer.db);

    expect(await getOwnMembership(boardId, newcomer.uid, newcomer.db)).toMatchObject({
      displayName: "Chosen",
      role: "member",
    });
  });
});
