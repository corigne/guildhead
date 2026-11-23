import type { GuildRosterConfig } from "./config.js";
import type { RosterMember } from "./roster-state.js";

const REQUEST_TIMEOUT_MS = 15_000;

const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: "Warrior",
  2: "Paladin",
  3: "Hunter",
  4: "Rogue",
  5: "Priest",
  7: "Shaman",
  8: "Mage",
  9: "Warlock",
  11: "Druid",
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function parseBlizzardToken(
  value: unknown,
): { accessToken: string; expiresIn: number } {
  const token = record(value, "Battle.net token response");
  if (
    typeof token.access_token !== "string" ||
    token.access_token.length === 0 ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0
  ) {
    throw new Error("Battle.net token response was incomplete");
  }
  return {
    accessToken: token.access_token,
    expiresIn: token.expires_in,
  };
}

export function parseBlizzardRoster(value: unknown): RosterMember[] {
  const roster = record(value, "Blizzard guild roster response");
  if (!Array.isArray(roster.members)) {
    throw new Error("Blizzard guild roster response had no members array");
  }

  return roster.members.map((rawEntry) => {
    const entry = record(rawEntry, "Blizzard guild roster member");
    const character = record(
      entry.character,
      "Blizzard guild roster character",
    );
    const classReference =
      character.playable_class === undefined
        ? undefined
        : record(
            character.playable_class,
            "Blizzard playable class reference",
          );
    if (
      typeof character.id !== "number" ||
      !Number.isInteger(character.id) ||
      typeof character.name !== "string" ||
      character.name.length === 0 ||
      (character.surname !== undefined &&
        typeof character.surname !== "string") ||
      typeof character.slug !== "string" ||
      character.slug.length === 0 ||
      typeof character.level !== "number" ||
      !Number.isInteger(character.level) ||
      typeof entry.rank !== "number" ||
      !Number.isInteger(entry.rank) ||
      (classReference?.id !== undefined &&
        (typeof classReference.id !== "number" ||
          !Number.isInteger(classReference.id)))
    ) {
      throw new Error("Blizzard guild roster contained an invalid member");
    }

    const classId = classReference?.id;
    return {
      id: character.id.toString(),
      name: [character.name, character.surname]
        .filter(Boolean)
        .join(" "),
      slug: character.slug,
      level: character.level,
      className:
        classId !== undefined
          ? (CLASS_NAMES[classId] ?? `Class ${classId}`)
          : "Unknown class",
      rank: entry.rank,
    };
  });
}

export function slugifyGuildName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export class BlizzardClient {
  private accessToken?: string;
  private tokenExpiresAt = 0;

  public constructor(private readonly config: GuildRosterConfig) {}

  private async token(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 60_000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    const response = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "guildhead/1.0",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Battle.net token request failed with HTTP ${response.status}`,
      );
    }

    const token = parseBlizzardToken(await response.json());
    this.accessToken = token.accessToken;
    this.tokenExpiresAt = Date.now() + token.expiresIn * 1000;
    return token.accessToken;
  }

  public async guildRoster(): Promise<RosterMember[]> {
    const guildSlug = slugifyGuildName(this.config.guildName);
    if (!guildSlug) {
      throw new Error("BLIZZARD_GUILD_NAME does not produce a valid slug");
    }

    const url = new URL(
      `/data/wow/guild/${guildSlug}/roster`,
      `https://${this.config.region}.api.blizzard.com`,
    );
    url.searchParams.set(
      "namespace",
      `profile-forever-${this.config.region}`,
    );
    url.searchParams.set(
      "locale",
      this.config.region === "eu" ? "en_GB" : "en_US",
    );

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        Accept: "application/json",
        "User-Agent": "guildhead/1.0",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Blizzard guild roster request failed with HTTP ${response.status}`,
      );
    }

    return parseBlizzardRoster(await response.json());
  }
}
