import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildGroupEmbed,
  LfgCommunications,
  type LfgTransport,
} from "../src/lfg-communications.js";
import { LfgDirectory, type LfgPost } from "../src/lfg-directory.js";

const input = {
  id: "1", guildId: "2", ownerId: "3", activity: "Deadmines", capacity: 5,
};

test("edits current rosters, notifies real changes only, and finalizes closed posts", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-comms-"));
  const directory = new LfgDirectory(path);
  const edited: LfgPost[] = [];
  const notified: string[] = [];
  const transport: LfgTransport = {
    publish: async (_group, channelId) => ({ channelId, messageId: "5" }),
    edit: async (post) => { edited.push(post); return true; },
    notify: async (_group, actorId, action) => { notified.push(`${actorId}:${action}`); },
  };
  const communications = new LfgCommunications(directory, transport);
  try {
    const group = await directory.create(input);
    await communications.publish(group, "4");
    const timer = communications.start();
    clearInterval(timer);
    await communications.refresh();
    assert.equal(edited.length, 1);
    const joined = await directory.update("2", "1", "6", "join");
    await communications.changed(joined, "6", "join");
    assert.deepEqual(edited.at(-1)?.group.memberIds, ["3", "6"]);
    assert.deepEqual(notified, ["6:join"]);
    const duplicate = await directory.update("2", "1", "6", "join");
    await communications.changed(duplicate, "6", "join");
    await communications.changed({ group, changed: true }, "6", "show");
    assert.equal(notified.length, 1);
    assert.equal(edited.length, 2);
    const left = await directory.update("2", "1", "6", "leave");
    await communications.changed(left, "6", "leave");
    assert.deepEqual(notified, ["6:join", "6:leave"]);
    const closed = await directory.update("2", "1", "3", "close");
    await communications.changed(closed, "3", "close");
    assert.equal(edited.at(-1)?.status, "closed");
    assert.deepEqual(await directory.posts(), []);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("retries transport failures, preserves successful signups, and recovers after restart", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-comms-"));
  const directory = new LfgDirectory(path);
  let failing = true;
  const errors: unknown[] = [];
  const warnings: unknown[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...values: unknown[]) => { errors.push(values); };
  console.warn = (...values: unknown[]) => { warnings.push(values); };
  const edited: LfgPost[] = [];
  const transport: LfgTransport = {
    publish: async () => ({ channelId: "4", messageId: "5" }),
    edit: async (post) => {
      if (failing) throw new Error("Missing permission");
      edited.push(post);
      return true;
    },
    notify: async () => { throw new Error("DMs disabled"); },
  };
  const communications = new LfgCommunications(directory, transport);
  try {
    await communications.publish(await directory.create(input), "4");
    const joined = await directory.update("2", "1", "6", "join");
    await communications.changed(joined, "6", "join");
    assert.equal((await directory.list("2"))[0]?.memberIds.length, 2);
    assert.equal(warnings.length, 1);
    assert.equal(errors.length, 2);
    failing = false;
    const restarted = new LfgCommunications(new LfgDirectory(path), transport);
    await restarted.refresh();
    assert.equal(edited.at(-1)?.group.memberIds.length, 2);
    await directory.update("2", "1", "3", "close");
    failing = true;
    await restarted.refresh();
    assert.equal((await directory.posts())[0]?.status, "closed");
    failing = false;
    await restarted.refresh();
    assert.deepEqual(await directory.posts(), []);
    await writeFile(join(path, "lfg.json"), "{bad");
    await communications.refresh();
    assert.match(JSON.stringify(errors), /refresh LFG announcements/);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    await rm(path, { recursive: true });
  }
});

test("marks expiry and forgets deleted announcements without removing active groups", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-comms-"));
  const directory = new LfgDirectory(path);
  let exists = true;
  const edited: LfgPost[] = [];
  const transport: LfgTransport = {
    publish: async () => ({ channelId: "4", messageId: "5" }),
    edit: async (post) => { edited.push(post); return exists; },
    notify: async () => {},
  };
  const communications = new LfgCommunications(directory, transport);
  try {
    const group = await directory.create(input);
    await communications.publish(group, "4");
    await directory.posts(group.expiresAt);
    await communications.refresh();
    assert.equal(edited.at(-1)?.status, "expired");
    assert.deepEqual(await directory.posts(), []);
    const next = await directory.create({ ...input, id: "10" });
    await communications.publish(next, "4");
    exists = false;
    await directory.update("2", "10", "6", "join");
    await communications.refresh();
    assert.deepEqual(await directory.posts(), []);
    assert.equal((await directory.list("2")).length, 1);
    await communications.refresh();
    exists = true;
    await communications.publish(next, "4");
    await directory.forgetPost("10");
    await communications.refresh();
  } finally {
    await rm(path, { recursive: true });
  }
});

test("renders open, closed, and expired group posts", () => {
  const group = { ...input, memberIds: ["3"], expiresAt: Date.now() + 1_000 };
  for (const status of ["open", "closed", "expired"] as const) {
    const embed = buildGroupEmbed(group, "party", status).toJSON();
    assert.equal(embed.color, status === "open" ? 0x1eff00 : 0x9d9d9d);
    assert.match(embed.footer?.text ?? "", status === "open" ? /\/party join/ : /no longer accepting/);
  }
});

test("serializes concurrent edits so a slow delivery cannot leave an older roster", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-comms-"));
  const directory = new LfgDirectory(path);
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const sizes: number[] = [];
  const communications = new LfgCommunications(directory, {
    publish: async () => ({ channelId: "4", messageId: "5" }),
    edit: async (post) => {
      if (post.group.memberIds.length === 2) {
        entered.resolve();
        await resume.promise;
      }
      sizes.push(post.group.memberIds.length);
      return true;
    },
    notify: async () => {},
  });
  try {
    await communications.publish(await directory.create(input), "4");
    const first = communications.changed(
      await directory.update("2", "1", "6", "join"), "6", "join",
    );
    await entered.promise;
    const second = communications.changed(
      await directory.update("2", "1", "7", "join"), "7", "join",
    );
    resume.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(sizes, [1, 2, 3]);
  } finally {
    resume.resolve();
    await rm(path, { recursive: true });
  }
});
