import { readFileSync } from "node:fs";

export const flavorDefinitions = {
  forever: { label: "Forever", path: "forever/", dataEnv: 16 },
  retail: { label: "Retail", path: "", dataEnv: 1 },
  classic: { label: "Classic Era", path: "classic/", dataEnv: 4 },
  cata: { label: "Cataclysm Classic", path: "cata/", dataEnv: 11 },
} as const;

export type Flavor = keyof typeof flavorDefinitions;

export interface Config {
  token: string;
  webhookUrl?: string;
  commandName: string;
  helpCommandName: string;
  craftCommandName: string;
  lfgCommandName: string;
  rosterCommandName: string;
  characterCommandName: string;
  characterRedirectUri?: string;
  roleSyncEnabled: boolean;
  welcomeEnabled: boolean;
  welcomeMessageFile?: string;
  channelIds: ReadonlySet<string>;
  flavors: readonly Flavor[];
  dataDir: string;
  guildRoster?: GuildRosterConfig;
}

export interface GuildRosterConfig {
  clientId: string;
  clientSecret: string;
  region: "us" | "eu" | "kr" | "tw";
  guildName: string;
  announcementChannelId: string;
  events: ReadonlySet<"joins" | "leaves" | "ranks">;
  pollMinutes: number;
  dataDir: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readSecret(name: string): string {
  const file = process.env[`${name}_FILE`]?.trim();
  if (!file) {
    return required(name);
  }

  let value: string;
  try {
    value = readFileSync(file, "utf8").trim();
  } catch (error) {
    throw new Error(`Could not read ${name}_FILE at ${file}`, {
      cause: error,
    });
  }

  if (!value) {
    throw new Error(`${name}_FILE at ${file} is empty`);
  }
  return value;
}

function readOptionalSecret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) {
    let value: string;
    try {
      value = readFileSync(file, "utf8").trim();
    } catch (error) {
      throw new Error(`Could not read ${name}_FILE at ${file}`, {
        cause: error,
      });
    }
    return value || undefined;
  }
  return process.env[name]?.trim() || undefined;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseFlavors(value: string): Flavor[] {
  const flavors = parseList(value);
  const invalid = flavors.filter(
    (flavor): flavor is string => !(flavor in flavorDefinitions),
  );
  if (invalid.length > 0) {
    throw new Error(
      `WOWHEAD_FLAVORS contains unsupported values: ${invalid.join(", ")}`,
    );
  }
  return flavors as Flavor[];
}

export function parseCommandName(
  value: string | undefined,
  defaultName = "wow",
  variableName = "DISCORD_COMMAND_NAME",
): string {
  const commandName = value?.trim() || defaultName;
  if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) {
    throw new Error(
      `${variableName} must contain 1-32 lowercase letters, numbers, underscores, or hyphens`,
    );
  }
  return commandName;
}

function parseGuildRosterConfig(dataDir: string): GuildRosterConfig | undefined {
  const clientId = process.env.BLIZZARD_CLIENT_ID?.trim();
  const clientSecret = readOptionalSecret("BLIZZARD_CLIENT_SECRET");
  if (!clientId && !clientSecret) {
    return undefined;
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      "BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be configured together",
    );
  }

  const region = process.env.BLIZZARD_REGION?.trim() || "us";
  if (!["us", "eu", "kr", "tw"].includes(region)) {
    throw new Error("BLIZZARD_REGION must be us, eu, kr, or tw");
  }

  const guildName = required("BLIZZARD_GUILD_NAME");
  const announcementChannelId = required("GUILD_ANNOUNCEMENT_CHANNEL_ID");
  const events = new Set(
    parseList(process.env.GUILD_ANNOUNCE_EVENTS?.trim() || "joins"),
  );
  const invalidEvents = [...events].filter(
    (event) => !["joins", "leaves", "ranks"].includes(event),
  );
  if (invalidEvents.length > 0) {
    throw new Error(
      `GUILD_ANNOUNCE_EVENTS contains unsupported values: ${invalidEvents.join(", ")}`,
    );
  }

  const pollMinutes = Number.parseInt(
    process.env.GUILD_ROSTER_POLL_MINUTES?.trim() || "10",
    10,
  );
  if (!Number.isInteger(pollMinutes) || pollMinutes < 2 || pollMinutes > 1440) {
    throw new Error(
      "GUILD_ROSTER_POLL_MINUTES must be an integer between 2 and 1440",
    );
  }

  return {
    clientId,
    clientSecret,
    region: region as GuildRosterConfig["region"],
    guildName,
    announcementChannelId,
    events: events as GuildRosterConfig["events"],
    pollMinutes,
    dataDir,
  };
}

export function loadConfig(): Config {
  const channelIds = new Set(parseList(required("DISCORD_CHANNEL_IDS")));
  const commandName = parseCommandName(process.env.DISCORD_COMMAND_NAME);
  const helpCommandName = parseCommandName(
    process.env.DISCORD_HELP_COMMAND_NAME,
    "help",
    "DISCORD_HELP_COMMAND_NAME",
  );
  const craftCommandName = parseCommandName(
    process.env.DISCORD_CRAFT_COMMAND_NAME,
    "craft",
    "DISCORD_CRAFT_COMMAND_NAME",
  );
  const lfgCommandName = parseCommandName(
    process.env.DISCORD_LFG_COMMAND_NAME,
    "lfg",
    "DISCORD_LFG_COMMAND_NAME",
  );
  const rosterCommandName = parseCommandName(
    process.env.DISCORD_ROSTER_COMMAND_NAME,
    "roster",
    "DISCORD_ROSTER_COMMAND_NAME",
  );
  const characterCommandName = parseCommandName(
    process.env.DISCORD_CHARACTER_COMMAND_NAME,
    "character",
    "DISCORD_CHARACTER_COMMAND_NAME",
  );
  const dataDir = process.env.GUILDHEAD_DATA_DIR?.trim() || "/data";
  const flavors = parseFlavors(
    process.env.WOWHEAD_FLAVORS?.trim() || "forever",
  );
  const guildRoster = parseGuildRosterConfig(dataDir);
  const characterRedirectUri = process.env.BLIZZARD_OAUTH_REDIRECT_URI?.trim();
  const roleSync = process.env.GUILD_ROLE_SYNC_ENABLED?.trim() || "false";
  const welcome = process.env.GUILD_WELCOME_ENABLED?.trim() || "false";
  if (welcome !== "true" && welcome !== "false") throw new Error("GUILD_WELCOME_ENABLED must be true or false");
  const welcomeMessageFile = process.env.GUILD_WELCOME_MESSAGE_FILE?.trim();
  if (roleSync !== "true" && roleSync !== "false") throw new Error("GUILD_ROLE_SYNC_ENABLED must be true or false");
  if (roleSync === "true" && !characterRedirectUri) throw new Error("Role sync requires character linking");
  if (characterRedirectUri) {
    let url: URL;
    try {
      url = new URL(characterRedirectUri);
    } catch {
      throw new Error("BLIZZARD_OAUTH_REDIRECT_URI must be a valid HTTPS callback URL");
    }
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/oauth/battlenet/callback" || url.search || url.hash
    ) {
      throw new Error("BLIZZARD_OAUTH_REDIRECT_URI must use HTTPS and /oauth/battlenet/callback without credentials, query, or fragment");
    }
    if (!guildRoster) throw new Error("Character linking requires the Blizzard guild roster configuration");
  }

  if (channelIds.size === 0) {
    throw new Error("DISCORD_CHANNEL_IDS must contain at least one channel ID");
  }
  if (flavors.length === 0) {
    throw new Error("WOWHEAD_FLAVORS must contain at least one flavor");
  }
  if (
    new Set([
      commandName, helpCommandName, craftCommandName, lfgCommandName, rosterCommandName,
      characterCommandName,
    ]).size !== 6
  ) {
    throw new Error(
      "Discord command names must be different",
    );
  }

  return {
    token: readSecret("DISCORD_TOKEN"),
    ...(process.env.DISCORD_WEBHOOK_URL?.trim()
      ? { webhookUrl: process.env.DISCORD_WEBHOOK_URL.trim() }
      : {}),
    commandName,
    helpCommandName,
    craftCommandName,
    lfgCommandName,
    rosterCommandName,
    characterCommandName,
    ...(characterRedirectUri ? { characterRedirectUri } : {}),
    roleSyncEnabled: roleSync === "true",
    welcomeEnabled: welcome === "true",
    ...(welcomeMessageFile ? { welcomeMessageFile } : {}),
    channelIds,
    flavors,
    dataDir,
    ...(guildRoster ? { guildRoster } : {}),
  };
}
