import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MessageFlags, type Client, type EmbedBuilder } from "discord.js";

import { buildCharacterCommand, handleCharacterCommand } from "../src/character-command.js";
import { CharacterLinks, CharacterLinkStore } from "../src/character-links.js";
import type { GuildRosterConfig } from "../src/config.js";
import { initialRosterState } from "../src/roster-state.js";

const config = { announcementChannelId: "40" } as GuildRosterConfig;
const discord = { channels: { fetch: async () => ({ guildId: "20" }) } } as unknown as Pick<Client, "channels">;
function interaction(action: string, guildId: string | null = "20") {
  const replies: Array<string | { content: string; embeds?: EmbedBuilder[]; allowedMentions: { parse: string[] } }> = [];
  const deferred: unknown[] = [];
  const value = {
    guildId, user: { id: "30" }, commandName: "toon",
    options: { getSubcommand: () => action },
    deferReply: async (reply: unknown) => { deferred.push(reply); },
    editReply: async (reply: typeof replies[number]) => { replies.push(reply); },
  } as unknown as Parameters<typeof handleCharacterCommand>[0];
  return { value, replies, deferred };
}

test("advertises guild-only character linking, viewing, and unlinking without confirmation", () => {
  const command = buildCharacterCommand("toon").toJSON();
  assert.equal(command.name, "toon");
  assert.deepEqual(command.contexts, [0]);
  assert.deepEqual(command.options?.map(option => option.name), ["link", "refresh", "list", "unlink"]);
});

test("keeps character actions private and explains scope, retention, limitations, and revocation before authorization", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-character-command-"));
  const links = new CharacterLinks(new CharacterLinkStore(path), {
    authorizationUrl: state => `https://oauth.battle.net/authorize?state=${state}`,
    ownedCharacters: async () => new Set(["1"]),
  }, async () => initialRosterState([{ id: "1", name: "*Anvil*", slug: "anvil", level: 20, className: "Warrior", rank: 2 }]), "us");
  const run = async (action: string) => {
    const request = interaction(action);
    await handleCharacterCommand(request.value, discord, config, links);
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    return request.replies;
  };
  const authorize = async (action: string) => {
    const replies = await run(action);
    const json = JSON.stringify(replies);
    assert.match(json, /Keep this link private/);
    for (const disclosure of [
      /wow\.profile/, /10 minutes/, /automatically after authorization/,
      /Saved links remain until you unlink/, /not automatically refreshed/,
      /do not receive your password or authenticator codes/,
      /or save access\/refresh tokens/, /cannot play characters/,
      /No other feature uses these links yet/, /Revoke app permission separately/,
      /\/toon list/, /\/toon unlink/, /\/toon refresh/, /failed refresh keeps your saved links/,
    ]) assert.match(json, disclosure);
    assert.doesNotMatch(json, /\/toon confirm/);
    const response = replies[0] as Exclude<typeof replies[number], string>;
    assert.ok(response.content.length <= 2000);
    assert.deepEqual(response.allowedMentions, { parse: [] });
    assert.ok(response.content.indexOf("**Before you authorize**") < response.content.indexOf("<https:"));
    assert.ok(response.content.indexOf("Revoke app permission") < response.content.indexOf("<https:"));
    const url = new URL(response.content.match(/<(https:[^>]+)>/)![1]!);
    await links.callback(url.searchParams.get("state")!, "code");
  };
  try {
    assert.match(JSON.stringify(await run("list")), /No linked characters/);
    await authorize("link");
    const saved = await run("list");
    assert.match(JSON.stringify(saved), /Anvil/);
    assert.match(JSON.stringify(saved), /dated check/);
    assert.match(JSON.stringify(await run("list")), /Linked guild characters/);
    await authorize("refresh");
    assert.match(JSON.stringify(await run("list")), /Linked guild characters/);
    assert.match(JSON.stringify(await run("unlink")), /pending logins are removed/);
    assert.match(JSON.stringify(await run("obsolete")), /Unknown character action/);
    for (let index = 0; index < 1_000; index += 1) links.start("21", String(index + 1));
    assert.match(JSON.stringify(await run("refresh")), /Too many pending logins/);
  } finally { await rm(path, { recursive: true }); }
});

test("rejects DMs, missing configuration, other servers, unavailable channels, and corrupt storage", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-character-command-"));
  const links = new CharacterLinks(new CharacterLinkStore(path), {
    authorizationUrl: state => state, ownedCharacters: async () => new Set(),
  }, async () => undefined, "us");
  try {
    for (const [guildId, settings, service] of [
      [null, config, links], ["20", undefined, links], ["20", config, undefined],
    ] as const) {
      const request = interaction("link", guildId);
      await handleCharacterCommand(request.value, discord, settings, service);
      assert.match(JSON.stringify(request.replies), /configured Battle.net HTTPS callback/);
    }
    for (const channel of [null, {}, { guildId: "99" }]) {
      const request = interaction("link");
      await handleCharacterCommand(request.value, {
        channels: { fetch: async () => channel },
      } as unknown as Pick<Client, "channels">, config, links);
      assert.match(JSON.stringify(request.replies), /only available in the server/);
    }
    const denied = interaction("link");
    await handleCharacterCommand(denied.value, {
      channels: { fetch: async () => { throw new Error("sensitive details"); } },
    } as unknown as Pick<Client, "channels">, config, links);
    assert.doesNotMatch(JSON.stringify(denied.replies), /sensitive/);
    await writeFile(join(path, "character-links.json"), "{bad");
    const corrupt = interaction("list");
    await handleCharacterCommand(corrupt.value, discord, config, links);
    assert.match(JSON.stringify(corrupt.replies), /Try again later/);
  } finally { await rm(path, { recursive: true }); }
});
