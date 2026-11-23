import assert from "node:assert/strict";
import test from "node:test";

import { BlizzardClient } from "../src/blizzard.js";
import type { GuildRosterConfig } from "../src/config.js";
import { parseBlizzardProfessions, parseProfileSnapshot } from "../src/professions.js";

const skill = { name: "Blacksmithing", skill: 131, maxSkill: 150 };
const entry = { profession: { id: 164 }, tiers: [{ skill_points: 131, max_skill_points: 150 }] };
const response = { character: { id: 1 }, primaries: [entry], secondaries: [] };
const character = { id: "1", name: "Anvil", className: "Warrior", professions: [skill] };
const snapshot = { checkedAt: 1_000, characters: [character] };

test("validates Forever profession skills and character identity without trusting names or API links", () => {
  assert.deepEqual(parseBlizzardProfessions(response, "1"), [skill]);
  assert.deepEqual(parseBlizzardProfessions({ ...response, primaries: [], secondaries: [entry] }, "1"), [skill]);
  assert.deepEqual(parseBlizzardProfessions({ ...response, primaries: [{ ...entry, profession: { id: 9999 } }] }, "1"), []);
  for (const value of [
    null, [], {}, { ...response, character: null }, { ...response, character: { id: "1" } },
    { ...response, character: { id: 1.5 } }, { ...response, character: { id: 0 } },
    { ...response, character: { id: 2 } }, { ...response, primaries: {} }, { ...response, secondaries: {} },
    ...[null, { ...entry, profession: null }, ...["164", 0, 1.5].map(id => ({ ...entry, profession: { id } })),
      { ...entry, tiers: null }, { ...entry, tiers: [] }, { ...entry, tiers: [{}, {}] },
      ...[null, { skill_points: "1", max_skill_points: 150 }, { skill_points: -1, max_skill_points: 150 },
        { skill_points: 1.5, max_skill_points: 150 }, { skill_points: 131, max_skill_points: "150" },
        { skill_points: 131, max_skill_points: 150.5 }, { skill_points: 131, max_skill_points: 0 },
        { skill_points: 151, max_skill_points: 150 }].map(tier => ({ ...entry, tiers: [tier] })),
    ].map(item => ({ ...response, primaries: [item] })),
    { ...response, primaries: [entry, entry] },
  ]) assert.throws(() => parseBlizzardProfessions(value, "1"));
});

test("validates persisted public snapshots and rejects malformed or duplicated data", () => {
  assert.deepEqual(parseProfileSnapshot(snapshot), snapshot);
  assert.deepEqual(parseProfileSnapshot({ checkedAt: 1_000, characters: [] }).characters, []);
  for (const value of [
    null, [], {}, ...["1000", 0, 1.5, 8_640_000_000_000_001].map(checkedAt => ({ ...snapshot, checkedAt })),
    { ...snapshot, characters: {} }, { ...snapshot, characters: [character, character] },
    ...[null, { ...character, id: 1 }, { ...character, id: "bad" }, { ...character, name: null },
      { ...character, name: " " }, { ...character, className: null }, { ...character, className: "" },
      { ...character, professions: {} }, { ...character, professions: [skill, skill] },
      ...[null, { ...skill, name: "Unknown" }, { ...skill, skill: -1 }].map(profession => ({ ...character, professions: [profession] })),
    ].map(item => ({ ...snapshot, characters: [item] })),
  ]) assert.throws(() => parseProfileSnapshot(value));
});

test("fetches fixed regional profession endpoints with app tokens, encoded slugs, and response validation", async context => {
  for (const region of ["us", "eu"] as const) {
    let fail = false;
    const calls: string[] = [];
    context.mock.method(globalThis, "fetch", async (input: string | URL, options: RequestInit) => {
      const url = new URL(input);
      calls.push(url.href);
      if (url.hostname === "oauth.battle.net") return Response.json({ access_token: "app-token", expires_in: 3600 });
      assert.equal(url.hostname, `${region}.api.blizzard.com`);
      assert.equal(url.pathname, "/profile/wow/character/anvil%2Fsmith/professions");
      assert.equal(url.searchParams.get("namespace"), `profile-forever-${region}`);
      assert.equal(url.searchParams.get("locale"), region === "eu" ? "en_GB" : "en_US");
      assert.equal((options.headers as Record<string, string>).Authorization, "Bearer app-token");
      return Response.json(response, { status: fail ? 503 : 200 });
    });
    const client = new BlizzardClient({ region, clientId: "id", clientSecret: "secret" } as GuildRosterConfig);
    assert.deepEqual(await client.characterProfessions("anvil/smith", "1"), [skill]);
    fail = true;
    await assert.rejects(client.characterProfessions("anvil/smith", "1"), /503/);
    assert.equal(calls.filter(url => url.includes("oauth.battle.net")).length, 1);
    context.mock.restoreAll();
  }
});
