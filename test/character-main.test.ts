import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MessageFlags } from "discord.js";

import { CharacterLinks, CharacterLinkStore, type CharacterLink } from "../src/character-links.js";
import { mainPicker, handleCharacterMain } from "../src/character-main.js";
import { CharacterSync } from "../src/character-sync.js";
import { initialRosterState } from "../src/roster-state.js";

const member = { id: "1", name: "Anvil", slug: "anvil", level: 20, className: "Warrior", rank: 2 };
const profile = { checkedAt: 2_000, characters: [{ id: "1", name: "Anvil", className: "Warrior", professions: [] }] };
const link: CharacterLink = { guildId: "20", discordUserId: "30", region: "us", verifiedAt: 1_000, characters: [{ id: "1", name: "Anvil" }], profile };

function request(options: { customId?: string; userId?: string; guildId?: string | null; values?: string[] } = {}) {
  const replies: unknown[] = [];
  const deferred: unknown[] = [];
  const interaction = {
    customId: options.customId ?? "guildhead:main:30:0",
    guildId: options.guildId === undefined ? "20" : options.guildId,
    user: { id: options.userId ?? "30" },
    ...(options.values === undefined ? {} : { values: options.values }),
    deferReply: async (value: unknown) => { deferred.push(value); },
    editReply: async (value: unknown) => { replies.push(value); },
  } as unknown as Parameters<typeof handleCharacterMain>[0];
  return { interaction, replies, deferred };
}

test("shows all owned characters through private paginated main selection, with no arbitrary character input", () => {
  const many = { ...link, profile: { ...profile, characters: Array.from({ length: 26 }, (_, index) => ({ ...profile.characters[0]!, id: String(index + 1), name: `Anvil ${index}` })) } };
  const first = mainPicker(many, 0);
  const second = mainPicker(many, 1);
  assert.equal(first.components[0]?.toJSON().components.length, 1);
  assert.match(JSON.stringify(first), /Anvil 24/);
  assert.doesNotMatch(JSON.stringify(first), /Anvil 25/);
  assert.match(JSON.stringify(second), /Anvil 25/);
  assert.match(JSON.stringify(mainPicker({ ...link, mainCharacterId: "1" }, 0)), /"default":true/);
  for (const page of [-1, 2, 0.5]) assert.throws(() => mainPicker(many, page), /no longer/);
});

test("binds main controls to the initiating Discord user/server and reports gated or successful role setup", async context => {
  context.mock.method(console, "error", () => {});
  const path = await mkdtemp(join(tmpdir(), "guildhead-main-"));
  const store = new CharacterLinkStore(path);
  const roster = async () => initialRosterState([member]);
  const links = new CharacterLinks(store, { authorizationUrl: state => state, ownedCharacters: async () => new Set(["1"]) }, roster, "us");
  const disabled = new CharacterSync(store, { characterProfessions: async () => [] }, roster, "20", "us", undefined, () => 2_000);
  const enabled = new CharacterSync(store, { characterProfessions: async () => [] }, roster, "20", "us", { sync: async () => {}, clear: async () => {} }, () => 2_000);
  const run = async (value: ReturnType<typeof request>, service: CharacterSync | undefined = disabled, ownership: CharacterLinks | undefined = links) => {
    await handleCharacterMain(value.interaction, ownership, service);
    assert.deepEqual(value.deferred, [{ flags: MessageFlags.Ephemeral }]);
    return JSON.stringify(value.replies);
  };
  try {
    await store.save(link);
    assert.match(await run(request()), /Choose your main/);
    assert.match(await run(request({ values: ["1"] })), /awaiting server-operator/);
    assert.equal((await store.get("20", "30"))?.mainCharacterId, "1");
    assert.match(await run(request({ values: ["1"] }), enabled), /roles are updated/);
    for (const options of [{ userId: "31" }, { guildId: null }, { customId: "bad" }]) {
      assert.match(await run(request(options)), /Use your own/);
    }
    const missing = request();
    await handleCharacterMain(missing.interaction, undefined, disabled);
    assert.match(JSON.stringify(missing.replies), /Use your own/);
    const unavailable = request();
    await handleCharacterMain(unavailable.interaction, links, undefined);
    assert.match(JSON.stringify(unavailable.replies), /Use your own/);
    assert.match(await run(request({ values: [] })), /exactly one/);
    assert.match(await run(request({ values: ["999"] })), /not in your synced/);
    assert.match(await run(request({ guildId: "21", values: ["1"] })), /Could not update/);
    await store.remove("20", "30");
    assert.match(await run(request()), /No current synced/);
  } finally { await rm(path, { recursive: true }); }
});
