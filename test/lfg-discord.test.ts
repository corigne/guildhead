import assert from "node:assert/strict";
import test from "node:test";

import {
  ChannelType,
  DiscordAPIError,
  RESTJSONErrorCodes,
  type WebhookClient,
} from "discord.js";

import { DiscordLfgTransport } from "../src/lfg-discord.js";
import type { LfgPost } from "../src/lfg-directory.js";

const group = {
  id: "1",
  guildId: "2",
  ownerId: "3",
  activity: "*Deadmines*",
  capacity: 5,
  memberIds: ["3", "7"],
  expiresAt: Date.now() + 60_000,
};

function harness(linkedChannels: string[] = []) {
  const sent: { method: string; args: unknown[] }[] = [];
  const state = {
    channel: undefined as unknown,
    webhookId: "6",
    error: undefined as unknown,
  };
  const send = async (...args: unknown[]) => {
    sent.push({ method: "send", args });
    return { id: "5" };
  };
  const edit = async (...args: unknown[]) => {
    if (state.error !== undefined) throw state.error;
    sent.push({ method: "edit", args });
  };
  const channel = {
    type: ChannelType.GuildText,
    guildId: "2",
    isSendable: () => true,
    send,
    messages: { edit },
  };
  state.channel = channel;
  const client = {
    channels: { fetch: async () => state.channel },
    users: {
      fetch: async (id: string) => {
        assert.equal(id, "3");
        return { send };
      },
    },
  } as unknown as ConstructorParameters<typeof DiscordLfgTransport>[0];
  const transport = new DiscordLfgTransport(
    client,
    new Set(linkedChannels),
    async () => ({
      id: state.webhookId,
      send,
      editMessage: edit,
    }) as unknown as WebhookClient,
    "party",
  );
  return { transport, state, sent, channel };
}

test("publishes and edits ordinary channel posts without mention pings", async () => {
  const { transport, sent } = harness();
  const announcement = await transport.publish(group, "4");
  assert.deepEqual(announcement, { channelId: "4", messageId: "5" });
  assert.equal(await transport.edit({ group, announcement, status: "open" }), true);
  assert.deepEqual(sent.map((entry) => entry.method), ["send", "edit"]);
  const response = sent[0]?.args[0] as {
    embeds: { toJSON: () => unknown }[];
    allowedMentions: { parse: string[] };
  };
  assert.deepEqual(response.allowedMentions.parse, []);
  assert.match(JSON.stringify(response.embeds[0]?.toJSON()), /party join/);
  assert.equal(sent[1]?.args[0], "5");
});

test("uses managed webhooks for linked channels and validates stored identity", async () => {
  const { transport, state, sent } = harness(["4"]);
  const announcement = await transport.publish(group, "4");
  assert.deepEqual(announcement, { channelId: "4", messageId: "5", webhookId: "6" });
  assert.equal(await transport.edit({ group, announcement, status: "closed" }), true);
  assert.equal(sent[1]?.args[0], "5");
  state.webhookId = "9";
  await assert.rejects(
    transport.edit({ group, announcement, status: "open" }),
    /webhook no longer matches/,
  );
});

test("rejects unavailable or cross-server destinations", async () => {
  const { transport, state } = harness();
  for (const channel of [
    null,
    { isSendable: () => false },
    { isSendable: () => true },
    { isSendable: () => true, guildId: "99" },
  ]) {
    state.channel = channel;
    await assert.rejects(transport.publish(group, "4"), /same server/);
    await assert.rejects(
      transport.edit({
        group, announcement: { channelId: "4", messageId: "5" }, status: "open",
      }),
      /unavailable or in another server/,
    );
  }
});

test("rejects non-text webhook channels without posting elsewhere", async () => {
  const { transport, state, channel } = harness(["4"]);
  state.channel = { ...channel, type: ChannelType.PublicThread };
  await assert.rejects(transport.publish(group, "4"), /guild text channel/);
  await assert.rejects(
    transport.edit({
      group,
      announcement: { channelId: "4", messageId: "5", webhookId: "6" },
      status: "open",
    }),
    /guild text channel/,
  );
});

function discordError(code: number): DiscordAPIError {
  return new DiscordAPIError(
    { code, message: "Discord request failed" },
    code,
    404,
    "PATCH",
    "https://discord.com/api/v10/channels/4/messages/5",
    { files: [], body: "{}" },
  );
}

test("recognizes deleted messages but preserves retryable transport errors", async () => {
  const { transport, state } = harness();
  const post: LfgPost = {
    group, announcement: { channelId: "4", messageId: "5" }, status: "open",
  };
  state.error = discordError(RESTJSONErrorCodes.UnknownMessage);
  assert.equal(await transport.edit(post), false);
  state.error = discordError(RESTJSONErrorCodes.MissingPermissions);
  await assert.rejects(transport.edit(post), /Discord request failed/);
  state.error = new Error("Network failure");
  await assert.rejects(transport.edit(post), /Network failure/);
});

test("DMs leaders on joins and departures using the configured command name", async () => {
  const { transport, sent } = harness();
  await transport.notify(group, "7", "join");
  await transport.notify(group, "7", "leave");
  assert.match(JSON.stringify(sent[0]), /joined/);
  assert.match(JSON.stringify(sent[1]), /left/);
  assert.match(JSON.stringify(sent), /party show/);
  const message = sent[0]?.args[0] as { allowedMentions: { parse: string[] } };
  assert.deepEqual(message.allowedMentions.parse, []);
});
