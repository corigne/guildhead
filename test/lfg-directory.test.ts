import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LfgDirectory,
  parseLfgState,
  type LfgGroup,
} from "../src/lfg-directory.js";

const group: LfgGroup = {
  id: "1",
  guildId: "2",
  ownerId: "3",
  activity: "Deadmines",
  capacity: 2,
  memberIds: ["3"],
  expiresAt: 10_000_000,
};

test("persists scoped groups, serializes joins, and enforces capacity", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-"));
  const directory = new LfgDirectory(path);
  try {
    const created = await directory.create(
      { ...group, activity: "  Deadmines \n run  " },
      1_000,
    );
    assert.equal(created.activity, "Deadmines run");
    assert.equal(created.expiresAt, 7_201_000);
    assert.deepEqual((await directory.list("2", 1_001)), [created]);
    assert.deepEqual(await directory.list("99", 1_001), []);
    assert.equal((await stat(join(path, "lfg.json"))).mode & 0o777, 0o600);
    assert.equal((await new LfgDirectory(path).list("2", 1_001)).length, 1);
    await assert.rejects(
      directory.update("99", "1", "4", "join", 1_002),
      /not found in this server/,
    );
    const results = await Promise.allSettled([
      directory.update("2", "1", "4", "join", 1_003),
      directory.update("2", "1", "5", "join", 1_003),
    ]);
    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "rejected");
    if (results[1]?.status === "rejected") {
      assert.match(String(results[1].reason), /group is full/);
    }
    assert.deepEqual(
      (await directory.update("2", "1", "4", "join", 1_004)).group.memberIds,
      ["3", "4"],
    );
    await assert.rejects(
      directory.update("2", "1", "4", "close", 1_005),
      /Only the group leader/,
    );
    assert.equal(
      (await directory.update("2", "1", "4", "leave", 1_006)).closed,
      false,
    );
    await assert.rejects(
      directory.update("2", "1", "invalid", "join", 1_007),
      /Invalid Discord user/,
    );
    assert.deepEqual(
      (await directory.update("2", "1", "3", "show", 1_008)).group.memberIds,
      ["3"],
    );
    assert.equal(
      (await directory.update("2", "1", "3", "close", 1_009)).closed,
      true,
    );
    assert.deepEqual(await directory.list("2", 1_010), []);
    await assert.rejects(
      directory.update("2", "1", "3", "show", 1_010),
      /closed, or expired/,
    );
  } finally {
    await rm(path, { recursive: true });
  }
});

test("limits ownership and guild capacity, closes when leaders leave", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-"));
  const directory = new LfgDirectory(path);
  try {
    await directory.create(group, 1_000);
    await assert.rejects(
      directory.create({ ...group, id: "4" }, 1_000),
      /already lead a group/,
    );
    await directory.create({ ...group, id: "5", guildId: "99" }, 1_000);
    assert.equal(
      (await directory.update("99", "5", "3", "leave", 1_001)).closed,
      true,
    );
    for (let index = 2; index <= 10; index += 1) {
      await directory.create(
        { ...group, id: String(index + 10), ownerId: String(index + 100) },
        1_002,
      );
    }
    await assert.rejects(
      directory.create({ ...group, id: "50", ownerId: "500" }, 1_003),
      /ten active groups/,
    );
    const expiry = 1_002 + 2 * 60 * 60 * 1000;
    await assert.rejects(
      directory.update("2", "1", "3", "show", expiry),
      /expired/,
    );
    assert.deepEqual(await directory.list("2", expiry), []);
    assert.deepEqual(
      JSON.parse(await readFile(join(path, "lfg.json"), "utf8")),
      { version: 1, groups: [] },
    );
    await directory.create({ ...group, id: "51" });
    assert.equal((await directory.list("2")).length, 1);
    await directory.update("2", "51", "3", "close");
  } finally {
    await rm(path, { recursive: true });
  }
});

test("fails closed on corrupt state and recovers after errors", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-lfg-"));
  const directory = new LfgDirectory(path);
  try {
    await writeFile(join(path, "lfg.json"), "{bad json");
    await assert.rejects(directory.list("2"), /Could not load LFG state/);
    assert.equal(await readFile(join(path, "lfg.json"), "utf8"), "{bad json");
    await writeFile(join(path, "lfg.json"), '{"version":1,"groups":[]}');
    await assert.rejects(
      directory.create({ ...group, activity: " \n " }),
      /Give your group/,
    );
    await assert.rejects(
      directory.create({ ...group, capacity: 1 }),
      /Invalid LFG capacity/,
    );
    await directory.create(group);
    assert.equal((await directory.list("2")).length, 1);
  } finally {
    await rm(path, { recursive: true });
  }
});

test("validates the complete persisted LFG contract", () => {
  for (const value of [undefined, null, [], "state"]) {
    assert.throws(() => parseLfgState(value), /must be an object/);
  }
  assert.throws(() => parseLfgState({ version: 2 }), /version/);
  assert.throws(() => parseLfgState({ version: 1 }), /contain groups/);
  assert.throws(
    () => parseLfgState({ version: 1, groups: [null] }),
    /group must be an object/,
  );
  const cases: Array<[Partial<Record<keyof LfgGroup, unknown>>, RegExp]> = [
    [{ id: 1 }, /group ID/],
    [{ id: "../file" }, /group ID/],
    [{ guildId: null }, /guild ID/],
    [{ ownerId: {} }, /owner ID/],
    [{ activity: 1 }, /activity/],
    [{ activity: " " }, /activity/],
    [{ activity: "x".repeat(81) }, /activity/],
    [{ capacity: "2" }, /capacity/],
    [{ capacity: 2.5 }, /capacity/],
    [{ capacity: 1 }, /capacity/],
    [{ capacity: 41 }, /capacity/],
    [{ memberIds: null }, /members/],
    [{ memberIds: [null] }, /members/],
    [{ memberIds: ["4"] }, /owner must be a member/],
    [{ memberIds: ["3", "3"] }, /Duplicate LFG members/],
    [{ memberIds: ["3", "4", "5"] }, /exceeds capacity/],
    [{ expiresAt: "100" }, /expiry/],
    [{ expiresAt: 1.5 }, /expiry/],
    [{ expiresAt: 0 }, /expiry/],
  ];
  for (const [overrides, error] of cases) {
    assert.throws(
      () => parseLfgState({ version: 1, groups: [{ ...group, ...overrides }] }),
      error,
    );
  }
  assert.throws(
    () => parseLfgState({ version: 1, groups: [group, group] }),
    /Duplicate LFG group ID/,
  );
  assert.throws(
    () => parseLfgState({
      version: 1,
      groups: [group, { ...group, id: "9" }],
    }),
    /Duplicate active LFG owner/,
  );
  assert.throws(
    () => parseLfgState({
      version: 1,
      groups: Array.from({ length: 11 }, (_, index) => ({
        ...group,
        id: String(index + 1),
        ownerId: String(index + 1),
        memberIds: [String(index + 1)],
      })),
    }),
    /Too many LFG groups/,
  );
  assert.deepEqual(
    parseLfgState({ version: 1, groups: [group], extraField: true }),
    { version: 1, groups: [group] },
  );
});
