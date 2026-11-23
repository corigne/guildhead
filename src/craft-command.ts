import {
  ChannelType,
  EmbedBuilder,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  type WebhookClient,
} from "discord.js";

import {
  CrafterDirectory,
  CrafterError,
  professions,
  type Profession,
} from "./crafter-directory.js";

export function buildCraftCommand(name: string) {
  const choices = professions.map((value) => ({ name: value, value }));
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Find and register guild crafters")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("find")
        .setDescription("Find guild crafters by profession")
        .addStringOption((option) =>
          option.setName("profession").setDescription("Crafting profession")
            .setRequired(true).addChoices(...choices),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("register")
        .setDescription("Register or update a character's profession in this server")
        .addStringOption((option) =>
          option.setName("character").setDescription("Your character name")
            .setRequired(true).setMinLength(2).setMaxLength(24),
        )
        .addStringOption((option) =>
          option.setName("profession").setDescription("Crafting profession")
            .setRequired(true).addChoices(...choices),
        )
        .addStringOption((option) =>
          option.setName("notes")
            .setDescription("Specialization, rare recipes, or availability")
            .setMaxLength(120),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove one of your profession listings")
        .addStringOption((option) =>
          option.setName("profession").setDescription("Crafting profession")
            .setRequired(true).addChoices(...choices),
        )
        .addStringOption((option) =>
          option.setName("character")
            .setDescription("Character to remove; needed if you have multiple matches")
            .setMinLength(2).setMaxLength(24),
        ),
    );
}

type CraftInteraction = Pick<
  ChatInputCommandInteraction,
  "commandName" | "guildId" | "channel" | "channelId" | "options" | "user" |
  "reply" | "deferReply" | "editReply" | "replied" | "deferred"
>;

export async function handleCraftCommand(
  interaction: CraftInteraction,
  directory: CrafterDirectory,
  linkedChannelIds: ReadonlySet<string>,
  webhookForChannel: (channel: TextChannel) => Promise<WebhookClient>,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use the crafter directory in a server, not a direct message.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  const profession = interaction.options.getString("profession", true) as Profession;
  try {
    if (!["find", "register", "remove"].includes(subcommand) || !professions.includes(profession)) {
      await interaction.reply({
        content: "Unknown crafter action or profession. Pick a current slash command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (subcommand === "register") {
      const characterName = interaction.options.getString("character", true);
      const notes = interaction.options.getString("notes")?.trim();
      await directory.register({
        guildId: interaction.guildId,
        discordUserId: interaction.user.id,
        characterName,
        profession,
        ...(notes ? { notes } : {}),
      });
      await interaction.reply({
        content: `Registered **${escapeMarkdown(characterName)}** for **${profession}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "remove") {
      const removed = await directory.remove(
        interaction.guildId,
        interaction.user.id,
        profession,
        interaction.options.getString("character") ?? undefined,
      );
      await interaction.reply({
        content: removed
          ? `Removed your **${profession}** listing.`
          : `You do not have a **${profession}** listing.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const linkedChannel = linkedChannelIds.has(interaction.channelId);
    await interaction.deferReply(
      linkedChannel ? { flags: MessageFlags.Ephemeral } : undefined,
    );
    const listings = await directory.find(interaction.guildId, profession);
    if (listings.length === 0) {
      await interaction.editReply(`No **${profession}** crafters are registered yet.`);
      return;
    }
    const lines: string[] = [];
    for (const listing of listings.slice(0, 15)) {
      const notes = listing.notes ? ` - ${escapeMarkdown(listing.notes)}` : "";
      const line = `**${escapeMarkdown(listing.characterName)}** (<@${listing.discordUserId}>)${notes}`;
      if (lines.join("\n").length + line.length > 3_800) {
        break;
      }
      lines.push(line);
    }
    if (lines.length < listings.length) {
      lines.push(`_And ${listings.length - lines.length} more._`);
    }
    const embed = new EmbedBuilder()
      .setTitle(`${profession} crafters`)
      .setColor(0xf0b132)
      .setDescription(lines.join("\n"))
      .setFooter({ text: `Use /${interaction.commandName} register to add yourself` });
    const response = {
      embeds: [embed],
      allowedMentions: { parse: [] as never[] },
    };
    if (linkedChannel) {
      if (
        interaction.channel?.type !== ChannelType.GuildText ||
        interaction.channel.guildId !== interaction.guildId
      ) {
        throw new Error(`Channel ${interaction.channelId} is not a guild text channel`);
      }
      await (await webhookForChannel(interaction.channel)).send(response);
      await interaction.editReply(`Posted ${profession} crafters.`);
      return;
    }
    await interaction.editReply(response);
  } catch (error) {
    console.error(`Failed /${interaction.commandName} ${subcommand}:`, error);
    const message = error instanceof CrafterError
      ? error.message
      : "Guildhead could not update the crafter directory.";
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
}
