import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BattleNetUserClient } from "./battlenet-user.js";
import type { GuildRosterConfig } from "./config.js";
import type { RosterState } from "./roster-state.js";

export interface LinkedCharacter {
  id: string;
  name: string;
}

export interface CharacterLink {
  guildId: string;
  discordUserId: string;
  region: GuildRosterConfig["region"];
  verifiedAt: number;
  characters: LinkedCharacter[];
}

export class CharacterLinkError extends Error {}

function record(value: unknown): asserts value is Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid character link object");
}

export function parseCharacterLinks(value: unknown): CharacterLink[] {
  record(value);
  assert("version" in value && value.version === 1, "Unsupported character link version");
  assert("links" in value && Array.isArray(value.links), "Missing character links");
  const keys = new Set<string>();
  for (const raw of value.links as unknown[]) {
    record(raw);
    for (const field of ["guildId", "discordUserId"]) {
      assert(typeof raw[field] === "string" && /^\d{1,20}$/.test(raw[field]), "Invalid link owner");
    }
    assert(["us", "eu", "kr", "tw"].includes(raw.region as string), "Invalid character region");
    assert(typeof raw.verifiedAt === "number" && Number.isSafeInteger(raw.verifiedAt) && raw.verifiedAt > 0 && raw.verifiedAt <= 8_640_000_000_000_000, "Invalid verification time");
    assert(Array.isArray(raw.characters) && raw.characters.length > 0, "Missing linked characters");
    const ids = new Set<string>();
    for (const character of raw.characters as unknown[]) {
      record(character);
      assert(typeof character.id === "string" && /^\d{1,20}$/.test(character.id), "Invalid linked character ID");
      assert(typeof character.name === "string" && character.name.trim().length > 0, "Invalid linked character name");
      assert(!ids.has(character.id), "Duplicate linked character");
      ids.add(character.id);
    }
    const key = `${raw.guildId}:${raw.discordUserId}`;
    assert(!keys.has(key), "Duplicate character link owner");
    keys.add(key);
  }
  return value.links as CharacterLink[];
}

export class CharacterLinkStore {
  private operation: Promise<void> = Promise.resolve();

  public constructor(private readonly dataDir: string) {}

  private transact<T>(action: (links: CharacterLink[]) => { value: T; save?: boolean }): Promise<T> {
    const work = this.operation.then(async () => {
      const path = join(this.dataDir, "character-links.json");
      let links: CharacterLink[];
      try {
        links = parseCharacterLinks(JSON.parse(await readFile(path, "utf8")));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        links = [];
      }
      const result = action(links);
      if (result.save) {
        const state = { version: 1, links };
        parseCharacterLinks(state);
        await mkdir(this.dataDir, { recursive: true });
        await writeFile(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
        await rename(`${path}.tmp`, path);
      }
      return result.value;
    });
    this.operation = work.then(() => undefined, () => undefined);
    return work;
  }

  public get(guildId: string, discordUserId: string): Promise<CharacterLink | undefined> {
    return this.transact(links => ({ value: links.find(link => link.guildId === guildId && link.discordUserId === discordUserId) }));
  }

  public save(link: CharacterLink): Promise<void> {
    return this.transact(links => {
      const index = links.findIndex(entry => entry.guildId === link.guildId && entry.discordUserId === link.discordUserId);
      if (index >= 0) links[index] = link;
      else links.push(link);
      return { value: undefined, save: true };
    });
  }

  public remove(guildId: string, discordUserId: string): Promise<boolean> {
    return this.transact(links => {
      const index = links.findIndex(link => link.guildId === guildId && link.discordUserId === discordUserId);
      if (index < 0) return { value: false };
      links.splice(index, 1);
      return { value: true, save: true };
    });
  }
}

interface PendingLink {
  guildId: string;
  discordUserId: string;
  expiresAt: number;
  phase: "login" | "exchanging" | "review";
  reviewed: boolean;
  link?: CharacterLink;
}

export class CharacterLinks {
  private readonly pending = new Map<string, PendingLink>();

  public constructor(
    private readonly store: CharacterLinkStore,
    private readonly blizzard: Pick<BattleNetUserClient, "authorizationUrl" | "ownedCharacters">,
    private readonly roster: () => Promise<RosterState | undefined>,
    private readonly region: GuildRosterConfig["region"],
    private readonly now: () => number = Date.now,
  ) {}

  private prune(): void {
    for (const [state, session] of this.pending) {
      if (session.expiresAt <= this.now()) this.pending.delete(state);
    }
  }

  private cancel(guildId: string, userId: string): void {
    for (const [state, session] of this.pending) {
      if (session.guildId === guildId && session.discordUserId === userId) this.pending.delete(state);
    }
  }

  public start(guildId: string, discordUserId: string): string {
    this.prune();
    this.cancel(guildId, discordUserId);
    if (this.pending.size >= 1_000) throw new CharacterLinkError("Too many pending logins. Try again later.");
    const state = randomBytes(32).toString("base64url");
    this.pending.set(state, {
      guildId, discordUserId, expiresAt: this.now() + 10 * 60_000, phase: "login", reviewed: false,
    });
    return this.blizzard.authorizationUrl(state);
  }

  public async callback(state: string, code: string | null): Promise<void> {
    this.prune();
    const session = this.pending.get(state);
    if (!session || session.phase !== "login") throw new CharacterLinkError("Login expired, already used, or invalid. Start again in Discord.");
    session.phase = "exchanging";
    try {
      if (!code) throw new CharacterLinkError("Battle.net authorization was declined. Start again in Discord.");
      const ids = await this.blizzard.ownedCharacters(code);
      const roster = await this.roster();
      if (!roster) throw new CharacterLinkError("No guild roster available. Try again after a successful poll.");
      const characters = Object.values(roster.members)
        .filter(member => ids.has(member.id))
        .map(member => ({ id: member.id, name: member.name }));
      if (characters.length === 0) throw new CharacterLinkError("No owned characters match the confirmed guild roster. Check region and allow time for Blizzard snapshots to update.");
      if (this.pending.get(state) !== session || session.expiresAt <= this.now()) {
        throw new CharacterLinkError("Login cancelled or expired. Start again in Discord.");
      }
      session.link = {
        guildId: session.guildId, discordUserId: session.discordUserId,
        region: this.region, verifiedAt: this.now(), characters,
      };
      session.phase = "review";
    } catch (error) {
      this.pending.delete(state);
      throw error;
    }
  }

  public async list(guildId: string, userId: string): Promise<{ saved?: CharacterLink; pending?: CharacterLink }> {
    this.prune();
    const session = [...this.pending.values()].find(entry => entry.guildId === guildId && entry.discordUserId === userId && entry.phase === "review");
    if (session) session.reviewed = true;
    const saved = await this.store.get(guildId, userId);
    return { ...(saved ? { saved } : {}), ...(session?.link ? { pending: session.link } : {}) };
  }

  public async confirm(guildId: string, userId: string): Promise<void> {
    this.prune();
    const session = [...this.pending.values()].find(entry => entry.guildId === guildId && entry.discordUserId === userId && entry.phase === "review");
    if (!session?.link || !session.reviewed) throw new CharacterLinkError("Use the list subcommand to review your authorized characters before confirming.");
    this.cancel(guildId, userId);
    await this.store.save(session.link);
  }

  public async unlink(guildId: string, userId: string): Promise<boolean> {
    this.cancel(guildId, userId);
    return this.store.remove(guildId, userId);
  }
}
