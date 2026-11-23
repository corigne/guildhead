import type { APIEmbed } from "discord.js";

import type { Flavor } from "./config.js";
import { buildEmbed } from "./embed.js";
import { buildTooltipCard } from "./tooltip-card.js";
import {
  lookupReference,
  searchReference,
  type WowheadEntity,
} from "./wowhead.js";

export interface WowheadResponse {
  embeds: APIEmbed[];
  files: { attachment: Buffer; name: string }[];
}

export async function addEntity(
  response: WowheadResponse,
  entity: WowheadEntity,
): Promise<void> {
  const primaryMatch = entity.matches[0];
  const imageName = primaryMatch
    ? `wowhead-${entity.kind}-${primaryMatch.id}-${response.embeds.length}.png`
    : undefined;

  if (imageName) {
    try {
      response.files.push({
        attachment: await buildTooltipCard(entity),
        name: imageName,
      });
    } catch (error) {
      console.error(`Could not render tooltip card for ${entity.name}:`, error);
    }
  }

  response.embeds.push(
    buildEmbed(
      entity,
      response.files.some((file) => file.name === imageName)
        ? imageName
        : undefined,
    ).toJSON(),
  );
}

export async function buildReferenceResponse(
  references: readonly string[],
  flavors: readonly Flavor[],
): Promise<WowheadResponse> {
  const response: WowheadResponse = { embeds: [], files: [] };

  for (const reference of references) {
    const entities = await lookupReference(reference, flavors);
    for (const entity of entities) {
      await addEntity(response, entity);
      if (response.embeds.length === 10) {
        return response;
      }
    }
  }

  return response;
}

export async function buildSearchResponse(
  query: string,
  flavor: Flavor,
): Promise<WowheadResponse> {
  const response: WowheadResponse = { embeds: [], files: [] };
  const entity = await searchReference(query, flavor);
  if (entity) {
    await addEntity(response, entity);
  }
  return response;
}
