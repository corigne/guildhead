import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CrafterDirectory, parseCrafterState } from "../src/crafter-directory.js";

test("registers, updates, finds, and removes crafters", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guildhead-crafters-"));
  const crafters = new CrafterDirectory(directory);

  try {
    await crafters.register({
      guildId: "10",
      discordUserId: "123",
      characterName: "Anvil",
      profession: "Blacksmithing",
      notes: "Armorsmith",
    });
    await crafters.register({
      guildId: "10",
      discordUserId: "123",
      characterName: "Anvil",
      profession: "Blacksmithing",
      notes: "Weaponsmith",
    });
    await crafters.register({
      guildId: "10",
      discordUserId: "456",
      characterName: "Bellows",
      profession: "Blacksmithing",
    });

    const matches = await crafters.find("10", "Blacksmithing");
    assert.equal(matches.length, 2);
    assert.deepEqual(
      matches.map((listing) => listing.characterName),
      ["Anvil", "Bellows"],
    );
    assert.equal(matches[0]?.notes, "Weaponsmith");
    assert.equal(await crafters.remove("10", "123", "Blacksmithing"), true);
    assert.deepEqual(
      (await crafters.find("10", "Blacksmithing")).map(
        (listing) => listing.characterName,
      ),
      ["Bellows"],
    );
    assert.equal(await crafters.remove("10", "456", "Blacksmithing"), true);
    assert.deepEqual(await crafters.find("10", "Blacksmithing"), []);
    assert.equal(await crafters.remove("10", "123", "Blacksmithing"), false);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("rejects malformed persisted crafter state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guildhead-crafters-"));
  const crafters = new CrafterDirectory(directory);

  try {
    await writeFile(join(directory, "crafters.json"), '{"version":3}');
    await assert.rejects(
      crafters.find("10", "Alchemy"),
      /unsupported shape/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

const listing = {
  guildId: "10",
  discordUserId: "123",
  characterName: "Anvil",
  profession: "Blacksmithing" as const,
};

test("isolates servers, owners, professions, and alts while serializing concurrent writes", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-crafters-"));
  const crafters = new CrafterDirectory(path);
  try {
    await Promise.all([
      crafters.register(listing),
      crafters.register({ ...listing, characterName: "Bellows" }),
      crafters.register({ ...listing, guildId: "20" }),
      crafters.register({ ...listing, discordUserId: "456" }),
      crafters.register({ ...listing, profession: "Alchemy" }),
    ]);
    assert.equal((await crafters.find("10", "Blacksmithing")).length, 3);
    assert.equal((await crafters.find("20", "Blacksmithing")).length, 1);
    assert.deepEqual(await crafters.find("99", "Blacksmithing"), []);
    await crafters.register({ ...listing, characterName: "  aNViL  ", notes: "Updated" });
    const stored = await crafters.find("10", "Blacksmithing");
    assert.equal(stored.length, 3);
    assert.equal(stored.find(entry => entry.discordUserId === "123" && entry.notes)?.characterName, "aNViL");
    const before = await readFile(join(path, "crafters.json"), "utf8");
    await assert.rejects(crafters.remove("10", "123", "Blacksmithing"), /multiple characters/);
    assert.equal(await readFile(join(path, "crafters.json"), "utf8"), before);
    assert.equal(await crafters.remove("10", "123", "Blacksmithing", "  ANVIL "), true);
    assert.equal((await crafters.find("10", "Blacksmithing")).length, 2);
    assert.equal((await crafters.find("20", "Blacksmithing")).length, 1);
    assert.equal((await crafters.find("10", "Alchemy")).length, 1);
    assert.equal(await crafters.remove("10", "789", "Blacksmithing", "Bellows"), false);
    assert.equal(await crafters.remove("10", "123", "Blacksmithing", "missing"), false);
    assert.equal(await crafters.remove("10", "123", "Blacksmithing"), true);
    const restarted = new CrafterDirectory(path);
    assert.equal((await restarted.find("10", "Blacksmithing"))[0]?.discordUserId, "456");
    await assert.rejects(crafters.register({ ...listing, guildId: "invalid" }), /server ID/);
    await crafters.register(listing);
    assert.equal((await crafters.find("10", "Blacksmithing")).length, 2);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("quarantines legacy listings without assigning a server or losing data across writes and restarts", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-crafters-"));
  const crafters = new CrafterDirectory(path);
  const legacy = {
    discordUserId: "123", characterName: "Anvil", profession: "Blacksmithing",
    notes: "Old listing", updatedAt: "2026-11-23T12:00:00.000Z",
  };
  const oldFile = JSON.stringify({ version: 1, listings: [legacy] });
  try {
    await writeFile(join(path, "crafters.json"), oldFile);
    assert.deepEqual(await crafters.find("10", "Blacksmithing"), []);
    assert.equal(await crafters.remove("10", "123", "Blacksmithing"), false);
    assert.equal(await readFile(join(path, "crafters.json"), "utf8"), oldFile);
    await crafters.register(listing);
    const state = parseCrafterState(JSON.parse(await readFile(join(path, "crafters.json"), "utf8")));
    assert.deepEqual(state.legacyListings, [legacy]);
    assert.equal(state.listings.length, 1);
    const restarted = new CrafterDirectory(path);
    assert.deepEqual(await restarted.find("20", "Blacksmithing"), []);
    assert.equal((await restarted.find("10", "Blacksmithing")).length, 1);
    await restarted.remove("10", "123", "Blacksmithing", "Anvil");
    const saved = parseCrafterState(JSON.parse(await readFile(join(path, "crafters.json"), "utf8")));
    assert.deepEqual(saved.legacyListings, [legacy]);
    assert.deepEqual(saved.listings, []);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("validates persisted crafter fields, scoped identity, and supported schema versions", () => {
  const saved = { ...listing, updatedAt: "2026-11-23T12:00:00.000Z" };
  const state = { version: 2, listings: [saved], legacyListings: [] };
  assert.deepEqual(parseCrafterState(state), state);
  const invalid: unknown[] = [
    null, [], 42,
    { ...state, version: 3 },
    { ...state, listings: null },
    { ...state, legacyListings: null },
    { ...state, listings: [saved, { ...saved, characterName: "  ANVIL" }] },
    ...[
      null, { ...saved, discordUserId: 123 }, { ...saved, discordUserId: "invalid" },
      { ...saved, characterName: 42 }, { ...saved, characterName: " " },
      { ...saved, characterName: "a".repeat(25) },
      { ...saved, profession: "invalid" },
      { ...saved, notes: 42 }, { ...saved, notes: "a".repeat(121) },
      { ...saved, updatedAt: 42 }, { ...saved, updatedAt: "not a date" },
      { ...saved, guildId: undefined }, { ...saved, guildId: "invalid" },
    ].map((entry) => ({ ...state, listings: [entry] })),
    { version: 1, listings: [{ ...saved, notes: 42 }] },
    { ...state, legacyListings: [null] },
  ];
  for (const value of invalid) {
    assert.throws(() => parseCrafterState(value));
  }
});
