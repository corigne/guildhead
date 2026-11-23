import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ChannelType, DiscordAPIError, EmbedBuilder, RESTJSONErrorCodes,
  type Client, type TextChannel, type WebhookClient,
} from "discord.js";
import type { Config } from "./config.js";

type PostConfig = Pick<Config,
  "dataDir" | "commandChannelId" | "commandPostChannelIds" | "channelIds" |
  "helpCommandName" | "commandName" | "craftCommandName" | "lfgCommandName" |
  "rosterCommandName" | "characterCommandName"
>;
interface CommandPost { messageId: string; webhookId?: string }
interface CommandPostState { version: 1; posts: Record<string, CommandPost> }

export function parseCommandPosts(value: unknown): CommandPostState {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid command post state");
  const state = value as Record<string, unknown>;
  assert.equal(state.version, 1, "Unsupported command post version");
  assert(typeof state.posts === "object" && state.posts !== null && !Array.isArray(state.posts), "Invalid command posts");
  for (const [channelId, raw] of Object.entries(state.posts)) {
    assert(/^\d{1,20}$/.test(channelId), "Invalid command post channel");
    assert(typeof raw === "object" && raw !== null && !Array.isArray(raw), "Invalid command post");
    const post = raw as Record<string, unknown>;
    assert(typeof post.messageId === "string" && /^\d{1,20}$/.test(post.messageId), "Invalid command post message");
    assert(post.webhookId === undefined || (typeof post.webhookId === "string" && /^\d{1,20}$/.test(post.webhookId)), "Invalid command post webhook");
  }
  return value as CommandPostState;
}

export function buildCommandPost(config: PostConfig): EmbedBuilder {
  return new EmbedBuilder().setTitle("Guildhead is here to help").setColor(0xf0b132)
    .setDescription(
      "WoW tooltips, guild crafters, group finding, and optional character setup.\n" +
      (config.commandChannelId
        ? `Use <#${config.commandChannelId}> for bot commands to keep chat clear. Commands still work elsewhere where permitted.`
        : "Use the commands below wherever this server permits bot commands."),
    )
    .addFields(
      { name: "Start here", value: `\`/${config.helpCommandName}\` shows the full command guide privately.` },
      { name: "No linking needed", value:
        `\`/${config.commandName} query:Hearthstone\` — look up WoW tooltips\n` +
        `\`/${config.craftCommandName} find profession:Blacksmithing\` — find crafters; manual registration is available\n` +
        `\`/${config.lfgCommandName} list\` — find groups\n` +
        `\`/${config.rosterCommandName}\` — browse the saved guild roster when configured` },
      { name: "Entirely optional character setup", value:
        `\`/${config.characterCommandName} link\` explains access before Battle.net sign-in and saves matching guild characters automatically.\n` +
        `\`/${config.characterCommandName} main\` chooses a main and enables synced crafters and configured class/profession roles.\n` +
        `\`/${config.characterCommandName} unlink\` removes your saved link. Other role preferences stay yours to choose.` },
      { name: "Quality of life, not pressure", value:
        "You never need to link to take part. Guildhead is not here to police gameplay, roles, or progression. Battle.net handles sign-in; Guildhead never receives passwords or authenticator codes and does not store access tokens." },
      { name: "Review the code", value:
        "[Source code](https://github.com/corigne/guildhead) · [Privacy and saved data](https://github.com/corigne/guildhead/blob/main/PRIVACY.md)" },
    )
    .setFooter({ text: "Guildhead | Optional tools, no pressure" });
}

export class CommandPosts {
  private refreshing = false;

  public constructor(
    private readonly client: Pick<Client, "channels">,
    private readonly config: PostConfig,
    private readonly webhookForChannel: (channel: TextChannel) => Promise<WebhookClient>,
  ) {}

  public start(): ReturnType<typeof setInterval> {
    void this.refresh();
    return setInterval(() => { void this.refresh(); }, 10 * 60_000);
  }

  public async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const path = join(this.config.dataDir, "command-posts.json");
      let state: CommandPostState;
      try {
        state = parseCommandPosts(JSON.parse(await readFile(path, "utf8")));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        state = { version: 1, posts: {} };
      }
      for (const channelId of this.config.commandPostChannelIds) {
        try {
          const channel = await this.client.channels.fetch(channelId);
          if (!channel || channel.type !== ChannelType.GuildText) {
            throw new Error("Command posts need a guild text channel");
          }
          const response = { embeds: [buildCommandPost(this.config)], allowedMentions: { parse: [] as never[] } };
          const previous = state.posts[channelId];
          const webhook = this.config.channelIds.has(channelId) ? await this.webhookForChannel(channel) : undefined;
          let message;
          if (previous) {
            if (previous.webhookId !== webhook?.id) throw new Error("Command post transport changed; preserve the old post for operator review");
            try {
              message = webhook
                ? await webhook.editMessage(previous.messageId, response)
                : await channel.messages.edit(previous.messageId, response);
            } catch (error) {
              if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage)) throw error;
            }
          }
          if (!message) {
            message = webhook ? await webhook.send(response) : await channel.send(response);
            state.posts[channelId] = { messageId: message.id, ...(webhook ? { webhookId: webhook.id } : {}) };
            await mkdir(this.config.dataDir, { recursive: true });
            await writeFile(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
            await rename(`${path}.tmp`, path);
          }
          if (!message.pinned) await channel.messages.pin(message.id, "Guildhead command guide");
        } catch (error) {
          console.error(`Could not maintain Guildhead command post in ${channelId}:`, error);
        }
      }
    } catch (error) {
      console.error("Could not load Guildhead command posts:", error);
    } finally { this.refreshing = false; }
  }
}
