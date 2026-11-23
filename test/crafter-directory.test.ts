import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CrafterDirectory } from "../src/crafter-directory.js";

test("registers, updates, finds, and removes crafters", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guildhead-crafters-"));
  const crafters = new CrafterDirectory(directory);

  try {
    await crafters.register({
      discordUserId: "123",
      characterName: "Anvil",
      profession: "Blacksmithing",
      notes: "Armorsmith",
    });
    await crafters.register({
      discordUserId: "123",
      characterName: "Anvil",
      profession: "Blacksmithing",
      notes: "Weaponsmith",
    });
    await crafters.register({
      discordUserId: "456",
      characterName: "Bellows",
      profession: "Blacksmithing",
    });

    const matches = await crafters.find("Blacksmithing");
    assert.equal(matches.length, 2);
    assert.deepEqual(
      matches.map((listing) => listing.characterName),
      ["Anvil", "Bellows"],
    );
    assert.equal(matches[0]?.notes, "Weaponsmith");
    assert.equal(await crafters.remove("123", "Blacksmithing"), true);
    assert.deepEqual(
      (await crafters.find("Blacksmithing")).map(
        (listing) => listing.characterName,
      ),
      ["Bellows"],
    );
    assert.equal(await crafters.remove("456", "Blacksmithing"), true);
    assert.deepEqual(await crafters.find("Blacksmithing"), []);
    assert.equal(await crafters.remove("123", "Blacksmithing"), false);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("rejects malformed persisted crafter state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guildhead-crafters-"));
  const crafters = new CrafterDirectory(directory);

  try {
    await writeFile(join(directory, "crafters.json"), '{"version":2}');
    await assert.rejects(
      crafters.find("Alchemy"),
      /unsupported shape/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});
