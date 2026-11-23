import { EmbedBuilder } from "discord.js";

import { flavorDefinitions } from "./config.js";
import type { WowheadEntity } from "./wowhead.js";

const QUALITY_COLORS = [
  0x9d9d9d, 0xffffff, 0x1eff00, 0x0070dd, 0xa335ee, 0xff8000, 0xe6cc80,
] as const;
const DEFAULT_COLOR = 0xf0b132;
const KIND_COLORS = {
  quest: 0xffd100,
  spell: 0x69ccf0,
  npc: 0xc41f3b,
  achievement: 0xf4c430,
} as const;
const MAX_DESCRIPTION_LENGTH = 900;

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncate(value: string): string {
  if (value.length <= MAX_DESCRIPTION_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_DESCRIPTION_LENGTH - 3).trimEnd()}...`;
}

function iconUrl(icon: string | undefined): string | undefined {
  if (!icon || !/^[a-z0-9_]+$/i.test(icon)) {
    return undefined;
  }
  return `https://wow.zamimg.com/images/wow/icons/large/${icon.toLowerCase()}.jpg`;
}

export function buildEmbed(
  entity: WowheadEntity,
  sourceUrl?: string,
  imageName?: string,
): EmbedBuilder {
  const primaryMatch = entity.matches[0];
  if (!primaryMatch) {
    throw new Error(`Cannot build an embed for ${entity.name} without a match`);
  }

  const flavorLinks = entity.matches
    .map(
      (match) =>
        `[${flavorDefinitions[match.flavor].label}](${match.url})`,
    )
    .join(" | ");

  const details: string[] = [];
  if (entity.level !== undefined && entity.level > 0) {
    details.push(`Level ${entity.level}`);
  }
  if (entity.requiredLevel !== undefined && entity.requiredLevel > 0) {
    details.push(`Requires level ${entity.requiredLevel}`);
  }

  const description = [
    details.length > 0 ? `**${details.join(" | ")}**` : "",
    entity.description ? truncate(entity.description) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const embed = new EmbedBuilder()
    .setTitle(entity.name)
    .setURL(primaryMatch.url)
    .setColor(
      entity.kind === "item"
        ? (QUALITY_COLORS[entity.quality ?? -1] ?? DEFAULT_COLOR)
        : (KIND_COLORS[entity.kind] ?? DEFAULT_COLOR),
    )
    .addFields({ name: "Database", value: flavorLinks })
    .setFooter({
      text: `${titleCase(entity.kind)} ${primaryMatch.id} | Wowhead`,
    });

  if (imageName) {
    embed.setImage(`attachment://${imageName}`);
  } else {
    embed.setDescription(description || `${titleCase(entity.kind)} on Wowhead`);
    const thumbnail = iconUrl(entity.icon);
    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    }
  }
  if (sourceUrl) {
    embed.addFields({
      name: "Guild chat",
      value: `[Open source message](${sourceUrl})`,
    });
  }
  return embed;
}
