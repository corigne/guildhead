import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CharacterLinks, CharacterLinkStore, parseCharacterLinks } from "../src/character-links.js";
import { initialRosterState } from "../src/roster-state.js";

const member = { id: "1", name: "Pepper Oni", slug: "pepper-oni", level: 32, className: "Mage", rank: 0 };
const link = { guildId: "20", discordUserId: "30", region: "us" as const, verifiedAt: 1_000, characters: [{ id: "1", name: "Pepper Oni" }] };
const client = {
  authorizationUrl: (state: string) => `https://oauth.battle.net/authorize?state=${state}`,
  ownedCharacters: async () => new Set(["1", "999"]),
};
const roster = async () => initialRosterState([member, { ...member, id: "2", name: "Someone Else" }]);
const nonce = (url: string) => new URL(url).searchParams.get("state")!;

test("stores only scoped character links, preserves other owners, and recovers after storage errors", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-links-"));
  const store = new CharacterLinkStore(path);
  try {
    assert.equal(await store.get("20", "30"), undefined);
    assert.equal(await store.remove("20", "30"), false);
    await store.save(link);
    await store.save({ ...link, discordUserId: "31" });
    await store.save({ ...link, guildId: "21" });
    await store.save({ ...link, verifiedAt: 2_000 });
    assert.equal((await new CharacterLinkStore(path).get("20", "30"))?.verifiedAt, 2_000);
    assert.equal(await store.remove("20", "30"), true);
    assert(await store.get("20", "31"));
    assert(await store.get("21", "30"));
    await writeFile(join(path, "character-links.json"), "{bad");
    await assert.rejects(store.get("20", "30"));
    await writeFile(join(path, "character-links.json"), '{"version":1,"links":[]}');
    await store.save(link);
    assert.deepEqual(await store.get("20", "30"), link);
  } finally { await rm(path, { recursive: true }); }
});

test("automatically retains only owned guild characters for the requesting Discord user and server", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-links-"));
  const store = new CharacterLinkStore(path);
  let ownedIds = new Set(["1", "999"]);
  let now = 1_000;
  const links = new CharacterLinks(store, {
    ...client, ownedCharacters: async () => ownedIds,
  }, roster, "us", () => now);
  try {
    const state = nonce(links.start("20", "30"));
    await links.callback(state, "code");
    const savedLink = await store.get("20", "30");
    assert.deepEqual(savedLink?.characters, [{ id: "1", name: "Pepper Oni" }]);
    assert.deepEqual(await new CharacterLinkStore(path).get("20", "30"), savedLink);
    await assert.rejects(links.callback(state, "replay"), /already used/);
    assert.equal(await links.list("21", "30"), undefined);
    assert.equal(await links.list("20", "31"), undefined);
    assert.deepEqual(await links.list("20", "30"), savedLink);
    ownedIds = new Set(["2"]);
    now = 2_000;
    await links.callback(nonce(links.start("20", "30")), "new-code");
    const refreshed = await links.list("20", "30");
    assert.deepEqual(refreshed?.characters, [{ id: "2", name: "Someone Else" }]);
    assert.equal(refreshed?.verifiedAt, 2_000);
    await assert.rejects(links.callback(nonce(links.start("20", "30")), null), /declined/);
    assert.deepEqual(await links.list("20", "30"), refreshed);
    assert.equal(await links.unlink("20", "30"), true);
    assert.equal(await links.list("20", "30"), undefined);
    const saved = await readFile(join(path, "character-links.json"), "utf8");
    assert(!saved.includes("999"));
  } finally { await rm(path, { recursive: true }); }
});

test("expires and replaces one-time states, handles denial, and bounds pending logins", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-links-"));
  let now = 1_000;
  const links = new CharacterLinks(new CharacterLinkStore(path), client, roster, "us", () => now);
  try {
    const old = nonce(links.start("20", "30"));
    const current = nonce(links.start("20", "30"));
    await assert.rejects(links.callback(old, "code"), /invalid/);
    await assert.rejects(links.callback(current, null), /declined/);
    await assert.rejects(links.callback(current, "code"), /invalid/);
    const expired = nonce(links.start("20", "30"));
    now += 600_000;
    await assert.rejects(links.callback(expired, "code"), /expired/);
    for (let index = 0; index < 1_000; index += 1) links.start("20", String(index + 1));
    assert.throws(() => links.start("21", "30"), /Too many/);
    now += 600_000;
    assert(links.start("21", "30"));
    assert.equal(await links.unlink("21", "30"), false);
  } finally { await rm(path, { recursive: true }); }
});

test("fails closed on absent rosters, mismatched ownership, and upstream errors without replacing saved proof", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-links-"));
  const store = new CharacterLinkStore(path);
  try {
    await store.save(link);
    for (const links of [
      new CharacterLinks(store, client, async () => undefined, "us"),
      new CharacterLinks(store, { ...client, ownedCharacters: async () => new Set(["999"]) }, roster, "us"),
      new CharacterLinks(store, { ...client, ownedCharacters: async () => { throw new Error("upstream"); } }, roster, "us"),
    ]) {
      const state = nonce(links.start("20", "30"));
      await assert.rejects(links.callback(state, "code"));
      await assert.rejects(links.callback(state, "again"), /invalid/);
      assert.deepEqual(await store.get("20", "30"), link);
    }
  } finally { await rm(path, { recursive: true }); }
});

test("unlink, replacement, and expiry cancel in-flight exchanges while saved links outlast login sessions", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-links-"));
  const store = new CharacterLinkStore(path);
  let now = 1_000;
  try {
    for (const cancel of ["unlink", "replace", "expire"] as const) {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const links = new CharacterLinks(store, {
        ...client, ownedCharacters: async () => { entered.resolve(); await release.promise; return new Set(["1"]); },
      }, roster, "us", () => now);
      const work = links.callback(nonce(links.start("20", "30")), "code");
      await entered.promise;
      if (cancel === "unlink") await links.unlink("20", "30");
      else if (cancel === "replace") links.start("20", "30");
      else now += 600_000;
      release.resolve();
      await assert.rejects(work, /cancelled or expired/);
      assert.equal(await store.get("20", "30"), undefined);
    }
    const links = new CharacterLinks(store, client, roster, "us", () => now);
    await links.callback(nonce(links.start("20", "30")), "code");
    now += 600_000;
    assert.deepEqual((await links.list("20", "30"))?.characters, link.characters);
  } finally { await rm(path, { recursive: true }); }
});

test("validates every retained ownership field and rejects ambiguous identities", () => {
  const state = { version: 1, links: [link] };
  assert.deepEqual(parseCharacterLinks(state), [link]);
  for (const value of [
    null, [], 1, {}, { ...state, version: 2 }, { version: 1 }, { ...state, links: {} },
    { ...state, links: [link, link] },
    ...[
      null, { ...link, guildId: 20 }, { ...link, guildId: "bad" },
      { ...link, discordUserId: "" }, { ...link, region: "bad" },
      ...["1000", 1.5, 0, 8_640_000_000_000_001].map(verifiedAt => ({ ...link, verifiedAt })),
      { ...link, characters: null }, { ...link, characters: [] },
      { ...link, characters: [link.characters[0], link.characters[0]] },
      ...[null, { id: 1, name: "A" }, { id: "bad", name: "A" }, { id: "1", name: 1 }, { id: "1", name: " " }]
        .map(character => ({ ...link, characters: [character] })),
    ].map(entry => ({ ...state, links: [entry] })),
  ]) assert.throws(() => parseCharacterLinks(value));
});
