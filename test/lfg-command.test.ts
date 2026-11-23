import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ApplicationCommandOptionType,
  MessageFlags,
  type EmbedBuilder,
} from "discord.js";

import { buildLfgCommand, handleLfgCommand } from "../src/lfg-command.js";
import { LfgDirectory } from "../src/lfg-directory.js";
import { buildGroupEmbed } from "../src/lfg-communications.js";

function communications(publish: (embed: EmbedBuilder) => Promise<void>) {
  return {
    publish: async (group: Parameters<typeof buildGroupEmbed>[0]) => {
      await publish(buildGroupEmbed(group, "lfg"));
    },
    changed: async () => {},
  };
}

type Reply = string | {
  content?: string;
  embeds?: EmbedBuilder[];
  allowedMentions?: { parse: string[] };
};

function interaction(
  action: string,
  options: {
    id?: string;
    guildId?: string | null;
    userId?: string;
    activity?: string;
    size?: number | null;
    groupId?: string;
  } = {},
) {
  const replies: Reply[] = [];
  const deferred: unknown[] = [];
  const value = {
    id: options.id ?? "10",
    guildId: options.guildId === undefined ? "20" : options.guildId,
    channelId: "40",
    user: { id: options.userId ?? "30" },
    options: {
      getSubcommand: () => action,
      getString: (name: string) =>
        name === "activity"
          ? (options.activity ?? "Deadmines")
          : (options.groupId ?? "10"),
      getInteger: () => options.size ?? null,
    },
    deferReply: async (reply: unknown) => { deferred.push(reply); },
    editReply: async (reply: Reply) => { replies.push(reply); },
  } as unknown as Parameters<typeof handleLfgCommand>[0];
  return { value, replies, deferred };
}

test("advertises guild-only LFG subcommands and bounded arguments", () => {
  const command = buildLfgCommand("guild-group").toJSON();
  assert.equal(command.name, "guild-group");
  assert.deepEqual(command.contexts, [0]);
  assert.deepEqual(command.options?.map((option) => option.name), [
    "create", "list", "show", "join", "leave", "close",
  ]);
  const create = command.options?.[0];
  assert.equal(create?.type, ApplicationCommandOptionType.Subcommand);
  if (create?.type !== ApplicationCommandOptionType.Subcommand) {
    assert.fail("Expected create subcommand");
  }
  assert.equal(create.options?.[0]?.required, true);
  const size = create.options?.[1];
  if (size?.type !== ApplicationCommandOptionType.Integer) {
    assert.fail("Expected integer group size");
  }
  assert.equal(size.min_value, 2);
  assert.equal(size.max_value, 40);
});

test("creates public groups and privately lists, joins, shows, leaves, and closes", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-command-"));
  const directory = new LfgDirectory(path);
  const published: EmbedBuilder[] = [];
  const publish = async (embed: EmbedBuilder) => {
    embed.toJSON();
    published.push(embed);
  };
  const run = async (
    action: string,
    options?: Parameters<typeof interaction>[1],
  ) => {
    const request = interaction(action, options);
    await handleLfgCommand(request.value, directory, "lfg", communications(publish));
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    return request.replies;
  };
  try {
    const empty = await run("list");
    assert.match(JSON.stringify(empty), /No active groups/);
    const created = await run("create", { activity: "*Deadmines*", size: 2 });
    assert.match(JSON.stringify(created), /Group created/);
    assert.equal(published.length, 1);
    assert.match(published[0]!.data.title!, /\\\*/);
    assert.equal(published[0]!.data.fields?.[1]?.value, "1/2");
    assert.match(JSON.stringify(await run("list")), /1\/2/);
    assert.match(JSON.stringify(await run("join", { userId: "31" })), /2\/2/);
    assert.match(JSON.stringify(await run("show")), /<@31>/);
    assert.match(JSON.stringify(await run("leave", { userId: "31" })), /1\/2/);
    assert.deepEqual(await run("close"), ["Group closed."]);
    assert.match(JSON.stringify(await run("list")), /No active groups/);
    await run("create", { id: "11" });
    assert.equal((await directory.list("20"))[0]?.capacity, 5);
    assert.deepEqual(
      await run("leave", { groupId: "11" }),
      ["Group closed."],
    );
    assert.equal(published.length, 2);
    await run("create", { id: "12", size: 40 });
    await Promise.all(
      Array.from({ length: 39 }, (_, index) =>
        directory.update(
          "20", "12", String(100_000_000_000_000_000n + BigInt(index)), "join",
        ),
      ),
    );
    const shown = await run("show", { groupId: "12" });
    const reply = shown[0] as Exclude<Reply, string>;
    const embed = reply.embeds?.[0]?.toJSON();
    assert.equal(embed?.fields?.[1]?.value, "40/40");
    assert.match(embed?.description ?? "", /<@100000000000000038>/);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("rejects DM, stale actions, and groups outside the current server", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-command-"));
  const directory = new LfgDirectory(path);
  const published: unknown[] = [];
  try {
    for (const [action, options, expected] of [
      ["list", { guildId: null }, /not a direct message/],
      ["obsolete", {}, /Unknown group action/],
      ["join", { guildId: "99" }, /not found in this server/],
    ] as const) {
      const request = interaction(action, options);
      await handleLfgCommand(
        request.value,
        directory,
        "group",
        communications(async (embed) => { published.push(embed); }),
      );
      assert.match(JSON.stringify(request.replies), expected);
    }
    assert.deepEqual(published, []);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("retains a saved group when its public announcement fails", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-command-"));
  const directory = new LfgDirectory(path);
  const request = interaction("create");
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => { errors.push(values); };
  try {
    await handleLfgCommand(
      request.value,
      directory,
      "lfg",
      communications(async () => { throw new Error("Missing send permission"); }),
    );
    assert.match(JSON.stringify(request.replies.at(-1)), /Group saved/);
    assert.equal((await directory.list("20")).length, 1);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
    await rm(path, { recursive: true });
  }
});

test("reports storage failure without exposing internal details", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-command-"));
  const directory = new LfgDirectory(path);
  const request = interaction("list");
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => { errors.push(values); };
  try {
    await writeFile(join(path, "lfg.json"), "{bad");
    await handleLfgCommand(request.value, directory, "lfg", communications(async () => {
      assert.fail("Must not publish on storage failure");
    }));
    assert.match(JSON.stringify(request.replies), /Try again later/);
    assert.doesNotMatch(JSON.stringify(request.replies), /Could not load LFG/);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
    await rm(path, { recursive: true });
  }
});
