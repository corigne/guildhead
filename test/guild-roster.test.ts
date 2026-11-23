import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { Client } from "discord.js";

import type { GuildRosterConfig } from "../src/config.js";
import {
  buildRosterEventEmbed,
  GuildRosterMonitor,
  loadRosterState,
  saveRosterState,
} from "../src/guild-roster.js";
import type { RosterMember } from "../src/roster-state.js";

const member: RosterMember = {
  id: "1",
  name: "Anvil",
  slug: "anvil",
  level: 60,
  className: "Warrior",
  rank: 2,
};

test("persists a baseline and announces confirmed roster changes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-"));
  const sent: unknown[] = [];
  const discord = {
    channels: {
      fetch: async () => ({
        isSendable: () => true,
        send: async (message: unknown) => {
          sent.push(message);
        },
      }),
    },
  } as unknown as Client;
  const config: GuildRosterConfig = {
    clientId: "client",
    clientSecret: "secret",
    region: "us",
    guildName: "Guild",
    announcementChannelId: "123",
    events: new Set(["joins", "ranks"]),
    pollMinutes: 10,
    dataDir,
  };
  let roster = [member];
  const monitor = new GuildRosterMonitor(discord, config, {
    guildRoster: async () => roster,
  });

  try {
    await monitor.pollOnce();
    assert.deepEqual(
      Object.keys((await loadRosterState(config))?.members ?? {}),
      ["1"],
    );
    assert.equal(sent.length, 0);
    const firstCheck = (await loadRosterState(config))?.checkedAt;
    assert.equal(typeof firstCheck, "number");

    roster = [
      member,
      {
        ...member,
        id: "2",
        name: "Forge",
        slug: "forge",
        rank: 4,
      },
    ];
    await monitor.pollOnce();
    await monitor.pollOnce();
    assert.equal(sent.length, 1);
    assert.ok((await loadRosterState(config))!.checkedAt! >= firstCheck!);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("rejects malformed roster state", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-"));
  const config = {
    guildName: "Guild",
    dataDir,
  } as GuildRosterConfig;
  try {
    await writeFile(
      join(dataDir, "guild-roster-guild.json"),
      '{"version":2}',
    );
    await assert.rejects(loadRosterState(config), /unsupported shape/);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("starts polling and skips overlapping polls", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-"));
  let release: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => warnings.push(values);
  const config = {
    clientId: "client",
    clientSecret: "secret",
    region: "us",
    guildName: "Guild",
    announcementChannelId: "123",
    events: new Set(["joins"]),
    pollMinutes: 10,
    dataDir,
  } satisfies GuildRosterConfig;
  const monitor = new GuildRosterMonitor({} as Client, config, {
    guildRoster: async () => {
      await wait;
      return [member];
    },
  });

  try {
    const timer = monitor.start();
    clearInterval(timer);
    await monitor.pollOnce();
    assert.equal(warnings.length, 1);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    console.warn = originalWarn;
    await rm(dataDir, { recursive: true });
  }
});

test("keeps the last good snapshot when polling or announcement delivery fails", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "guildhead-roster-"));
  const config = {
    clientId: "client",
    clientSecret: "secret",
    region: "us",
    guildName: "Guild",
    announcementChannelId: "123",
    events: new Set(["joins"]),
    pollMinutes: 10,
    dataDir,
  } satisfies GuildRosterConfig;
  const joining = {
    ...member,
    id: "2",
    name: "Forge",
    slug: "forge",
  };
  await saveRosterState(config, {
    version: 1,
    members: { [member.id]: member },
    observations: { "join:2": 1 },
    checkedAt: 1_000,
  });
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => errors.push(values);
  const discord = {
    channels: { fetch: async () => null },
  } as unknown as Client;

  try {
    await new GuildRosterMonitor(discord, config, {
      guildRoster: async () => [member, joining],
    }).pollOnce();
    assert.equal(errors.length, 1);
    assert.equal((await loadRosterState(config))?.members["2"], undefined);
    assert.equal((await loadRosterState(config))?.checkedAt, 1_000);
    await new GuildRosterMonitor(discord, config, {
      guildRoster: async () => { throw new Error("Blizzard unavailable"); },
    }).pollOnce();
    assert.equal(errors.length, 2);
    assert.equal((await loadRosterState(config))?.checkedAt, 1_000);
  } finally {
    console.error = originalError;
    await rm(dataDir, { recursive: true });
  }
});

test("builds join, departure, promotion, and rank-change embeds", () => {
  const config = {
    guildName: "Guild",
  } as GuildRosterConfig;
  const events = [
    { type: "joins" as const, member },
    { type: "leaves" as const, member },
    {
      type: "ranks" as const,
      member: { ...member, rank: 1 },
      previousRank: 2,
    },
    {
      type: "ranks" as const,
      member: { ...member, rank: 3 },
      previousRank: 2,
    },
  ];

  assert.deepEqual(
    events.map((event) => buildRosterEventEmbed(config, event).data.title),
    [
      "Guild member joined",
      "Guild member departed",
      "Guild member promoted",
      "Guild member rank changed",
    ],
  );
});

test("constructs its default Blizzard client", () => {
  const config = {
    clientId: "client",
    clientSecret: "secret",
  } as GuildRosterConfig;
  assert.ok(new GuildRosterMonitor({} as Client, config));
});
