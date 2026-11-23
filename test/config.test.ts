import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseCommandName, readSecret } from "../src/config.js";

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
