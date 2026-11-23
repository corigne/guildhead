import {
  EmbedBuilder, escapeMarkdown, InteractionContextType, MessageFlags,
  SlashCommandBuilder, type ChatInputCommandInteraction, type Client,
} from "discord.js";

import { CharacterLinkError, type CharacterLink, type CharacterLinks } from "./character-links.js";
import type { GuildRosterConfig } from "./config.js";

export function buildCharacterCommand(name: string) {
  const command = new SlashCommandBuilder().setName(name)
    .setDescription("Verify ownership of your guild characters through Battle.net")
    .setContexts(InteractionContextType.Guild);
  for (const [action, description] of [
    ["link", "Start a private Battle.net consent flow"],
    ["list", "Review authorized characters and existing links"],
    ["confirm", "Save characters after reviewing them with list"],
    ["unlink", "Remove your links and cancel pending logins"],
  ]) {
    command.addSubcommand(option => option.setName(action!).setDescription(description!));
  }
  return command;
}

function linkEmbed(link: CharacterLink, pending: boolean): EmbedBuilder {
  return new EmbedBuilder().setTitle(pending ? "Review before linking" : "Linked guild characters")
    .setDescription(link.characters.slice(0, 15).map(character => `- ${escapeMarkdown(character.name).slice(0, 80)} (\`${character.id}\`)`).join("\n"))
    .addFields({ name: "Ownership checked", value: `<t:${Math.floor(link.verifiedAt / 1000)}:f> (${link.region.toUpperCase()})` })
    .setFooter({ text: `${link.characters.length} characters. Snapshot proof, not permanent ownership or online status.` });
}

export async function handleCharacterCommand(
  interaction: Pick<ChatInputCommandInteraction, "guildId" | "user" | "options" | "commandName" | "deferReply" | "editReply">,
  discord: Pick<Client, "channels">,
  config: GuildRosterConfig | undefined,
  links: CharacterLinks | undefined,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.guildId || !config || !links) {
      await interaction.editReply("Character linking needs a server and configured Battle.net HTTPS callback. Ask the bot operator.");
      return;
    }
    const channel = await discord.channels.fetch(config.announcementChannelId);
    if (!channel || !("guildId" in channel) || channel.guildId !== interaction.guildId) {
      await interaction.editReply("Character linking is only available in the server configured for guild announcements.");
      return;
    }
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const action = interaction.options.getSubcommand();
    if (action === "link") {
      const url = links.start(guildId, userId);
      await interaction.editReply({
        content: `Authorize your own Battle.net account: <${url}>\nKeep this link private. It expires in 10 minutes. Then use /${interaction.commandName} list to review and /${interaction.commandName} confirm to save only your guild characters.`,
        allowedMentions: { parse: [] },
      });
    } else if (action === "list") {
      const result = await links.list(guildId, userId);
      const embeds = [
        ...(result.pending ? [linkEmbed(result.pending, true)] : []),
        ...(result.saved ? [linkEmbed(result.saved, false)] : []),
      ];
      await interaction.editReply({
        content: result.pending
          ? `Check these are your characters. Use /${interaction.commandName} confirm to save, or /${interaction.commandName} unlink to cancel.`
          : "No pending authorization. Use link to authorize or recheck ownership.",
        embeds,
        allowedMentions: { parse: [] },
      });
    } else if (action === "confirm") {
      await links.confirm(guildId, userId);
      await interaction.editReply("Your reviewed guild characters are linked. This does not grant roles or verify profession claims.");
    } else if (action === "unlink") {
      await links.unlink(guildId, userId);
      await interaction.editReply("Your character links and pending logins are removed. Battle.net app access can also be revoked in your Battle.net account settings.");
    } else {
      await interaction.editReply("Unknown character action. Pick a current slash command.");
    }
  } catch (error) {
    await interaction.editReply(error instanceof CharacterLinkError
      ? error.message : "Guildhead could not complete character linking. Try again later.");
  }
}
