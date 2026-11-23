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
    ["refresh", "Recheck ownership through Battle.net and update saved characters"],
    ["list", "View linked guild characters and ownership check time"],
    ["unlink", "Remove your links and cancel pending logins"],
  ]) {
    command.addSubcommand(option => option.setName(action!).setDescription(description!));
  }
  return command;
}

function linkEmbed(link: CharacterLink): EmbedBuilder {
  return new EmbedBuilder().setTitle("Linked guild characters")
    .setDescription(link.characters.slice(0, 15).map(character => `- ${escapeMarkdown(character.name).slice(0, 80)} (\`${character.id}\`)`).join("\n"))
    .addFields({ name: "Ownership checked", value: `<t:${Math.floor(link.verifiedAt / 1000)}:f> (<t:${Math.floor(link.verifiedAt / 1000)}:R>, ${link.region.toUpperCase()})` })
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
    if (action === "link" || action === "refresh") {
      const url = links.start(guildId, userId);
      await interaction.editReply({
        content: `**Before you authorize**\nThis associates your Discord account with characters you own. No other feature uses these links yet; profession verification is planned.\n\n**Access:** We request read-only WoW profile access (\`wow.profile\`). Blizzard returns your WoW character list; only guild-matching character IDs/names, Discord/server IDs, region, and check time are saved automatically after authorization. We do not receive your password or authenticator codes, or save access/refresh tokens. This cannot play characters, make purchases, or change account settings. It does not grant Discord roles or verify professions.\n\n**How long:** This private sign-in link works once and expires in 10 minutes. Saved links remain until you unlink; they are not automatically refreshed and can become stale. /${interaction.commandName} refresh rechecks ownership through Battle.net; a failed refresh keeps your saved links.\n\n**Control:** /${interaction.commandName} list shows saved characters; /${interaction.commandName} unlink removes them. Revoke app permission separately in Battle.net account settings.\n\nAuthorize your own account: <${url}>\nKeep this link private. Only approve a login you started.`,
        allowedMentions: { parse: [] },
      });
    } else if (action === "list") {
      const result = await links.list(guildId, userId);
      await interaction.editReply({
        content: result
          ? `Ownership is a dated check, not a live guarantee. Use /${interaction.commandName} refresh to recheck, or /${interaction.commandName} unlink to remove saved links.`
          : `No linked characters. Use /${interaction.commandName} link to authorize your Battle.net account.`,
        embeds: result ? [linkEmbed(result)] : [],
        allowedMentions: { parse: [] },
      });
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
