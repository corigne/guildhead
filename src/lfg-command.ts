import {
  EmbedBuilder,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { LfgDirectory, LfgError } from "./lfg-directory.js";
import { buildGroupEmbed, type LfgCommunications } from "./lfg-communications.js";

export function buildLfgCommand(name: string) {
  const command = new SlashCommandBuilder()
    .setName(name)
    .setDescription("Find a guild group for dungeons, quests, or raids")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Start a group that expires in two hours")
        .addStringOption((option) =>
          option
            .setName("activity")
            .setDescription("Dungeon, quest, or raid to run")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(80),
        )
        .addIntegerOption((option) =>
          option
            .setName("size")
            .setDescription("Total group size including you (default: 5)")
            .setMinValue(2)
            .setMaxValue(40),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("Show active groups in this server"),
    );

  for (const [action, description] of [
    ["show", "Show the current members of a group"],
    ["join", "Join a group"],
    ["leave", "Leave a group (leaders close their group)"],
    ["close", "Close a group you lead"],
  ] as const) {
    command.addSubcommand((subcommand) =>
      subcommand
        .setName(action)
        .setDescription(description)
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Group ID from the group post or list")
            .setRequired(true)
            .setMaxLength(20),
        ),
    );
  }
  return command;
}

type LfgInteraction = Pick<
  ChatInputCommandInteraction,
  "id" | "guildId" | "channelId" | "user" | "options" | "deferReply" | "editReply"
>;

export async function handleLfgCommand(
  interaction: LfgInteraction,
  directory: LfgDirectory,
  commandName: string,
  communications: Pick<LfgCommunications, "publish" | "changed">,
  announcementChannelId?: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      throw new LfgError("Use this command in a server, not a direct message.");
    }
    const action = interaction.options.getSubcommand();
    if (action === "list") {
      const groups = await directory.list(guildId);
      const description = groups.length === 0
        ? `No active groups. Use /${commandName} create to start one.`
        : groups.map((group) =>
            `**${escapeMarkdown(group.activity)}** ` +
            `${group.memberIds.length}/${group.capacity} - <@${group.ownerId}>\n` +
            `ID: \`${group.id}\` - <t:${Math.floor(group.expiresAt / 1000)}:R>`,
          ).join("\n\n");
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Looking for group")
            .setColor(0xf0b132)
            .setDescription(description),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (action === "create") {
      const group = await directory.create({
        id: interaction.id,
        guildId,
        ownerId: interaction.user.id,
        activity: interaction.options.getString("activity", true),
        capacity: interaction.options.getInteger("size") ?? 5,
      });
      const embed = buildGroupEmbed(group, commandName);
      await interaction.editReply({
        content: `Group created. ${announcementChannelId ? `Public announcement channel: <#${announcementChannelId}>. ` : ""}Share its ID so guildmates can join.`,
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
      try {
        await communications.publish(group, announcementChannelId ?? interaction.channelId);
      } catch (error) {
        console.error("Could not announce LFG group:", error);
        await interaction.editReply({
          content: "Group saved, but the public announcement failed. Share the group ID below.",
        });
      }
      return;
    }

    if (!["show", "join", "leave", "close"].includes(action)) {
      throw new LfgError("Unknown group action. Refresh Discord's slash commands.");
    }
    const result = await directory.update(
      guildId,
      interaction.options.getString("group", true),
      interaction.user.id,
      action as "show" | "join" | "leave" | "close",
    );
    await communications.changed(result, interaction.user.id, action);
    if (result.closed) {
      await interaction.editReply("Group closed.");
      return;
    }
    await interaction.editReply({
      content: "Current group roster:",
      embeds: [buildGroupEmbed(result.group, commandName)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof LfgError)) {
      console.error("LFG command failed:", error);
    }
    await interaction.editReply({
      content: error instanceof LfgError
        ? error.message
        : "Guildhead could not access groups. Try again later.",
      embeds: [],
      allowedMentions: { parse: [] },
    });
  }
}
