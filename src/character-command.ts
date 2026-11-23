import {
  EmbedBuilder, escapeMarkdown, InteractionContextType, MessageFlags,
  SlashCommandBuilder, type ChatInputCommandInteraction, type Client,
} from "discord.js";

import { CharacterLinkError, type CharacterLink, type CharacterLinks } from "./character-links.js";
import type { GuildRosterConfig } from "./config.js";
import { mainPicker } from "./character-main.js";
import type { CharacterSync } from "./character-sync.js";

export function buildCharacterCommand(name: string) {
  const command = new SlashCommandBuilder().setName(name)
    .setDescription("Verify ownership of your guild characters through Battle.net")
    .setContexts(InteractionContextType.Guild);
  for (const [action, description] of [
    ["link", "Start a private Battle.net consent flow"],
    ["refresh", "Recheck ownership through Battle.net and update saved characters"],
    ["main", "Choose your main and enable synced crafters and character roles"],
    ["list", "View linked guild characters and ownership check time"],
    ["unlink", "Remove your links and cancel pending logins"],
  ]) {
    command.addSubcommand(option => option.setName(action!).setDescription(description!));
  }
  return command;
}

function linkEmbed(link: CharacterLink): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("Linked guild characters")
    .setDescription(link.characters.slice(0, 15).map(character => `- ${escapeMarkdown(character.name).slice(0, 80)} (\`${character.id}\`)`).join("\n"))
    .addFields({ name: "Ownership checked", value: `<t:${Math.floor(link.verifiedAt / 1000)}:f> (<t:${Math.floor(link.verifiedAt / 1000)}:R>, ${link.region.toUpperCase()})` })
    .setFooter({ text: `${link.characters.length} characters. Snapshot proof, not permanent ownership or online status.` });
  if (link.profile) embed.addFields({
    name: "Blizzard profession snapshot",
    value: link.profile.characters.slice(0, 8).map(character =>
      `${escapeMarkdown(character.name)}${character.id === link.mainCharacterId ? " (main)" : ""}: ${character.professionsUnavailable ? "Public professions unavailable" : character.professions.map(profession => `${profession.name} ${profession.skill}/${profession.maxSkill}`).join(", ") || "No professions"}`,
    ).join("\n").slice(0, 900) || "No linked characters are in the current confirmed guild roster.",
  }, { name: "Professions checked", value: `<t:${Math.floor(link.profile.checkedAt / 1000)}:R>. Public data refreshes every six hours; ownership is a separate dated check.` });
  return embed;
}

export async function handleCharacterCommand(
  interaction: Pick<ChatInputCommandInteraction, "guildId" | "user" | "options" | "commandName" | "deferReply" | "editReply">,
  discord: Pick<Client, "channels">,
  config: GuildRosterConfig | undefined,
  links: CharacterLinks | undefined,
  sync?: CharacterSync,
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
        content: `**Before you authorize**\nLink your own guild characters, then use /${interaction.commandName} main to choose a main. Selecting a main enables public crafter listings and, when configured, class/profession roles in this server. Other #roles preferences stay unchanged.\n\n**Access:** Read-only WoW profile access (\`wow.profile\`). We keep only guild-matching character IDs/names, Discord/server IDs, region, check time, selected main, and public class/profession snapshots. No password or authenticator codes reach us; access/refresh tokens are not stored. This cannot play characters, make purchases, or change account settings.\n\n**How long:** Private sign-in URLs work once for 10 minutes. Saved links remain until you unlink. Public professions refresh every six hours; ownership is not automatically refreshed and can become stale. /${interaction.commandName} refresh rechecks ownership through Battle.net; a failed refresh keeps your saved links.\n\n**Control:** /${interaction.commandName} list shows saved data; /${interaction.commandName} unlink removes it and stops synced crafter listings. Revoke app permission separately in Battle.net account settings.\n\nAuthorize your own account: <${url}>\nKeep this link private. Only approve a login you started.`,
        allowedMentions: { parse: [] },
      });
    } else if (action === "main") {
      if (!sync) throw new CharacterLinkError("Character profile sync is still starting. Try again shortly.");
      await sync.syncOwner(guildId, userId, true);
      const result = await links.list(guildId, userId);
      if (!result?.profile?.characters.length) throw new CharacterLinkError(`No synced guild characters. Use /${interaction.commandName} link first.`);
      await interaction.editReply(mainPicker(result, 0));
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
      const previous = await links.list(guildId, userId);
      await links.unlink(guildId, userId);
      const cleaned = !previous?.rolesManaged || !sync || await sync.clearRoles(guildId, userId);
      await interaction.editReply(`Your character links and pending logins are removed. ${cleaned ? "" : "Character role cleanup failed; ask an officer to remove those roles. "}Battle.net app access can also be revoked in your Battle.net account settings. Self-registered crafter listings remain until removed with the craft command.`);
    } else {
      await interaction.editReply("Unknown character action. Pick a current slash command.");
    }
  } catch (error) {
    await interaction.editReply(error instanceof CharacterLinkError
      ? error.message : "Guildhead could not complete character linking. Try again later.");
  }
}
