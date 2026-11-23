import { readFileSync } from "node:fs";
import { MessageFlags, type MessageCreateOptions } from "discord.js";
import type { Config } from "./config.js";

export const defaultWelcomeMessage = `Welcome! I'm **Guildhead**, a World of Warcraft quality-of-life bot.

**No linking needed:** use {help}, {wow}, {craft}, {lfg}, and {roster} for command help, tooltips, crafters, groups, and the saved guild roster. You can register crafters manually. Use {commandChannel} for commands.

**Entirely optional:** {character} link verifies your guild characters through Battle.net. Selecting a main with {character} main enables synced crafter listings and, if configured, class/profession roles. Linking is never required to participate; Guildhead is not a progression or role-enforcement tool.

Sign in only at Battle.net. Guildhead never receives your password or authenticator codes and does not store access tokens. It saves matching guild characters and public profession data, not unrelated alts. Use {character} unlink to remove the saved link; see {character} link for details before signing in.

**Open source:** review how it works, including linking and privacy: {source}`;

type WelcomeConfig = Pick<Config,
  "welcomeMessageFile" | "helpCommandName" | "commandName" | "craftCommandName" |
  "lfgCommandName" | "rosterCommandName" | "characterCommandName" | "commandChannelId"
>;

export function loadWelcomeMessage(config: WelcomeConfig): string {
  const template = config.welcomeMessageFile
    ? readFileSync(config.welcomeMessageFile, "utf8")
    : defaultWelcomeMessage;
  const values: Record<string, string> = {
    help: `/${config.helpCommandName}`,
    wow: `/${config.commandName}`,
    craft: `/${config.craftCommandName}`,
    lfg: `/${config.lfgCommandName}`,
    roster: `/${config.rosterCommandName}`,
    character: `/${config.characterCommandName}`,
    source: "https://github.com/corigne/guildhead",
    commandChannel: config.commandChannelId ? `<#${config.commandChannelId}>` : "any channel where Guildhead commands are available",
  };
  const message = template.replace(
    /\{(help|wow|craft|lfg|roster|character|source|commandChannel)\}/g,
    (_match, key: string) => values[key]!,
  ).trim();
  if (!message || message.length > 2000) {
    throw new Error("Welcome message must contain 1-2000 characters after command substitution");
  }
  return message;
}

interface WelcomeMember {
  guild: { id: string };
  user: { bot: boolean };
  send(options: MessageCreateOptions): Promise<unknown>;
}

export async function welcomeMember(
  member: WelcomeMember,
  options: { enabled: boolean; guildIds: ReadonlySet<string>; message: string },
): Promise<"sent" | "skipped" | "failed"> {
  if (!options.enabled || member.user.bot || !options.guildIds.has(member.guild.id)) {
    return "skipped";
  }
  try {
    await member.send({
      content: options.message,
      allowedMentions: { parse: [] },
      flags: MessageFlags.SuppressEmbeds,
    });
    return "sent";
  } catch {
    // Closed DMs must not turn onboarding into a public mention or retry loop.
    return "failed";
  }
}
