import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, type Client, type WebhookClient } from "discord.js";
import { buildCommandPost, CommandPosts, parseCommandPosts } from "../src/command-posts.js";

const config = {
  dataDir: "/unused", commandChannelId: "1", commandPostChannelIds: new Set(["1", "2"]),
  channelIds: new Set(["2"]), helpCommandName: "guide", commandName: "lookup",
  craftCommandName: "crafters", lfgCommandName: "group", rosterCommandName: "guild",
  characterCommandName: "toon",
};

function discordError(code: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: "Discord request failed" }, code, 404, "PATCH",
    "https://discord.com/api/v10/channels/1/messages/100", { body: undefined, files: [] });
}

function fixture() {
  let nextId = 100;
  const messages = new Map<string, { id: string; pinned: boolean }>();
  const actions: string[] = [];
  let editError: Error | undefined;
  let pinError = false;
  const send = async (channelId: string, response: { allowedMentions: { parse: unknown[] } }) => {
    assert.deepEqual(response.allowedMentions, { parse: [] });
    const message = { id: String(nextId++), pinned: false };
    messages.set(message.id, message);
    actions.push(`send:${channelId}`);
    return message;
  };
  const edit = async (messageId: string) => {
    if (editError) throw editError;
    const message = messages.get(messageId);
    if (!message) throw discordError(RESTJSONErrorCodes.UnknownMessage);
    actions.push(`edit:${messageId}`);
    return message;
  };
  const channels = new Map(["1", "2"].map(id => [id, {
    type: ChannelType.GuildText,
    send: (response: { allowedMentions: { parse: unknown[] } }) => send(id, response),
    messages: {
      edit,
      pin: async (messageId: string) => {
        if (pinError) throw new Error("Missing pin permission");
        messages.get(messageId)!.pinned = true;
        actions.push(`pin:${messageId}`);
      },
    },
  }]));
  const client = { channels: { fetch: async (id: string) => channels.get(id) } } as unknown as Pick<Client, "channels">;
  const webhook = { id: "99", send: (response: { allowedMentions: { parse: unknown[] } }) => send("2", response), editMessage: edit } as unknown as WebhookClient;
  return {
    messages, actions, channels, client, webhook,
    failEdit: (error?: Error) => { editError = error; },
    failPin: (fail: boolean) => { pinError = fail; },
  };
}

test("builds a concise voluntary command guide with full configured commands and source/privacy links", () => {
  const embed = buildCommandPost(config).toJSON();
  const text = JSON.stringify(embed);
  for (const command of ["/guide", "/lookup query:Hearthstone", "/crafters find profession:Blacksmithing",
    "/group list", "/guild", "/toon link", "/toon main", "/toon unlink"]) assert.ok(text.includes(command));
  assert.match(text, /<#1>/);
  assert.match(text, /not here to police/);
  assert.match(text, /https:\/\/github.com\/corigne\/guildhead/);
  assert.match(JSON.stringify(buildCommandPost({ ...config, lfgChannelId: "789" }).toJSON()), /browse recent posts in <#789>/);
  for (const field of embed.fields!) assert.ok(field.value.length <= 1024);
  const { commandChannelId: _channel, ...withoutChannel } = config;
  assert.match(buildCommandPost(withoutChannel).toJSON().description!, /wherever this server permits/);
});

test("validates persisted message references without accepting malformed state", () => {
  const state = { version: 1, posts: { "1": { messageId: "100" }, "2": { messageId: "101", webhookId: "99" } } };
  assert.deepEqual(parseCommandPosts(state), state);
  for (const value of [
    null, [], {}, { version: 2, posts: {} }, { version: 1, posts: null }, { version: 1, posts: [] },
    { version: 1, posts: { bad: {} } },
    ...[null, [], {}, { messageId: 1 }, { messageId: "bad" }, { messageId: "1", webhookId: 1 },
      { messageId: "1", webhookId: "bad" }].map(post => ({ version: 1, posts: { "1": post } })),
  ]) assert.throws(() => parseCommandPosts(value));
});

test("pins bot/webhook guides, reuses them after restart, repairs unpins, and replaces only deleted messages", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-posts-"));
  const f = fixture();
  const make = () => new CommandPosts(f.client, { ...config, dataDir: path }, async () => f.webhook);
  try {
    await make().refresh();
    assert.equal(f.messages.size, 2);
    assert.ok([...f.messages.values()].every(message => message.pinned));
    const state = parseCommandPosts(JSON.parse(await readFile(join(path, "command-posts.json"), "utf8")));
    assert.equal(state.posts["2"]?.webhookId, "99");
    const restarted = make();
    await restarted.refresh();
    assert.equal(f.actions.filter(action => action.startsWith("send:")).length, 2);
    f.messages.get(state.posts["1"]!.messageId)!.pinned = false;
    await restarted.refresh();
    assert.equal(f.actions.filter(action => action.startsWith("pin:")).length, 3);
    f.messages.delete(state.posts["2"]!.messageId);
    await restarted.refresh();
    assert.equal(f.actions.filter(action => action.startsWith("send:")).length, 3);
    assert.equal(f.messages.size, 2);
  } finally { await rm(path, { recursive: true }); }
});

test("retains references on permission/network failures, refuses transport changes, and never resets corrupt state", async context => {
  context.mock.method(console, "error", () => {});
  const path = await mkdtemp(join(tmpdir(), "guildhead-post-errors-"));
  const f = fixture();
  const posts = new CommandPosts(f.client, { ...config, dataDir: path }, async () => f.webhook);
  try {
    f.failPin(true);
    await posts.refresh();
    assert.equal(f.messages.size, 2);
    f.failPin(false);
    await posts.refresh();
    assert.ok([...f.messages.values()].every(message => message.pinned));
    for (const error of [new Error("Network"), discordError(RESTJSONErrorCodes.MissingPermissions)]) {
      f.failEdit(error);
      await posts.refresh();
      assert.equal(f.messages.size, 2);
    }
    f.failEdit();
    await new CommandPosts(f.client, { ...config, dataDir: path, channelIds: new Set(["1", "2"]) }, async () => f.webhook).refresh();
    assert.equal(f.messages.size, 2);
    f.channels.delete("1");
    f.channels.get("2")!.type = ChannelType.DM as ChannelType.GuildText;
    await posts.refresh();
    assert.equal(f.messages.size, 2);
    const corrupt = "{bad";
    await writeFile(join(path, "command-posts.json"), corrupt);
    await posts.refresh();
    assert.equal(await readFile(join(path, "command-posts.json"), "utf8"), corrupt);
  } finally { await rm(path, { recursive: true }); }
});

test("skips overlapping refreshes and schedules bounded periodic repair", async context => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-post-overlap-"));
  const f = fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  context.mock.method(f.client.channels, "fetch", async () => { entered.resolve(); await release.promise; return f.channels.get("1"); });
  const posts = new CommandPosts(f.client, { ...config, dataDir: path, commandPostChannelIds: new Set(["1"]), channelIds: new Set() }, async () => f.webhook);
  try {
    const first = posts.refresh();
    await entered.promise;
    await posts.refresh();
    release.resolve();
    await first;
    assert.equal(f.messages.size, 1);
    let calls = 0;
    context.mock.method(posts, "refresh", async () => { calls += 1; });
    context.mock.timers.enable({ apis: ["setInterval"] });
    const interval = posts.start();
    assert.equal(calls, 1);
    context.mock.timers.tick(10 * 60_000);
    assert.equal(calls, 2);
    clearInterval(interval);
  } finally { await rm(path, { recursive: true }); }
});
