import { EmbedBuilder, escapeMarkdown } from "discord.js";

import {
  LfgDirectory,
  type LfgAnnouncement,
  type LfgGroup,
  type LfgPost,
} from "./lfg-directory.js";

export function buildGroupEmbed(
  group: LfgGroup,
  commandName: string,
  status: LfgPost["status"] = "open",
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`LFG: ${escapeMarkdown(group.activity)}`)
    .setColor(status === "open" ? 0x1eff00 : 0x9d9d9d)
    .setDescription(group.memberIds.map((id) => `<@${id}>`).join(", "))
    .addFields(
      { name: "Leader", value: `<@${group.ownerId}>`, inline: true },
      { name: "Members", value: `${group.memberIds.length}/${group.capacity}` },
      { name: "Group ID", value: `\`${group.id}\``, inline: true },
      {
        name: "Expires",
        value: `<t:${Math.floor(group.expiresAt / 1000)}:R>`,
        inline: true,
      },
    );
  if (status === "open") {
    embed.setFooter({
      text: `/${commandName} join group:${group.id} | /${commandName} show for current roster`,
    });
  } else {
    embed.addFields({ name: "Status", value: status === "closed" ? "Closed" : "Expired" });
    embed.setFooter({ text: "This group is no longer accepting sign-ups." });
  }
  return embed;
}

export interface LfgTransport {
  publish(group: LfgGroup, channelId: string): Promise<LfgAnnouncement>;
  edit(post: LfgPost): Promise<boolean>;
  notify(group: LfgGroup, memberId: string, action: "join" | "leave"): Promise<void>;
}

export class LfgCommunications {
  private operation: Promise<void> = Promise.resolve();
  private readonly synced = new Map<string, string>();

  public constructor(
    private readonly directory: LfgDirectory,
    private readonly transport: LfgTransport,
  ) {}

  public start(): NodeJS.Timeout {
    void this.refresh();
    const timer = setInterval(this.refresh.bind(this), 60_000);
    timer.unref();
    return timer;
  }

  public async publish(group: LfgGroup, channelId: string): Promise<void> {
    const announcement = await this.transport.publish(group, channelId);
    await this.directory.attachAnnouncement(group, announcement);
    await this.refresh();
  }

  public async changed(
    result: { group: LfgGroup; changed: boolean },
    actorId: string,
    action: string,
  ): Promise<void> {
    await this.refresh();
    if (
      result.changed &&
      actorId !== result.group.ownerId &&
      (action === "join" || action === "leave")
    ) {
      try {
        await this.transport.notify(result.group, actorId, action);
      } catch (error) {
        console.warn("Could not notify LFG leader:", error);
      }
    }
  }

  public refresh(): Promise<void> {
    const work = this.operation.then(async () => {
      const posts = await this.directory.posts();
      const activeIds = new Set(posts.map((post) => post.group.id));
      for (const id of this.synced.keys()) {
        if (!activeIds.has(id)) {
          this.synced.delete(id);
        }
      }
      for (const post of posts) {
        const fingerprint = JSON.stringify(post);
        if (this.synced.get(post.group.id) === fingerprint) {
          continue;
        }
        try {
          const exists = await this.transport.edit(post);
          if (!exists || post.status !== "open") {
            await this.directory.forgetPost(post.group.id);
            this.synced.delete(post.group.id);
          } else {
            this.synced.set(post.group.id, fingerprint);
          }
        } catch (error) {
          console.error("Could not update LFG announcement; will retry:", error);
        }
      }
    });
    this.operation = work.catch((error: unknown) => {
      console.error("Could not refresh LFG announcements:", error);
    });
    return this.operation;
  }
}
