import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ApplicationCommandOptionType,
  MessageFlags,
  type Client,
  type EmbedBuilder,
} from "discord.js";

import type { GuildRosterConfig } from "../src/config.js";
import { saveRosterState } from "../src/guild-roster.js";
import { buildRosterCommand, handleRosterCommand } from "../src/roster-command.js";
import { initialRosterState } from "../src/roster-state.js";

const member = {
  id: "1", name: "Pepper Oni", slug: "pepper-oni",
  level: 32, className: "Mage", rank: 0,
};
const config = {
  guildName: "Guild", announcementChannelId: "123", pollMinutes: 10,
} as GuildRosterConfig;
const discord = {
  channels: { fetch: async () => ({ guildId: "20" }) },
} as unknown as Pick<Client, "channels">;

function interaction(options: {
  guildId?: string | null;
  name?: string;
  class?: string;
  level?: number;
  rank?: number;
} = {}) {
  const replies: Array<string | { embeds: EmbedBuilder[]; allowedMentions: { parse: string[] } }> = [];
  const deferred: unknown[] = [];
  const value = {
    guildId: options.guildId === undefined ? "20" : options.guildId,
    options: {
      getString: (name: "name" | "class") => options[name] ?? null,
      getInteger: (name: "level" | "rank") => options[name] ?? null,
    },
    deferReply: async (reply: unknown) => { deferred.push(reply); },
    editReply: async (reply: typeof replies[number]) => { replies.push(reply); },
  } as unknown as Parameters<typeof handleRosterCommand>[0];
  return { value, replies, deferred };
}

test("advertises private roster filters with guild-only command context", () => {
  const command = buildRosterCommand("guild-roster").toJSON();
  assert.equal(command.name, "guild-roster");
  assert.deepEqual(command.contexts, [0]);
  assert.deepEqual(command.options?.map((option) => option.name), ["name", "class", "level", "rank"]);
  const classes = command.options?.[1];
  assert.equal(classes?.type, ApplicationCommandOptionType.String);
  if (classes?.type !== ApplicationCommandOptionType.String) assert.fail("Expected class choices");
  assert.equal(classes.choices?.length, 9);
  assert(classes.choices?.some((choice) => choice.value === "Mage"));
  const level = command.options?.[2];
  const rank = command.options?.[3];
  if (level?.type !== ApplicationCommandOptionType.Integer ||
      rank?.type !== ApplicationCommandOptionType.Integer) assert.fail("Expected numeric filters");
  assert.equal(level.min_value, 1);
  assert.equal(rank.min_value, 0);
});

test("restricts saved roster access to the configured server and handles missing setup", async () => {
  for (const [options, settings, channel, expected] of [
    [{ guildId: null }, config, { guildId: "20" }, /not a direct message/],
    [{}, undefined, null, /not configured/],
    [{ guildId: "99" }, config, { guildId: "20" }, /only available in the server/],
    [{}, config, null, /only available in the server/],
    [{}, config, {}, /only available in the server/],
  ] as const) {
    const request = interaction(options);
    let fetched = false;
    await handleRosterCommand(request.value, {
      channels: { fetch: async () => { fetched = true; return channel; } },
    } as unknown as Pick<Client, "channels">, settings);
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    assert.match(JSON.stringify(request.replies), expected);
    assert.equal(fetched, options.guildId !== null && settings !== undefined);
  }
});

test("searches combined filters, preserves rank zero, and labels snapshot age", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-command-"));
  const settings = { ...config, dataDir };
  const run = async (filters: Parameters<typeof interaction>[0] = {}) => {
    const request = interaction(filters);
    await handleRosterCommand(request.value, discord, settings);
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    const reply = request.replies[0];
    if (typeof reply === "string" || !reply) assert.fail("Expected roster embed");
    assert.deepEqual(reply.allowedMentions, { parse: [] });
    return reply.embeds[0]!.toJSON();
  };
  try {
    const missing = interaction();
    await handleRosterCommand(missing.value, discord, settings);
    assert.match(JSON.stringify(missing.replies), /first successful Blizzard poll/);
    const baseline = initialRosterState([
      member,
      { ...member, id: "2", name: "*Anvil*", slug: "anvil", level: 60, rank: 2, className: "Warrior" },
      { ...member, id: "3", name: "Pepper Mint", slug: "pepper-mint", level: 33, rank: 2 },
    ]);
    await saveRosterState(settings, { ...baseline, checkedAt: Date.now() });
    const all = await run();
    assert.match(all.description!, /\\\*Anvil\\\*/);
    assert(all.description!.indexOf("Anvil") < all.description!.indexOf("Pepper"));
    assert.match(all.fields![1]!.value, /Last successful stored poll: <t:/);
    assert.doesNotMatch(all.fields![1]!.value, /Stale/);
    assert.match((await run({ name: "  pEpPeR  ", class: "Mage", level: 32, rank: 0 })).description!, /Pepper Oni/);
    assert.match((await run({ name: "no match" })).description!, /No characters match/);
    assert.match((await run({ class: "Priest" })).description!, /No characters match/);
    assert.match((await run({ level: 1 })).description!, /No characters match/);
    assert.match((await run({ rank: 9 })).description!, /No characters match/);
    assert.match((await run({ name: " " })).fields![0]!.value, /3 of 3/);
    await saveRosterState(settings, { ...baseline, checkedAt: Date.now() - 21 * 60_000 });
    assert.match((await run()).fields![1]!.value, /Stale snapshot/);
    await saveRosterState(settings, baseline);
    assert.match((await run()).fields![1]!.value, /age unknown/);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("bounds large roster responses and does not include pending joins", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-command-"));
  const settings = { ...config, dataDir };
  try {
    await saveRosterState(settings, {
      ...initialRosterState(Array.from({ length: 30 }, (_, index) => ({
        ...member, id: String(index + 1), name: "*".repeat(300), className: "*".repeat(300),
      }))),
      observations: { "join:99": 1 },
    });
    const request = interaction();
    await handleRosterCommand(request.value, discord, settings);
    const reply = request.replies[0];
    if (typeof reply === "string" || !reply) assert.fail("Expected roster embed");
    const embed = reply.embeds[0]!.toJSON();
    assert.match(embed.fields![0]!.value, /30 of 30.*first 15/);
    assert.equal(embed.description!.split("\n").length, 15);
    assert(embed.description!.length < 4096);
    assert.doesNotMatch(embed.description!, /99/);
    await saveRosterState(settings, initialRosterState([]));
    const empty = interaction();
    await handleRosterCommand(empty.value, discord, settings);
    assert.match(JSON.stringify(empty.replies), /0 of 0/);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("reports corrupt storage or inaccessible channels without exposing internal details", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-command-"));
  const settings = { ...config, dataDir };
  const originalError = console.error;
  const errors: unknown[] = [];
  console.error = (...values: unknown[]) => { errors.push(values); };
  try {
    await writeFile(join(dataDir, "guild-roster-guild.json"), "{bad");
    const corrupt = interaction();
    await handleRosterCommand(corrupt.value, discord, settings);
    assert.match(JSON.stringify(corrupt.replies), /Try again later/);
    assert.doesNotMatch(JSON.stringify(corrupt.replies), /JSON|guild-roster-guild/);
    const unavailable = interaction();
    await handleRosterCommand(unavailable.value, {
      channels: { fetch: async () => { throw new Error("Missing Access"); } },
    } as unknown as Pick<Client, "channels">, settings);
    assert.match(JSON.stringify(unavailable.replies), /Try again later/);
    assert.equal(errors.length, 2);
  } finally {
    console.error = originalError;
    await rm(dataDir, { recursive: true });
  }
});
