import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const GROUP_LIFETIME_MS = 2 * 60 * 60 * 1000;

export interface LfgGroup {
  id: string;
  guildId: string;
  ownerId: string;
  activity: string;
  capacity: number;
  memberIds: string[];
  expiresAt: number;
}

export interface LfgAnnouncement {
  channelId: string;
  messageId: string;
  webhookId?: string;
}

export interface LfgPost {
  group: LfgGroup;
  announcement: LfgAnnouncement;
  status: "open" | "closed" | "expired";
}

interface LfgState {
  version: 1;
  groups: LfgGroup[];
  posts: LfgPost[];
}

export class LfgError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}$/.test(value);
}

function parseGroup(raw: unknown): LfgGroup {
  assert(isRecord(raw), "LFG group must be an object");
  assert(isDiscordId(raw.id), "Invalid LFG group ID");
  assert(isDiscordId(raw.guildId), "Invalid LFG guild ID");
  assert(isDiscordId(raw.ownerId), "Invalid LFG owner ID");
  assert(
    typeof raw.activity === "string" &&
      raw.activity.trim().length > 0 &&
      raw.activity.length <= 80,
    "Invalid LFG activity",
  );
  assert(
    typeof raw.capacity === "number" &&
      Number.isInteger(raw.capacity) &&
      raw.capacity >= 2 &&
      raw.capacity <= 40,
    "Invalid LFG capacity",
  );
  assert(
    Array.isArray(raw.memberIds) && raw.memberIds.every(isDiscordId),
    "Invalid LFG members",
  );
  const memberIds: string[] = raw.memberIds;
  assert(memberIds.includes(raw.ownerId), "LFG owner must be a member");
  assert.equal(
    new Set(memberIds).size,
    memberIds.length,
    "Duplicate LFG members",
  );
  assert(memberIds.length <= raw.capacity, "LFG group exceeds capacity");
  assert(
    typeof raw.expiresAt === "number" &&
      Number.isSafeInteger(raw.expiresAt) &&
      raw.expiresAt > 0,
    "Invalid LFG expiry",
  );
  return {
    id: raw.id,
    guildId: raw.guildId,
    ownerId: raw.ownerId,
    activity: raw.activity,
    capacity: raw.capacity,
    memberIds: [...memberIds],
    expiresAt: raw.expiresAt,
  };
}

export function parseLfgState(value: unknown): LfgState {
  assert(isRecord(value), "LFG state must be an object");
  assert.equal(value.version, 1, "Unsupported LFG state version");
  assert(Array.isArray(value.groups), "LFG state must contain groups");
  const ids = new Set<string>();
  const owners = new Set<string>();
  const guildCounts = new Map<string, number>();
  const groups = value.groups.map((raw: unknown) => {
    const group = parseGroup(raw);
    assert(!ids.has(group.id), "Duplicate LFG group ID");
    const ownerKey = `${group.guildId}:${group.ownerId}`;
    assert(!owners.has(ownerKey), "Duplicate active LFG owner");
    const guildCount = (guildCounts.get(group.guildId) ?? 0) + 1;
    assert(guildCount <= 10, "Too many LFG groups in one server");
    ids.add(group.id);
    owners.add(ownerKey);
    guildCounts.set(group.guildId, guildCount);
    return group;
  });
  const rawPosts = value.posts === undefined ? [] : value.posts;
  assert(Array.isArray(rawPosts), "Invalid LFG posts");
  const postIds = new Set<string>();
  const posts = rawPosts.map((raw: unknown): LfgPost => {
    assert(isRecord(raw), "LFG post must be an object");
    const group = parseGroup(raw.group);
    assert(isRecord(raw.announcement), "Invalid LFG announcement");
    assert(isDiscordId(raw.announcement.channelId), "Invalid LFG channel ID");
    assert(isDiscordId(raw.announcement.messageId), "Invalid LFG message ID");
    const webhookId = raw.announcement.webhookId;
    assert(
      webhookId === undefined || isDiscordId(webhookId),
      "Invalid LFG webhook ID",
    );
    assert(
      raw.status === "open" || raw.status === "closed" || raw.status === "expired",
      "Invalid LFG post status",
    );
    assert(!postIds.has(group.id), "Duplicate LFG post");
    postIds.add(group.id);
    return {
      group,
      announcement: {
        channelId: raw.announcement.channelId,
        messageId: raw.announcement.messageId,
        ...(webhookId === undefined ? {} : { webhookId }),
      },
      status: raw.status,
    };
  });
  return { version: 1, groups, posts };
}

export class LfgDirectory {
  private operation: Promise<void> = Promise.resolve();

  public constructor(private readonly dataDir: string) {}

  private async load(): Promise<LfgState> {
    try {
      return parseLfgState(
        JSON.parse(await readFile(join(this.dataDir, "lfg.json"), "utf8")),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { version: 1, groups: [], posts: [] };
      }
      throw new Error("Could not load LFG state", { cause: error });
    }
  }

  private async transact<T>(
    now: number,
    action: (state: LfgState) => T,
  ): Promise<T> {
    const result = this.operation.then(async () => {
      const state = await this.load();
      for (const post of state.posts) {
        if (post.status === "open" && post.group.expiresAt <= now) {
          post.status = "expired";
        }
      }
      state.groups = state.groups.filter((group) => group.expiresAt > now);
      const value = action(state);
      await mkdir(this.dataDir, { recursive: true });
      const path = join(this.dataDir, "lfg.json");
      await writeFile(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(`${path}.tmp`, path);
      return value;
    });
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  public create(
    input: Omit<LfgGroup, "memberIds" | "expiresAt">,
    now = Date.now(),
  ): Promise<LfgGroup> {
    return this.transact(now, (state) => {
      if (input.activity.trim().length === 0) {
        throw new LfgError("Give your group a dungeon, quest, or raid name.");
      }
      const guildGroups = state.groups.filter(
        (group) => group.guildId === input.guildId,
      );
      if (guildGroups.some((group) => group.ownerId === input.ownerId)) {
        throw new LfgError("You already lead a group. Close it before creating another.");
      }
      if (guildGroups.length >= 10) {
        throw new LfgError("This server already has ten active groups. Try again later.");
      }
      const group = {
        ...input,
        activity: input.activity.trim().replace(/\s+/g, " "),
        memberIds: [input.ownerId],
        expiresAt: now + GROUP_LIFETIME_MS,
      };
      state.groups.push(group);
      parseLfgState(state);
      return group;
    });
  }

  public list(guildId: string, now = Date.now()): Promise<LfgGroup[]> {
    return this.transact(now, (state) =>
      state.groups.filter((group) => group.guildId === guildId),
    );
  }

  public update(
    guildId: string,
    groupId: string,
    userId: string,
    action: "show" | "join" | "leave" | "close",
    now = Date.now(),
  ): Promise<{ group: LfgGroup; closed: boolean; changed: boolean }> {
    return this.transact(now, (state) => {
      const group = state.groups.find(
        (entry) => entry.guildId === guildId && entry.id === groupId,
      );
      if (!group) {
        throw new LfgError("Group not found in this server, closed, or expired.");
      }
      let closed = false;
      const previousMembers = group.memberIds.join(",");
      if (action === "close") {
        if (group.ownerId !== userId) {
          throw new LfgError("Only the group leader can close this group.");
        }
        closed = true;
      } else if (action === "join" && !group.memberIds.includes(userId)) {
        if (group.memberIds.length >= group.capacity) {
          throw new LfgError("This group is full.");
        }
        if (!isDiscordId(userId)) {
          throw new LfgError("Invalid Discord user ID.");
        }
        group.memberIds.push(userId);
      } else if (action === "leave") {
        if (group.ownerId === userId) {
          closed = true;
        } else {
          group.memberIds = group.memberIds.filter((id) => id !== userId);
        }
      }
      if (closed) {
        state.groups = state.groups.filter((entry) => entry.id !== group.id);
      }
      const post = state.posts.find((entry) => entry.group.id === group.id);
      if (post) {
        post.group = group;
        if (closed) {
          post.status = "closed";
        }
      }
      return {
        group,
        closed,
        changed: closed || previousMembers !== group.memberIds.join(","),
      };
    });
  }

  public attachAnnouncement(
    group: LfgGroup,
    announcement: LfgAnnouncement,
    now = Date.now(),
  ): Promise<void> {
    return this.transact(now, (state) => {
      const current = state.groups.find((entry) => entry.id === group.id);
      const status = current
        ? "open"
        : group.expiresAt <= now ? "expired" : "closed";
      state.posts = state.posts.filter((post) => post.group.id !== group.id);
      state.posts.push({ group: current ?? group, announcement, status });
      parseLfgState(state);
    });
  }

  public posts(now = Date.now()): Promise<LfgPost[]> {
    return this.transact(now, (state) => state.posts);
  }

  public forgetPost(groupId: string): Promise<void> {
    return this.transact(Date.now(), (state) => {
      state.posts = state.posts.filter((post) => post.group.id !== groupId);
    });
  }
}
