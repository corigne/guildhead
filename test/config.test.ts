import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadConfig,
  parseCommandName,
  readSecret,
} from "../src/config.js";

test("reads a secret from its Docker secret file", () => {
  const directory = mkdtempSync(join(tmpdir(), "guildhead-"));
  const path = join(directory, "discord-token");
  writeFileSync(path, "test-token\n", { mode: 0o600 });

  const previousFile = process.env.DISCORD_TOKEN_FILE;
  process.env.DISCORD_TOKEN_FILE = path;
  try {
    assert.equal(readSecret("DISCORD_TOKEN"), "test-token");
  } finally {
    if (previousFile === undefined) {
      delete process.env.DISCORD_TOKEN_FILE;
    } else {
      process.env.DISCORD_TOKEN_FILE = previousFile;
    }
    rmSync(directory, { recursive: true });
  }
});

test("rejects missing and unreadable secrets", () => {
  const previousEnvironment = { ...process.env };
  delete process.env.DISCORD_TOKEN;
  delete process.env.DISCORD_TOKEN_FILE;
  try {
    assert.throws(() => readSecret("DISCORD_TOKEN"), /is required/);
    process.env.DISCORD_TOKEN_FILE = "/not/a/real/secret";
    assert.throws(() => readSecret("DISCORD_TOKEN"), /Could not read/);
  } finally {
    process.env = previousEnvironment;
  }
});

test("rejects empty secret files", () => {
  const directory = mkdtempSync(join(tmpdir(), "guildhead-"));
  const path = join(directory, "empty-token");
  writeFileSync(path, "\n", { mode: 0o600 });
  const previousFile = process.env.DISCORD_TOKEN_FILE;
  process.env.DISCORD_TOKEN_FILE = path;
  try {
    assert.throws(() => readSecret("DISCORD_TOKEN"), /is empty/);
  } finally {
    if (previousFile === undefined) {
      delete process.env.DISCORD_TOKEN_FILE;
    } else {
      process.env.DISCORD_TOKEN_FILE = previousFile;
    }
    rmSync(directory, { recursive: true });
  }
});

test("uses a configurable Discord command name", () => {
  assert.equal(parseCommandName(undefined), "wow");
  assert.equal(parseCommandName("guildhead"), "guildhead");
  assert.equal(
    parseCommandName(undefined, "help", "DISCORD_HELP_COMMAND_NAME"),
    "help",
  );
  assert.throws(
    () => parseCommandName("Guild Head"),
    /DISCORD_COMMAND_NAME/,
  );
});

test("rejects partial Blizzard credentials", () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    DISCORD_TOKEN: "test-token",
    DISCORD_CHANNEL_IDS: "123",
    BLIZZARD_CLIENT_ID: "client-id",
  });
  delete process.env.BLIZZARD_CLIENT_SECRET;
  delete process.env.BLIZZARD_CLIENT_SECRET_FILE;

  try {
    assert.throws(
      () => loadConfig(),
      /BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET/,
    );
  } finally {
    process.env = previousEnvironment;
  }
});

test("loads complete Discord and roster configuration", () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    DISCORD_TOKEN: "test-token",
    DISCORD_WEBHOOK_URL: "https://discord.test/webhook",
    DISCORD_CHANNEL_IDS: "123, 456",
    DISCORD_COMMAND_NAME: "wow",
    DISCORD_HELP_COMMAND_NAME: "help",
    DISCORD_CRAFT_COMMAND_NAME: "craft",
    DISCORD_LFG_COMMAND_NAME: "group",
    DISCORD_ROSTER_COMMAND_NAME: "guild-roster",
    DISCORD_CHARACTER_COMMAND_NAME: "toon",
    BLIZZARD_OAUTH_REDIRECT_URI: "https://guildhead.example.org/oauth/battlenet/callback",
    WOWHEAD_FLAVORS: "forever,classic",
    BLIZZARD_CLIENT_ID: "client",
    BLIZZARD_CLIENT_SECRET: "secret",
    BLIZZARD_REGION: "eu",
    BLIZZARD_GUILD_NAME: "Guild",
    GUILD_ANNOUNCEMENT_CHANNEL_ID: "789",
    GUILD_ANNOUNCE_EVENTS: "joins,ranks",
    GUILD_ROSTER_POLL_MINUTES: "5",
    GUILDHEAD_DATA_DIR: "/state",
  });

  try {
    const config = loadConfig();
    assert.equal(config.webhookUrl, "https://discord.test/webhook");
    assert.deepEqual([...config.channelIds], ["123", "456"]);
    assert.deepEqual(config.flavors, ["forever", "classic"]);
    assert.equal(config.craftCommandName, "craft");
    assert.equal(config.lfgCommandName, "group");
    assert.equal(config.rosterCommandName, "guild-roster");
    assert.equal(config.characterCommandName, "toon");
    assert.equal(config.characterRedirectUri, "https://guildhead.example.org/oauth/battlenet/callback");
    assert.equal(config.guildRoster?.region, "eu");
    assert.equal(config.guildRoster?.pollMinutes, 5);
    assert.deepEqual(
      [...(config.guildRoster?.events ?? [])],
      ["joins", "ranks"],
    );
  } finally {
    process.env = previousEnvironment;
  }
});

test("rejects invalid configuration values", () => {
  const previousEnvironment = { ...process.env };
  const base = {
    DISCORD_TOKEN: "test-token",
    DISCORD_CHANNEL_IDS: "123",
    DISCORD_COMMAND_NAME: "wow",
    DISCORD_HELP_COMMAND_NAME: "help",
    DISCORD_CRAFT_COMMAND_NAME: "craft",
    DISCORD_LFG_COMMAND_NAME: "lfg",
    DISCORD_ROSTER_COMMAND_NAME: "roster",
    DISCORD_CHARACTER_COMMAND_NAME: "character",
    BLIZZARD_OAUTH_REDIRECT_URI: "",
    WOWHEAD_FLAVORS: "forever",
    BLIZZARD_CLIENT_ID: "client",
    BLIZZARD_CLIENT_SECRET: "secret",
    BLIZZARD_REGION: "us",
    BLIZZARD_GUILD_NAME: "Guild",
    GUILD_ANNOUNCEMENT_CHANNEL_ID: "789",
    GUILD_ANNOUNCE_EVENTS: "joins",
    GUILD_ROSTER_POLL_MINUTES: "10",
  };
  const cases: Array<[Record<string, string>, RegExp]> = [
    [{ WOWHEAD_FLAVORS: "invalid" }, /unsupported values/],
    [{ DISCORD_CRAFT_COMMAND_NAME: "wow" }, /must be different/],
    [{ DISCORD_LFG_COMMAND_NAME: "craft" }, /must be different/],
    [{ DISCORD_ROSTER_COMMAND_NAME: "lfg" }, /must be different/],
    [{ DISCORD_ROSTER_COMMAND_NAME: "Guild Roster" }, /DISCORD_ROSTER_COMMAND_NAME/],
    [{ DISCORD_CHARACTER_COMMAND_NAME: "roster" }, /must be different/],
    [{ BLIZZARD_OAUTH_REDIRECT_URI: "not a url" }, /valid HTTPS/],
    ...[
      "http://host/oauth/battlenet/callback", "https://user@host/oauth/battlenet/callback",
      "https://:password@host/oauth/battlenet/callback", "https://host/wrong",
      "https://host/oauth/battlenet/callback?query=1", "https://host/oauth/battlenet/callback#fragment",
    ].map((value): [Record<string, string>, RegExp] => [
      { BLIZZARD_OAUTH_REDIRECT_URI: value }, /must use HTTPS/,
    ]),
    [{ BLIZZARD_REGION: "invalid" }, /BLIZZARD_REGION/],
    [{ GUILD_ANNOUNCE_EVENTS: "invalid" }, /unsupported values/],
    [{ GUILD_ROSTER_POLL_MINUTES: "1" }, /between 2 and 1440/],
    [{ DISCORD_CHANNEL_IDS: "," }, /at least one channel ID/],
    [{ WOWHEAD_FLAVORS: "," }, /at least one flavor/],
  ];

  try {
    for (const [overrides, expected] of cases) {
      Object.assign(process.env, base, overrides);
      assert.throws(() => loadConfig(), expected);
    }
  } finally {
    process.env = previousEnvironment;
  }
});

test("loads without optional Blizzard configuration", () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    DISCORD_TOKEN: "test-token",
    DISCORD_CHANNEL_IDS: "123",
    DISCORD_COMMAND_NAME: "wow",
    DISCORD_HELP_COMMAND_NAME: "help",
    DISCORD_CRAFT_COMMAND_NAME: "craft",
    WOWHEAD_FLAVORS: "forever",
  });
  delete process.env.BLIZZARD_CLIENT_ID;
  delete process.env.BLIZZARD_CLIENT_SECRET;
  delete process.env.BLIZZARD_CLIENT_SECRET_FILE;

  try {
    assert.equal(loadConfig().guildRoster, undefined);
    process.env.BLIZZARD_OAUTH_REDIRECT_URI = "https://guildhead.example.org/oauth/battlenet/callback";
    assert.throws(() => loadConfig(), /requires the Blizzard guild roster/);
  } finally {
    process.env = previousEnvironment;
  }
});

test("reads optional Blizzard secret files and surfaces file errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "guildhead-"));
  const secretPath = join(directory, "blizzard-secret");
  writeFileSync(secretPath, "secret\n", { mode: 0o600 });
  const previousEnvironment = { ...process.env };
  const base = {
    DISCORD_TOKEN: "test-token",
    DISCORD_CHANNEL_IDS: "123",
    BLIZZARD_CLIENT_ID: "client",
    BLIZZARD_GUILD_NAME: "Guild",
    GUILD_ANNOUNCEMENT_CHANNEL_ID: "789",
  };

  try {
    Object.assign(process.env, base, {
      BLIZZARD_CLIENT_SECRET_FILE: secretPath,
    });
    delete process.env.BLIZZARD_CLIENT_SECRET;
    assert.equal(loadConfig().guildRoster?.clientSecret, "secret");

    process.env.BLIZZARD_CLIENT_SECRET_FILE = join(directory, "missing");
    assert.throws(() => loadConfig(), /Could not read/);

    writeFileSync(secretPath, "\n");
    process.env.BLIZZARD_CLIENT_SECRET_FILE = secretPath;
    assert.throws(
      () => loadConfig(),
      /BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET/,
    );
  } finally {
    process.env = previousEnvironment;
    rmSync(directory, { recursive: true });
  }
});
