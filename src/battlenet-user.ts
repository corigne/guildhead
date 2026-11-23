import assert from "node:assert/strict";

import { parseBlizzardToken } from "./blizzard.js";
import type { GuildRosterConfig } from "./config.js";

function record(value: unknown): asserts value is Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid account profile object");
}

export function parseOwnedCharacterIds(value: unknown): ReadonlySet<string> {
  record(value);
  assert(Array.isArray(value.wow_accounts), "Missing WoW accounts");
  const ids = new Set<string>();
  for (const account of value.wow_accounts) {
    record(account);
    assert(Array.isArray(account.characters), "Missing account characters");
    for (const character of account.characters) {
      record(character);
      assert(
        typeof character.id === "number" && Number.isSafeInteger(character.id) && character.id > 0,
        "Invalid owned character ID",
      );
      ids.add(String(character.id));
    }
  }
  return ids;
}

export class BattleNetUserClient {
  public constructor(
    private readonly config: Pick<GuildRosterConfig, "clientId" | "clientSecret" | "region">,
    private readonly redirectUri: string,
  ) {}

  public authorizationUrl(state: string): string {
    const url = new URL("https://oauth.battle.net/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "wow.profile",
      state,
    }).toString();
    return url.toString();
  }

  public async ownedCharacters(code: string): Promise<ReadonlySet<string>> {
    const response = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, redirect_uri: this.redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    assert(response.ok, `Battle.net code exchange failed (${response.status})`);
    const raw: unknown = await response.json();
    const token = parseBlizzardToken(raw);
    record(raw);
    assert(
      typeof raw.token_type === "string" && raw.token_type.toLowerCase() === "bearer" &&
        typeof raw.scope === "string" &&
        raw.scope.split(/\s+/).includes("wow.profile"),
      "Battle.net did not grant wow.profile access",
    );
    const url = new URL("/profile/user/wow", `https://${this.config.region}.api.blizzard.com`);
    url.searchParams.set("namespace", `profile-forever-${this.config.region}`);
    const profile = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    assert(profile.ok, `Forever account lookup failed (${profile.status})`);
    return parseOwnedCharacterIds(await profile.json());
  }
}
