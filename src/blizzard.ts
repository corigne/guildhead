import type { GuildRosterConfig } from "./config.js";
import type { RosterMember } from "./roster-state.js";

const REQUEST_TIMEOUT_MS = 15_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface BlizzardRosterResponse {
  members?: Array<{
    character?: {
      id?: number;
      name?: string;
      surname?: string;
      slug?: string;
      level?: number;
      playable_class?: { id?: number };
    };
    rank?: number;
  }>;
}

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

    const token = (await response.json()) as TokenResponse;
    if (!token.access_token || !token.expires_in) {
      throw new Error("Battle.net token response was incomplete");
    }
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + token.expires_in * 1000;
    return token.access_token;
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

    const roster = (await response.json()) as BlizzardRosterResponse;
    if (!Array.isArray(roster.members)) {
      throw new Error("Blizzard guild roster response had no members array");
    }

    return roster.members.map((entry) => {
      const character = entry.character;
      if (
        !character?.id ||
        !character.name ||
        !character.slug ||
        character.level === undefined ||
        entry.rank === undefined
      ) {
        throw new Error("Blizzard guild roster contained an invalid member");
      }
      const classId = character.playable_class?.id;
      return {
        id: character.id.toString(),
        name: [character.name, character.surname].filter(Boolean).join(" "),
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
}
