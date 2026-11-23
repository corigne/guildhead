import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ApplicationCommandOptionType,
  ChannelType,
  MessageFlags,
  type EmbedBuilder,
  type WebhookClient,
} from "discord.js";

import { buildCraftCommand, handleCraftCommand } from "../src/craft-command.js";
import { CrafterDirectory } from "../src/crafter-directory.js";

type Response = { content?: string; embeds?: EmbedBuilder[]; flags?: number; allowedMentions?: { parse: string[] } };
function interaction(action: string, options: {
  character?: string | null;
  notes?: string | null;
  channel?: object | null;
  channelId?: string;
  guildId?: string | null;
  userId?: string;
  replied?: boolean;
  profession?: string;
} = {}) {
  const replies: Array<string | Response> = [];
  const deferred: unknown[] = [];
  const value = {
    commandName: "guild-craft",
    guildId: options.guildId === undefined ? "20" : options.guildId,
    channelId: options.channelId ?? "40",
    channel: options.channel === undefined ? { type: ChannelType.GuildText, guildId: "20" } : options.channel,
    user: { id: options.userId ?? "30" },
    replied: options.replied ?? false,
    deferred: false,
    options: {
      getSubcommand: () => action,
      getString: (name: string) => {
        if (name === "profession") return options.profession ?? "Blacksmithing";
        if (name === "character") return options.character === undefined
          ? (action === "register" ? "Anvil" : null) : options.character;
        return options.notes ?? null;
      },
    },
    reply: async (reply: Response) => { replies.push(reply); value.replied = true; },
    deferReply: async (reply: unknown) => { deferred.push(reply); value.deferred = true; },
    editReply: async (reply: string | Response) => { replies.push(reply); },
  };
  return { value: value as unknown as Parameters<typeof handleCraftCommand>[0], replies, deferred };
}
const unusedWebhook = async (): Promise<WebhookClient> => {
  assert.fail("This path must not use a webhook");
};

test("prefers synced skills without duplicating manual listings or presenting recipe notes as API facts", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-synced-craft-"));
  const directory = new CrafterDirectory(path);
  try {
    await directory.register({ guildId: "20", discordUserId: "30", characterName: "Anvil", profession: "Blacksmithing", notes: "Rare recipe claimed" });
    await directory.register({ guildId: "20", discordUserId: "31", characterName: "Other", profession: "Blacksmithing" });
    const request = interaction("find");
    await handleCraftCommand(request.value, directory, new Set(), unusedWebhook, {
      findCrafters: async () => [{
        guildId: "20", discordUserId: "30", characterName: "ANVIL", profession: "Blacksmithing",
        updatedAt: new Date(2_000).toISOString(), checkedAt: 2_000, ownershipCheckedAt: 1_000, skill: 131, maxSkill: 150,
      }, {
        guildId: "20", discordUserId: "32", characterName: "Alt", profession: "Blacksmithing",
        updatedAt: new Date(2_000).toISOString(), checkedAt: 2_000, ownershipCheckedAt: 1_000, skill: 100, maxSkill: 150,
      }],
    });
    const description = (request.replies[0] as Response).embeds![0]!.toJSON().description!;
    assert.equal((description.match(/<@30>/g) ?? []).length, 1);
    assert.match(description, /131\/150/);
    assert.match(description, /Self-reported notes: Rare recipe claimed/);
    assert.match(description, /ownership <t:1:R>/);
    assert.match(description, /Other/);
    assert.equal((await directory.find("20", "Blacksmithing"))[0]?.notes, "Rare recipe claimed");
  } finally { await rm(path, { recursive: true }); }
});

test("advertises crafter subcommands and bounded character and notes inputs", () => {
  const command = buildCraftCommand("guild-craft").toJSON();
  assert.equal(command.name, "guild-craft");
  assert.deepEqual(command.contexts, [0]);
  assert.deepEqual(command.options?.map((option) => option.name), ["find", "register", "remove"]);
  const json = JSON.stringify(command);
  assert.match(json, /"min_length":2/);
  assert.match(json, /"max_length":120/);
  assert.match(json, /"Blacksmithing"/);
  const remove = command.options?.[2];
  if (remove?.type !== ApplicationCommandOptionType.Subcommand) assert.fail("Expected remove subcommand");
  const character = remove.options?.find((option) => option.name === "character");
  if (character?.type !== ApplicationCommandOptionType.String) assert.fail("Expected character option");
  assert.equal(character.required, false);
  assert.equal(character.min_length, 2);
  assert.equal(character.max_length, 24);
});

test("preserves private writes and public ordinary-channel crafter searches", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-craft-command-"));
  const directory = new CrafterDirectory(path);
  const run = async (action: string, options?: Parameters<typeof interaction>[1]) => {
    const request = interaction(action, options);
    await handleCraftCommand(request.value, directory, new Set(), unusedWebhook);
    return request;
  };
  try {
    assert.match(JSON.stringify((await run("find")).replies), /No .*Blacksmithing.* crafters/);
    const registered = await run("register", { character: "*Anvil*", notes: " *Armorsmith* " });
    assert.equal((registered.replies[0] as Response).flags, MessageFlags.Ephemeral);
    const found = await run("find");
    assert.deepEqual(found.deferred, [undefined]);
    const response = found.replies[0] as Response;
    assert.deepEqual(response.allowedMentions, { parse: [] });
    const embed = response.embeds![0]!.toJSON();
    assert.match(embed.description!, /\\\*Anvil\\\*/);
    assert.match(embed.description!, /\\\*Armorsmith\\\*/);
    assert.match(embed.footer!.text, /\/guild-craft register/);
    await run("register", { character: "*Anvil*" });
    assert.doesNotMatch(JSON.stringify((await run("find")).replies), /Armorsmith/);
    assert.match(JSON.stringify((await run("remove")).replies), /Removed your/);
    assert.match(JSON.stringify((await run("remove")).replies), /do not have/);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("publishes linked-channel results only through a mention-suppressed webhook", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-craft-command-"));
  const directory = new CrafterDirectory(path);
  const published: Response[] = [];
  try {
    await Promise.all(Array.from({ length: 16 }, (_, index) => directory.register({
      guildId: "20",
      discordUserId: String(index + 1), characterName: `Anvil ${index}`, profession: "Blacksmithing",
    })));
    const request = interaction("find");
    await handleCraftCommand(request.value, directory, new Set(["40"]), async () => ({
      send: async (response: Response) => { published.push(response); },
    }) as unknown as WebhookClient);
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    assert.deepEqual(request.replies, ["Posted Blacksmithing crafters."]);
    assert.deepEqual(published[0]!.allowedMentions, { parse: [] });
    assert.match(published[0]!.embeds![0]!.toJSON().description!, /And 1 more/);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("reports storage and linked-channel delivery failures without falling back to public bot posts", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-craft-command-"));
  const directory = new CrafterDirectory(path);
  const originalError = console.error;
  const errors: unknown[] = [];
  console.error = (...values: unknown[]) => { errors.push(values); };
  try {
    await directory.register({ guildId: "20", discordUserId: "30", characterName: "Anvil", profession: "Blacksmithing" });
    for (const channel of [null, { type: ChannelType.DM }, { type: ChannelType.GuildText, guildId: "99" }]) {
      const request = interaction("find", { channel });
      await handleCraftCommand(request.value, directory, new Set(["40"]), unusedWebhook);
      assert.deepEqual(request.replies, ["Guildhead could not update the crafter directory."]);
    }
    const blocked = interaction("find");
    await handleCraftCommand(blocked.value, directory, new Set(["40"]), async () => {
      throw new Error("Missing Webhook permission");
    });
    assert.deepEqual(blocked.replies, ["Guildhead could not update the crafter directory."]);
    await writeFile(join(path, "crafters.json"), "{bad");
    for (const [action, replied] of [["register", false], ["register", true], ["find", false]] as const) {
      const request = interaction(action, { replied });
      await handleCraftCommand(request.value, directory, new Set(), unusedWebhook);
      assert.match(JSON.stringify(request.replies), /could not update the crafter directory/);
      assert.doesNotMatch(JSON.stringify(request.replies), /crafters.json|JSON/);
    }
    assert.equal(errors.length, 7);
  } finally {
    console.error = originalError;
    await rm(path, { recursive: true });
  }
});

test("supports multiple characters without exposing another server or removing another owner's listings", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-craft-command-"));
  const directory = new CrafterDirectory(path);
  const run = async (action: string, options?: Parameters<typeof interaction>[1]) => {
    const request = interaction(action, options);
    await handleCraftCommand(request.value, directory, new Set(), unusedWebhook);
    return request;
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await run("register");
    await run("register", { character: "Bellows" });
    await run("register", { guildId: "99", character: "Other Server" });
    const found = await run("find");
    assert.match(JSON.stringify(found.replies), /Anvil/);
    assert.match(JSON.stringify(found.replies), /Bellows/);
    assert.doesNotMatch(JSON.stringify(found.replies), /Other Server/);
    const ambiguous = await run("remove");
    assert.match(JSON.stringify(ambiguous.replies), /multiple characters/);
    assert.equal((ambiguous.replies[0] as Response).flags, MessageFlags.Ephemeral);
    assert.match(JSON.stringify((await run("remove", { character: "Bellows", userId: "31" })).replies), /do not have/);
    assert.match(JSON.stringify((await run("remove", { character: "bELLoWs" })).replies), /Removed your/);
    assert.equal((await directory.find("20", "Blacksmithing")).length, 1);
    assert.equal((await directory.find("99", "Blacksmithing")).length, 1);
    const dm = await run("register", { guildId: null });
    assert.match(JSON.stringify(dm.replies), /not a direct message/);
    const stale = await run("obsolete");
    assert.match(JSON.stringify(stale.replies), /Unknown crafter action/);
    const invalid = await run("find", { profession: "invalid" });
    assert.match(JSON.stringify(invalid.replies), /Unknown crafter action/);
  } finally {
    console.error = originalError;
    await rm(path, { recursive: true });
  }
});

test("keeps heavily escaped multi-character listings within Discord embed limits", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-craft-command-"));
  const directory = new CrafterDirectory(path);
  try {
    for (let index = 0; index < 15; index += 1) {
      await directory.register({
        guildId: "20", discordUserId: String(index + 1), characterName: "*".repeat(24),
        profession: "Blacksmithing", notes: "*".repeat(120),
      });
    }
    const request = interaction("find");
    await handleCraftCommand(request.value, directory, new Set(), unusedWebhook);
    const response = request.replies[0] as Response;
    const description = response.embeds![0]!.toJSON().description!;
    assert(description.length <= 4096);
    assert.match(description, /And \d+ more/);
  } finally {
    await rm(path, { recursive: true });
  }
});
