import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CharacterLinkStore, type CharacterLink } from "../src/character-links.js";
import { CharacterSync } from "../src/character-sync.js";
import { initialRosterState } from "../src/roster-state.js";

const member = { id: "1", name: "Anvil", slug: "anvil", level: 20, className: "Warrior", rank: 2 };
const link: CharacterLink = {
  guildId: "20", discordUserId: "30", region: "us", verifiedAt: 1_000,
  characters: [{ id: "1", name: "Anvil" }, { id: "2", name: "Left Guild" }],
};
const skills = [
  { name: "Blacksmithing" as const, skill: 131, maxSkill: 150 },
  { name: "Mining" as const, skill: 148, maxSkill: 225 },
];

test("syncs confirmed owned profiles, caches public data for six hours, and publishes only after main selection", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-sync-"));
  const store = new CharacterLinkStore(path);
  let now = 2_000;
  let roster = initialRosterState([member]);
  let calls = 0;
  const roles: CharacterLink[] = [];
  const sync = new CharacterSync(store, {
    characterProfessions: async (slug, id) => {
      assert.equal(slug, "anvil"); assert.equal(id, "1"); calls += 1; return skills;
    },
  }, async () => roster, "20", "us", { sync: async value => { roles.push(value); }, clear: async () => {} }, () => now);
  try {
    await store.save({ ...link, guildId: "21" });
    await store.save(link);
    await sync.syncOwner("20", "999");
    await assert.rejects(sync.syncOwner("21", "30"), /server mismatch/);
    assert.deepEqual(await sync.findCrafters("21", "Blacksmithing"), []);
    assert.deepEqual(await sync.findCrafters("20", "Blacksmithing"), []);
    await sync.syncOwner("20", "30");
    assert.equal(calls, 1);
    assert.equal(roles.length, 0);
    await sync.syncOwner("20", "30");
    assert.equal(calls, 1);
    await sync.selectMain("20", "30", "1");
    assert.equal(calls, 2);
    assert.equal(roles.length, 1);
    const listings = await sync.findCrafters("20", "Blacksmithing");
    assert.equal(listings.length, 1);
    assert.equal(listings[0]?.skill, 131);
    assert.equal(listings[0]?.ownershipCheckedAt, 1_000);
    assert.equal((await sync.findCrafters("20", "Mining"))[0]?.skill, 148);
    assert.deepEqual(await sync.findCrafters("20", "Alchemy"), []);
    now += 6 * 60 * 60_000;
    await sync.syncOwner("20", "30");
    assert.equal(calls, 3);
    roster = initialRosterState([]);
    assert.deepEqual(await sync.findCrafters("20", "Blacksmithing"), []);
    await sync.syncOwner("20", "30");
    assert.deepEqual(roles.at(-1)?.profile?.characters, []);
    await sync.syncOwner("20", "30", true);
    assert.deepEqual((await store.get("20", "30"))?.profile?.characters, []);
    await store.save({ ...link, region: "eu" });
    await assert.rejects(sync.syncOwner("20", "30"), /region mismatch/);
    assert.deepEqual(await sync.findCrafters("20", "Blacksmithing"), []);
    const noRoster = new CharacterSync(store, { characterProfessions: async () => skills }, async () => undefined, "20", "eu");
    await assert.rejects(noRoster.syncOwner("20", "30"), /No confirmed/);
    assert.deepEqual(await noRoster.findCrafters("20", "Blacksmithing"), []);
    assert.equal(await noRoster.clearRoles("20", "30"), true);
  } finally { await rm(path, { recursive: true }); }
});

test("serializes retries and unlink cleanup without resurrecting proofs or losing the last good snapshot", async context => {
  context.mock.method(console, "error", () => {});
  const path = await mkdtemp(join(tmpdir(), "guildhead-sync-race-"));
  const store = new CharacterLinkStore(path);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  let failCleanup = false;
  const sync = new CharacterSync(store, {
    characterProfessions: async () => {
      calls += 1;
      if (calls === 1) { entered.resolve(); await release.promise; throw new Error("upstream"); }
      return skills;
    },
  }, async () => initialRosterState([member]), "20", "us", {
    sync: async () => {},
    clear: async () => { if (failCleanup) throw new Error("role cleanup"); },
  }, () => 2_000);
  try {
    await store.save(link);
    const first = sync.syncOwner("20", "30", true);
    await entered.promise;
    const second = sync.syncOwner("20", "30", true);
    release.resolve();
    await assert.rejects(first, /upstream/);
    await second;
    assert.equal((await store.get("20", "30"))?.profile?.characters[0]?.id, "1");
    assert.equal(await sync.clearRoles("20", "30"), true);
    failCleanup = true;
    assert.equal(await sync.clearRoles("20", "30"), false);
    const waiting = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const slow = new CharacterSync(store, {
      characterProfessions: async () => { waiting.resolve(); await finish.promise; return skills; },
    }, async () => initialRosterState([member]), "20", "us", {
      sync: async () => { assert.fail("Unlinked users must not receive roles"); },
      clear: async () => {},
    }, () => 3_000);
    const work = slow.syncOwner("20", "30", true);
    await waiting.promise;
    await store.remove("20", "30");
    const cleanup = slow.clearRoles("20", "30");
    finish.resolve();
    await work;
    assert.equal(await cleanup, true);
    assert.equal(await store.get("20", "30"), undefined);
    await store.save(link);
    const failingEntered = Promise.withResolvers<void>();
    const failingRelease = Promise.withResolvers<void>();
    const failing = new CharacterSync(store, {
      characterProfessions: async () => { failingEntered.resolve(); await failingRelease.promise; throw new Error("upstream"); },
    }, async () => initialRosterState([member]), "20", "us", { sync: async () => {}, clear: async () => {} });
    const failed = failing.syncOwner("20", "30", true);
    await failingEntered.promise;
    const afterFailure = failing.clearRoles("20", "30");
    failingRelease.resolve();
    await assert.rejects(failed, /upstream/);
    assert.equal(await afterFailure, true);
  } finally { await rm(path, { recursive: true }); }
});

test("polls linked owners, skips overlapping passes, survives errors, and schedules recurring reconciliation", async context => {
  context.mock.method(console, "error", () => {});
  const path = await mkdtemp(join(tmpdir(), "guildhead-sync-poll-"));
  const store = new CharacterLinkStore(path);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let complete = Promise.withResolvers<void>();
  let calls = 0;
  const sync = new CharacterSync(store, {
    characterProfessions: async () => { calls += 1; entered.resolve(); await release.promise; return skills; },
  }, async () => initialRosterState([member]), "20", "us", {
    sync: async () => { complete.resolve(); }, clear: async () => {},
  }, () => 2_000);
  try {
    await store.save({ ...link, rolesManaged: true });
    await store.save({ ...link, guildId: "21" });
    const polling = sync.poll();
    await entered.promise;
    await sync.poll();
    assert.equal(calls, 1);
    release.resolve();
    await polling;
    context.mock.timers.enable({ apis: ["setInterval"] });
    complete = Promise.withResolvers<void>();
    const interval = sync.start();
    await complete.promise;
    await setImmediate();
    complete = Promise.withResolvers<void>();
    context.mock.timers.tick(10 * 60_000);
    await complete.promise;
    await setImmediate();
    clearInterval(interval);
    await store.save({ ...link, region: "eu" });
    await sync.poll();
    await writeFile(join(path, "character-links.json"), "{bad");
    await sync.poll();
  } finally { await rm(path, { recursive: true }); }
});
