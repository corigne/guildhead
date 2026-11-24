import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("scripts/setup.sh");
const fakeToken = "example-test-token.only_for_tests";
const mock = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const root = process.env.SETUP_TEST_ROOT;
fs.appendFileSync(path.join(root, "calls"), JSON.stringify({name, args}) + "\\n");
const output = text => process.stdout.write(text + "\\n");
if (name === "pass") {
  if (args[0] === "ls") process.exit(process.env.MOCK_MISSING_ENTRY ? 1 : 0);
  if (args[0] === "show") {
    if (process.env.MOCK_LOCKED_ENTRY) process.exit(1);
    output(process.env.SETUP_TEST_TOKEN + "\\nA note, not part of the token.");
  }
} else if (name === "curl") {
  fs.readFileSync(0, "utf8");
  if (process.env.MOCK_NETWORK_FAILURE) process.exit(7);
  output(process.env.MOCK_HTTP_STATUS || "200");
} else if (name === "stat") {
  output(args.includes("-f") ? (process.env.MOCK_FS_TYPE || "tmpfs") :
    args.includes("%a") ? (process.env.MOCK_RUNTIME_MODE || "700") : String(process.getuid()));
} else if (name === "docker") {
  if (args[0] === "volume") process.exit(process.env.MOCK_EXISTING_VOLUME ? 0 : 1);
  if (args[0] === "ps" && process.env.MOCK_CONFLICT) {
    output("other ghcr.io/corigne/guildhead:1.12.1 other-guildhead");
  } else if (args[0] === "inspect") {
    output(args.some(arg => arg.includes("StartedAt")) ? "2026-11-24T00:00:00Z" : "/other-installation");
  } else if (args[0] === "compose") {
    if (args.includes("pull") && process.env.MOCK_PULL_FAILURE) process.exit(1);
    if (args.includes("up")) fs.writeFileSync(path.join(root, "running"), "yes");
    if (args.includes("stop")) fs.rmSync(path.join(root, "running"), {force:true});
    if (args.includes("ps") && fs.existsSync(path.join(root, "running"))) output("test-container");
    if (args.includes("logs") && !process.env.MOCK_NOT_READY) {
      output("Logged in as test-bot\\nRegistered /wow and /help commands\\nGuildhead webhook ready in #one\\nGuildhead webhook ready in #two");
    }
  }
}
`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "guildhead-setup-test-"));
  const bin = join(root, "bin");
  const runtime = join(root, "runtime");
  const directory = join(root, "install with spaces");
  mkdirSync(bin);
  mkdirSync(runtime, { mode: 0o700 });
  const executable = join(bin, "mock.cjs");
  writeFileSync(executable, mock, { mode: 0o700 });
  for (const name of ["docker", "pass", "curl", "stat", "sleep"]) {
    symlinkSync(executable, join(bin, name));
  }
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}) => spawnSync("sh", [
    script, ...args, "--directory", directory,
  ], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      XDG_RUNTIME_DIR: runtime,
      SETUP_TEST_ROOT: root,
      SETUP_TEST_TOKEN: fakeToken,
      ...extra,
    },
  });
  const setup = (extra: NodeJS.ProcessEnv = {}, args: string[] = []) => run([
    "setup", "--yes", "--channels", "123,456", "--lfg-channel", "789", ...args,
  ], extra);
  const calls = () => existsSync(join(root, "calls"))
    ? readFileSync(join(root, "calls"), "utf8") : "";
  const interactive = () => spawnSync("script", [
    "--quiet", "--return", "--command",
    'sh "$SETUP_TEST_SCRIPT" --directory "$SETUP_TEST_DIRECTORY"', "/dev/null",
  ], {
    encoding: "utf8",
    input: "123,456\n\n789\ny\n",
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      XDG_RUNTIME_DIR: runtime,
      SETUP_TEST_ROOT: root,
      SETUP_TEST_TOKEN: fakeToken,
      SETUP_TEST_SCRIPT: script,
      SETUP_TEST_DIRECTORY: directory,
      MOCK_MISSING_ENTRY: "yes",
    },
  });
  return {
    root, runtime, directory, run, setup, calls, interactive,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("guided setup keeps credentials out of configuration and supports prepare-only mode", () => {
  const f = fixture();
  try {
    const result = f.setup({}, ["--no-start"]);
    assert.equal(result.status, 0, result.stderr);
    const compose = readFileSync(join(f.directory, "compose.yaml"), "utf8");
    assert.match(compose, /DISCORD_TOKEN_FILE: \/run\/guildhead-token/);
    assert.match(compose, /DISCORD_CHANNEL_IDS: "123,456"/);
    assert.match(compose, /DISCORD_LFG_CHANNEL_ID: "789"/);
    assert.match(compose, /create_host_path: false/);
    assert.match(compose, /data:\/data/);
    assert(!compose.includes(fakeToken));
    assert(!f.calls().includes(fakeToken));
    assert(!result.stdout.includes(fakeToken));
    assert.equal(statSync(f.directory).mode & 0o777, 0o700);
    assert.equal(statSync(join(f.directory, "settings")).mode & 0o777, 0o600);
    assert(!existsSync(join(f.runtime, "guildhead-setup", "discord-token")));
    assert(!existsSync(join(f.root, "running")));
    assert.equal(readFileSync(join(f.directory, "setup.sh"), "utf8"), readFileSync(script, "utf8"));
  } finally { f.clean(); }
});

test("start verifies readiness, uses a protected runtime token, and stop preserves data/configuration", () => {
  const f = fixture();
  try {
    const setup = f.setup();
    assert.equal(setup.status, 0, setup.stderr);
    assert.match(setup.stdout, /connected to Discord/);
    const tokenPath = join(f.runtime, "guildhead-setup", "discord-token");
    assert.equal(readFileSync(tokenPath, "utf8"), `${fakeToken}\n`);
    assert.equal(statSync(join(f.runtime, "guildhead-setup")).mode & 0o777, 0o700);
    const inode = statSync(tokenPath).ino;
    const before = readFileSync(join(f.directory, "compose.yaml"), "utf8");
    assert.equal(f.run(["start", "--yes"]).status, 0);
    assert.equal(statSync(tokenPath).ino, inode);
    const repeat = f.setup({}, ["--no-start"]);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.match(repeat.stdout, /kept unchanged/);
    assert.equal(readFileSync(join(f.directory, "compose.yaml"), "utf8"), before);
    assert.equal(f.run(["status"]).status, 0);
    assert.equal(f.run(["stop"]).status, 0);
    assert(existsSync(join(f.directory, "settings")));
    assert(!existsSync(join(f.root, "running")));
    assert(!existsSync(tokenPath));
    assert(!f.calls().includes(fakeToken));
    assert(!f.calls().includes("down"));
  } finally { f.clean(); }
});

test("setup refuses existing files, other installations, and unsafe channel inputs", () => {
  for (const scenario of ["existing", "conflict", "volume", "channels", "duplicate-channels", "entry"]) {
    const f = fixture();
    try {
      if (scenario === "existing") {
        mkdirSync(f.directory);
        writeFileSync(join(f.directory, "keep"), "original");
      }
      const options = scenario === "channels" ? ["--channels", "123;false"]
        : scenario === "duplicate-channels" ? ["--channels", "123,123"]
          : scenario === "entry" ? ["--token-entry", "../other"] : [];
      const extra = scenario === "conflict" ? { MOCK_CONFLICT: "yes" }
        : scenario === "volume" ? { MOCK_EXISTING_VOLUME: "yes" } : {};
      const result = f.setup(extra, options);
      assert.notEqual(result.status, 0, scenario);
      assert(!existsSync(join(f.directory, "settings")));
      assert(!existsSync(join(f.root, "running")));
      if (scenario === "existing") assert.equal(readFileSync(join(f.directory, "keep"), "utf8"), "original");
    } finally { f.clean(); }
  }
});

test("setup refuses disk-backed secrets, rejected tokens, locked entries, and failed requests", () => {
  for (const extra of [
    { MOCK_FS_TYPE: "ext4" }, { MOCK_RUNTIME_MODE: "755" }, { MOCK_HTTP_STATUS: "401" },
    { MOCK_LOCKED_ENTRY: "yes" }, { MOCK_NETWORK_FAILURE: "yes" },
    { MOCK_MISSING_ENTRY: "yes" },
  ]) {
    const f = fixture();
    try {
      const result = f.setup(extra, ["--no-start"]);
      assert.notEqual(result.status, 0);
      assert(!existsSync(join(f.directory, "settings")));
      assert(!existsSync(join(f.runtime, "guildhead-setup", "discord-token")));
      assert(!f.calls().includes('"insert"'));
      assert(!result.stdout.includes(fakeToken) && !result.stderr.includes(fakeToken));
    } finally { f.clean(); }
  }
});

test("an image pull failure leaves the existing runtime token and configuration alone", () => {
  const f = fixture();
  try {
    assert.equal(f.setup().status, 0);
    const tokenPath = join(f.runtime, "guildhead-setup", "discord-token");
    const inode = statSync(tokenPath).ino;
    const result = f.run(["start", "--yes"], { MOCK_PULL_FAILURE: "yes" });
    assert.notEqual(result.status, 0);
    assert.equal(statSync(tokenPath).ino, inode);
    assert(existsSync(join(f.root, "running")));
    assert.match(result.stderr, /existing bot was left alone/);
  } finally { f.clean(); }
});

test("a running container without confirmed Discord readiness is not reported ready", () => {
  const f = fixture();
  try {
    const result = f.setup({ MOCK_NOT_READY: "yes" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Startup was not confirmed/);
    assert(!result.stdout.includes("connected to Discord"));
    assert(existsSync(join(f.root, "running")));
  } finally { f.clean(); }
});

test("saved settings are parsed as data rather than sourced as shell code", () => {
  const f = fixture();
  try {
    assert.equal(f.setup({}, ["--no-start"]).status, 0);
    const marker = join(f.root, "must-not-exist");
    writeFileSync(join(f.directory, "settings"), `channels=123\ntoken_entry=$(touch "${marker}")\nlfg_channel=\n`);
    assert.notEqual(f.run(["start", "--yes"]).status, 0);
    assert(!existsSync(marker));
  } finally { f.clean(); }
});

test("setup rejects symlinked installation and runtime token paths", () => {
  for (const target of ["installation", "token"]) {
    const f = fixture();
    try {
      const untouched = join(f.root, "untouched");
      writeFileSync(untouched, "keep");
      if (target === "installation") {
        symlinkSync(f.root, f.directory);
      } else {
        const runtime = join(f.runtime, "guildhead-setup");
        mkdirSync(runtime, { mode: 0o700 });
        symlinkSync(untouched, join(runtime, "discord-token"));
      }
      assert.notEqual(f.setup().status, 0);
      assert.equal(readFileSync(untouched, "utf8"), "keep");
      assert(!existsSync(join(f.root, "running")));
    } finally { f.clean(); }
  }
});

test("interactive setup reads a terminal and delegates new token entry to pass", {
  skip: spawnSync("script", ["--version"], { encoding: "utf8" }).status !== 0,
}, () => {
  const f = fixture();
  try {
    const result = f.interactive();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Tooltip channel IDs/);
    assert.match(result.stdout, /connected to Discord/);
    assert(f.calls().includes('"insert"'));
    assert(!result.stdout.includes(fakeToken));
    assert(existsSync(join(f.directory, "settings")));
  } finally { f.clean(); }
});
