import {
  EmbedBuilder,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";

import { CLASS_NAMES } from "./blizzard.js";
import type { GuildRosterConfig } from "./config.js";
import { loadRosterState } from "./guild-roster.js";

export function buildRosterCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Search the saved guild roster, not live online status")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("name").setDescription("Part of a character name").setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("class")
        .setDescription("Character class")
        .addChoices(...Object.values(CLASS_NAMES).map((value) => ({ name: value, value }))),
    )
    .addIntegerOption((option) =>
      option.setName("level").setDescription("Exact character level").setMinValue(1),
    )
    .addIntegerOption((option) =>
      option.setName("rank").setDescription("Numeric guild rank (0 is highest)").setMinValue(0),
    );
}

type RosterInteraction = Pick<
  ChatInputCommandInteraction,
  "guildId" | "options" | "deferReply" | "editReply"
>;

export async function handleRosterCommand(
  interaction: RosterInteraction,
  discord: Pick<Client, "channels">,
  config: GuildRosterConfig | undefined,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.guildId) {
      await interaction.editReply("Use roster lookup in a server, not a direct message.");
      return;
    }
    if (!config) {
      await interaction.editReply("Roster monitoring is not configured on this bot.");
      return;
    }
    const channel = await discord.channels.fetch(config.announcementChannelId);
    if (!channel || !("guildId" in channel) || channel.guildId !== interaction.guildId) {
      await interaction.editReply("Roster lookup is only available in the server configured for guild announcements.");
      return;
    }
    const state = await loadRosterState(config);
    if (!state) {
      await interaction.editReply("No saved roster yet. Wait for the first successful Blizzard poll.");
      return;
    }

    const name = interaction.options.getString("name")?.trim().toLocaleLowerCase("en-US");
    const className = interaction.options.getString("class");
    const level = interaction.options.getInteger("level");
    const rank = interaction.options.getInteger("rank");
    const matches = Object.values(state.members)
      .filter((member) =>
        (!name || member.name.toLocaleLowerCase("en-US").includes(name)) &&
        (className === null || member.className === className) &&
        (level === null || member.level === level) &&
        (rank === null || member.rank === rank),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    const shown = matches.slice(0, 15);
    const lines = shown.map((member) =>
      `**${escapeMarkdown(member.name).slice(0, 80)}** - ` +
      `${escapeMarkdown(member.className).slice(0, 40)}, level ${member.level}, rank ${member.rank}`,
    );
    const freshness = state.checkedAt === undefined
      ? "Snapshot age unknown; waiting for a successful poll."
      : `Last successful stored poll: <t:${Math.floor(state.checkedAt / 1000)}:R>.` +
        (Date.now() - state.checkedAt > config.pollMinutes * 120_000
          ? "\n**Stale snapshot:** more than two polling intervals old."
          : "");
    const embed = new EmbedBuilder()
      .setTitle(`${config.guildName.slice(0, 200)} roster`)
      .setColor(0xf0b132)
      .setDescription(lines.length > 0 ? lines.join("\n") : "No characters match these filters.")
      .addFields(
        {
          name: "Matches",
          value: `${matches.length} of ${Object.keys(state.members).length} members` +
            (shown.length < matches.length ? "; showing the first 15. Narrow your filters." : ""),
        },
        { name: "Snapshot age", value: freshness },
      )
      .setFooter({ text: "Confirmed roster; changes need two polls. Not live online status." });
    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Could not search saved guild roster:", error);
    await interaction.editReply("Guildhead could not read the saved roster. Try again later.");
  }
}
