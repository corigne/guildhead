import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MessageFlags, type MessageCreateOptions } from "discord.js";
import { loadWelcomeMessage, welcomeMember } from "../src/welcome.js";

const config = {
  helpCommandName: "guide", commandName: "lookup", craftCommandName: "crafters",
  lfgCommandName: "group", rosterCommandName: "guild", characterCommandName: "toon",
};

test("renders default onboarding with configured commands and privacy/source guidance", () => {
  const message = loadWelcomeMessage(config);
  for (const command of ["/guide", "/lookup", "/crafters", "/group", "/guild", "/toon link", "/toon main", "/toon unlink"]) {
    assert.ok(message.includes(command));
  }
  assert.match(message, /Entirely optional/);
  assert.match(message, /never receives your password/);
  assert.match(message, /not a progression or role-enforcement tool/);
  assert.match(message, /https:\/\/github.com\/corigne\/guildhead/);
  assert.doesNotMatch(message, /\.michelin/);
  assert.match(loadWelcomeMessage({ ...config, commandChannelId: "123" }), /<#123>/);
});

test("loads a custom message, preserves literals, and rejects invalid templates", () => {
  const directory = mkdtempSync(join(tmpdir(), "guildhead-welcome-"));
  const path = join(directory, "welcome.txt");
  try {
    writeFileSync(path, "  Made by .michelin. {help} {source} {literal}\n");
    assert.equal(loadWelcomeMessage({ ...config, welcomeMessageFile: path }),
      "Made by .michelin. /guide https://github.com/corigne/guildhead {literal}");
    for (const template of [" \n", "x".repeat(2001), "{source}".repeat(70)]) {
      writeFileSync(path, template);
      assert.throws(() => loadWelcomeMessage({ ...config, welcomeMessageFile: path }), /1-2000/);
    }
    assert.throws(() => loadWelcomeMessage({ ...config, welcomeMessageFile: join(directory, "missing") }), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("welcomes only new humans in configured servers without mentions or link embeds", async () => {
  const messages: MessageCreateOptions[] = [];
  const member = {
    guild: { id: "guild" }, user: { bot: false },
    send: async (message: MessageCreateOptions) => { messages.push(message); },
  };
  const options = { enabled: true, guildIds: new Set(["guild"]), message: "Welcome @everyone" };
  assert.equal(await welcomeMember(member, { ...options, enabled: false }), "skipped");
  assert.equal(await welcomeMember({ ...member, user: { bot: true } }, options), "skipped");
  assert.equal(await welcomeMember({ ...member, guild: { id: "other" } }, options), "skipped");
  assert.equal(messages.length, 0);
  assert.equal(await welcomeMember(member, options), "sent");
  assert.deepEqual(messages, [{
    content: options.message, allowedMentions: { parse: [] }, flags: MessageFlags.SuppressEmbeds,
  }]);
  assert.equal(await welcomeMember({
    ...member, send: async () => { throw new Error("Cannot send messages to this user"); },
  }, options), "failed");
  assert.equal(messages.length, 1);
});
