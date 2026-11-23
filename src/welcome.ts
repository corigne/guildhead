import { readFileSync } from "node:fs";
import { MessageFlags, type MessageCreateOptions } from "discord.js";
import type { Config } from "./config.js";

export const defaultWelcomeMessage = `Hey, welcome in!

Guildhead helps with WoW item lookups, finding crafters, and getting a group together.

Try \`{help}\` in {commandChannel} for the full guide. A few useful commands:
- \`{wow} query:Hearthstone\` looks up an item.
- \`{craft} find profession:Blacksmithing\` finds crafters. You can list yours manually too.
- \`{lfg} list\` shows groups, and \`{roster}\` shows the saved guild roster when configured.

Linking your account is optional. If you'd like synced crafter skills, use \`{character} link\`, then \`{character} main\` to choose your main. Class and profession roles are also available when the server enables them.

The commands above work without linking. Use whatever helps, and play at your own pace.

Battle.net handles sign-in, and your password stays private. \`{character} link\` explains what's shared before you sign in; \`{character} unlink\` removes your saved link.

Want to see how it works? The code and privacy details are public: {source}`;

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
