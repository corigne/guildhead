import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder,
  escapeMarkdown, type MessageComponentInteraction,
} from "discord.js";

import { CharacterLinkError, type CharacterLink, type CharacterLinks } from "./character-links.js";
import type { CharacterSync } from "./character-sync.js";

export function mainPicker(link: CharacterLink, page: number) {
  const characters = link.profile!.characters;
  const last = Math.ceil(characters.length / 25) - 1;
  if (!Number.isSafeInteger(page) || page < 0 || page > last) throw new CharacterLinkError("This character selection is no longer available. Run the main command again.");
  const id = (target: number) => `guildhead:main:${link.discordUserId}:${target}`;
  const components: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(id(page)).setPlaceholder("Choose your main character")
        .addOptions(characters.slice(page * 25, (page + 1) * 25).map(character => ({
          label: character.name.slice(0, 100), value: character.id,
          description: character.className.slice(0, 100), default: character.id === link.mainCharacterId,
        }))),
    ),
  ];
  if (last > 0) components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(id(page - 1)).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(id(page + 1)).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page === last),
  ));
  return {
    content: `**Choose your main character** (page ${page + 1}/${last + 1}). This enables API-backed crafter listings in this server. Your main determines your class role; profession roles include all linked guild characters when the operator enables role sync. Other #roles preferences stay unchanged.`,
    components, allowedMentions: { parse: [] as never[] },
  };
}

type MainInteraction = Pick<MessageComponentInteraction,
  "guildId" | "user" | "customId" | "deferReply" | "editReply"> & { values?: readonly string[] };

export async function handleCharacterMain(
  interaction: MainInteraction,
  links: CharacterLinks | undefined,
  sync: CharacterSync | undefined,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const match = /^guildhead:main:(\d{1,20}):(-?\d{1,6})$/.exec(interaction.customId);
    if (!match || match[1] !== interaction.user.id || !interaction.guildId || !links || !sync) {
      throw new CharacterLinkError("Use your own main-character command in the configured server.");
    }
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    if (interaction.values) {
      if (interaction.values.length !== 1) throw new CharacterLinkError("Choose exactly one main character.");
      const characterId = interaction.values[0]!;
      await sync.selectMain(guildId, userId, characterId);
      const link = (await links.list(guildId, userId))!;
      const name = link.characters.find(character => character.id === characterId)!.name;
      await interaction.editReply({
        content: `Main character: **${escapeMarkdown(name)}**. Professions are synced. ${sync.rolesEnabled ? "Class and profession roles are updated." : "Role assignment is awaiting server-operator setup."}`,
        components: [], allowedMentions: { parse: [] },
      });
    } else {
      const link = await links.list(guildId, userId);
      if (!link?.profile?.characters.length) throw new CharacterLinkError("No current synced guild characters. Refresh your character link first.");
      await interaction.editReply(mainPicker(link, Number(match[2])));
    }
  } catch (error) {
    await interaction.editReply(error instanceof CharacterLinkError
      ? error.message : "Could not update your main character or roles. Your saved character links are retained; try again later.");
  }
}
