import {
  ChannelType,
  DiscordAPIError,
  escapeMarkdown,
  RESTJSONErrorCodes,
  type Client,
  type TextChannel,
  type WebhookClient,
} from "discord.js";

import { buildGroupEmbed, type LfgTransport } from "./lfg-communications.js";
import type { LfgAnnouncement, LfgGroup, LfgPost } from "./lfg-directory.js";

export class DiscordLfgTransport implements LfgTransport {
  public constructor(
    private readonly client: Pick<Client, "channels" | "users">,
    private readonly linkedChannelIds: ReadonlySet<string>,
    private readonly webhookForChannel: (channel: TextChannel) => Promise<WebhookClient>,
    private readonly commandName: string,
  ) {}

  public async publish(group: LfgGroup, channelId: string): Promise<LfgAnnouncement> {
    const channel = await this.client.channels.fetch(channelId);
    if (
      !channel?.isSendable() ||
      !("guildId" in channel) ||
      channel.guildId !== group.guildId
    ) {
      throw new Error("LFG announcements need a sendable channel in the same server");
    }
    const response = {
      embeds: [buildGroupEmbed(group, this.commandName)],
      allowedMentions: { parse: [] as never[] },
    };
    if (this.linkedChannelIds.has(channelId)) {
      if (channel.type !== ChannelType.GuildText) {
        throw new Error("Linked LFG announcements need a guild text channel");
      }
      const webhook = await this.webhookForChannel(channel);
      const message = await webhook.send(response);
      return { channelId, messageId: message.id, webhookId: webhook.id };
    }
    const message = await channel.send(response);
    return { channelId, messageId: message.id };
  }

  public async edit(post: LfgPost): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(post.announcement.channelId);
      if (
        !channel?.isSendable() ||
        !("guildId" in channel) ||
        channel.guildId !== post.group.guildId
      ) {
        throw new Error("LFG announcement channel is unavailable or in another server");
      }
      const response = {
        embeds: [buildGroupEmbed(post.group, this.commandName, post.status)],
        allowedMentions: { parse: [] as never[] },
      };
      if (post.announcement.webhookId !== undefined) {
        if (channel.type !== ChannelType.GuildText) {
          throw new Error("LFG webhook announcement needs a guild text channel");
        }
        const webhook = await this.webhookForChannel(channel);
        if (webhook.id !== post.announcement.webhookId) {
          throw new Error("LFG announcement webhook no longer matches");
        }
        await webhook.editMessage(post.announcement.messageId, response);
      } else {
        await channel.messages.edit(post.announcement.messageId, response);
      }
      return true;
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        error.code === RESTJSONErrorCodes.UnknownMessage
      ) {
        return false;
      }
      throw error;
    }
  }

  public async notify(
    group: LfgGroup,
    memberId: string,
    action: "join" | "leave",
  ): Promise<void> {
    const leader = await this.client.users.fetch(group.ownerId);
    const verb = action === "join" ? "joined" : "left";
    await leader.send({
      content:
        `<@${memberId}> ${verb} **${escapeMarkdown(group.activity)}** ` +
        `(${group.memberIds.length}/${group.capacity}).\n` +
        `Group ID: \`${group.id}\`. Use /${this.commandName} show in your server for the current roster.`,
      allowedMentions: { parse: [] },
    });
  }
}
