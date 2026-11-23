import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  Client,
  EmbedBuilder,
  type SendableChannels,
} from "discord.js";

import { BlizzardClient, slugifyGuildName } from "./blizzard.js";
import type { GuildRosterConfig } from "./config.js";
import {
  initialRosterState,
  reconcileRoster,
  type RosterEvent,
  type RosterState,
} from "./roster-state.js";

function statePath(config: GuildRosterConfig): string {
  return join(
    config.dataDir,
    `guild-roster-${slugifyGuildName(config.guildName)}.json`,
  );
}

export async function loadRosterState(
  config: GuildRosterConfig,
): Promise<RosterState | undefined> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(statePath(config), "utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("members" in parsed) ||
      typeof parsed.members !== "object" ||
      parsed.members === null ||
      !("observations" in parsed) ||
      typeof parsed.observations !== "object" ||
      parsed.observations === null
    ) {
      throw new Error("stored roster state has an unsupported shape");
    }
    return parsed as RosterState;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw new Error(`Could not load guild roster state: ${String(error)}`, {
      cause: error,
    });
  }
}

export async function saveRosterState(
  config: GuildRosterConfig,
  state: RosterState,
): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  const path = statePath(config);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export function buildRosterEventEmbed(
  config: GuildRosterConfig,
  event: RosterEvent,
): EmbedBuilder {
  const fields = [
    { name: "Character", value: event.member.name, inline: true },
    { name: "Class", value: event.member.className, inline: true },
    { name: "Level", value: event.member.level.toString(), inline: true },
  ];

  if (event.type === "joins") {
    return new EmbedBuilder()
      .setTitle("Guild member joined")
      .setColor(0x1eff00)
      .setDescription(
        `**${event.member.name}** joined **${config.guildName}**.`,
      )
      .addFields(
        ...fields,
        {
          name: "Guild rank",
          value: event.member.rank.toString(),
          inline: true,
        },
      )
      .setFooter({ text: "Blizzard roster snapshot" })
      .setTimestamp();
  }

  if (event.type === "leaves") {
    return new EmbedBuilder()
      .setTitle("Guild member departed")
      .setColor(0x9d9d9d)
      .setDescription(
        `**${event.member.name}** left **${config.guildName}**.`,
      )
      .addFields(...fields)
      .setFooter({ text: "Blizzard roster snapshot" })
      .setTimestamp();
  }

  const direction =
    event.member.rank < event.previousRank ? "promoted" : "rank changed";
  return new EmbedBuilder()
    .setTitle(`Guild member ${direction}`)
    .setColor(0x0070dd)
    .setDescription(`**${event.member.name}** has a new guild rank.`)
    .addFields(
      ...fields,
      {
        name: "Previous rank",
        value: event.previousRank.toString(),
        inline: true,
      },
      {
        name: "New rank",
        value: event.member.rank.toString(),
        inline: true,
      },
    )
    .setFooter({ text: "Blizzard roster snapshot" })
    .setTimestamp();
}

export class GuildRosterMonitor {
  private readonly blizzard: Pick<BlizzardClient, "guildRoster">;
  private running = false;

  public constructor(
    private readonly discord: Client,
    private readonly config: GuildRosterConfig,
    blizzard?: Pick<BlizzardClient, "guildRoster">,
  ) {
    this.blizzard = blizzard ?? new BlizzardClient(config);
  }

  public start(): NodeJS.Timeout {
    void this.pollOnce();
    const timer = setInterval(
      this.pollOnce.bind(this),
      this.config.pollMinutes * 60 * 1000,
    );
    timer.unref();
    return timer;
  }

  private async announcementChannel(): Promise<SendableChannels> {
    const channel = await this.discord.channels.fetch(
      this.config.announcementChannelId,
    );
    if (!channel?.isSendable()) {
      throw new Error(
        `Guild announcement channel ${this.config.announcementChannelId} is not sendable`,
      );
    }
    return channel;
  }

  public async pollOnce(): Promise<void> {
    if (this.running) {
      console.warn("Skipping overlapping guild roster poll");
      return;
    }
    this.running = true;

    try {
      const currentMembers = await this.blizzard.guildRoster();
      const previousState = await loadRosterState(this.config);
      if (!previousState) {
        await saveRosterState(this.config, initialRosterState(currentMembers));
        console.log(
          `Initialized ${this.config.guildName} roster with ${currentMembers.length} members`,
        );
        return;
      }

      const result = reconcileRoster(previousState, currentMembers);
      const events = result.events.filter((event) =>
        this.config.events.has(event.type),
      );

      if (events.length > 0) {
        const channel = await this.announcementChannel();
        for (const event of events) {
          await channel.send({
            embeds: [buildRosterEventEmbed(this.config, event)],
            allowedMentions: { parse: [] },
          });
        }
      }

      await saveRosterState(this.config, result.state);
      console.log(
        `Checked ${this.config.guildName} roster: ${currentMembers.length} members, ${events.length} announcements`,
      );
    } catch (error) {
      console.error(`Guild roster poll failed for ${this.config.guildName}:`, error);
    } finally {
      this.running = false;
    }
  }
}
