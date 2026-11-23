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
  channelIds: ReadonlySet<string>;
  flavors: readonly Flavor[];
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

export function loadConfig(): Config {
  const channelIds = new Set(parseList(required("DISCORD_CHANNEL_IDS")));
  const commandName = parseCommandName(process.env.DISCORD_COMMAND_NAME);
  const helpCommandName = parseCommandName(
    process.env.DISCORD_HELP_COMMAND_NAME,
    "help",
    "DISCORD_HELP_COMMAND_NAME",
  );
  const flavors = parseFlavors(
    process.env.WOWHEAD_FLAVORS?.trim() || "forever",
  );

  if (channelIds.size === 0) {
    throw new Error("DISCORD_CHANNEL_IDS must contain at least one channel ID");
  }
  if (flavors.length === 0) {
    throw new Error("WOWHEAD_FLAVORS must contain at least one flavor");
  }
  if (commandName === helpCommandName) {
    throw new Error(
      "DISCORD_COMMAND_NAME and DISCORD_HELP_COMMAND_NAME must be different",
    );
  }

  return {
    token: readSecret("DISCORD_TOKEN"),
    ...(process.env.DISCORD_WEBHOOK_URL?.trim()
      ? { webhookUrl: process.env.DISCORD_WEBHOOK_URL.trim() }
      : {}),
    commandName,
    helpCommandName,
    channelIds,
    flavors,
  };
}
