import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  type APIEmbed,
  type TextChannel,
  WebhookClient,
} from "discord.js";

import { buildEmbed } from "./embed.js";
import { loadConfig } from "./config.js";
import { extractReferences } from "./parser.js";
import { buildTooltipCard } from "./tooltip-card.js";
import { lookupReference } from "./wowhead.js";

const config = loadConfig();
const configuredWebhook = config.webhookUrl
  ? new WebhookClient({ url: config.webhookUrl })
  : undefined;
const channelWebhooks = new Map<string, WebhookClient>();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function webhookForChannel(channel: TextChannel): Promise<WebhookClient> {
  if (configuredWebhook) {
    return configuredWebhook;
  }

  const cached = channelWebhooks.get(channel.id);
  if (cached) {
    return cached;
  }

  const existing = (await channel.fetchWebhooks()).find(
    (webhook) =>
      webhook.owner?.id === client.user?.id &&
      webhook.name === "Guildhead" &&
      webhook.token,
  );
  const webhook =
    existing ??
    (await channel.createWebhook({
      name: "Guildhead",
      reason: "Post Wowhead embeds in a WoW-linked channel",
    }));

  if (!webhook.token) {
    throw new Error(`Guildhead webhook ${webhook.id} has no usable token`);
  }

  const webhookClient = new WebhookClient({
    id: webhook.id,
    token: webhook.token,
  });
  channelWebhooks.set(channel.id, webhookClient);
  return webhookClient;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  for (const channelId of config.channelIds) {
    try {
      const channel = await readyClient.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error(`${channelId} is not a guild text channel`);
      }
      await webhookForChannel(channel);
      console.log(`Guildhead webhook ready in #${channel.name}`);
    } catch (error) {
      console.error(`Could not prepare webhook for channel ${channelId}:`, error);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (
    !config.channelIds.has(message.channelId) ||
    message.author.id === client.user?.id
  ) {
    return;
  }

  const references = extractReferences(message.content);
  if (references.length === 0) {
    return;
  }

  try {
    const embeds: APIEmbed[] = [];
    const files: { attachment: Buffer; name: string }[] = [];
    for (const reference of references) {
      const entities = await lookupReference(reference, config.flavors);
      for (const entity of entities) {
        const primaryMatch = entity.matches[0];
        const imageName = primaryMatch
          ? `wowhead-${entity.kind}-${primaryMatch.id}-${embeds.length}.png`
          : undefined;
        if (imageName) {
          try {
            files.push({
              attachment: await buildTooltipCard(entity),
              name: imageName,
            });
          } catch (error) {
            console.error(`Could not render tooltip card for ${entity.name}:`, error);
          }
        }
        embeds.push(
          buildEmbed(
            entity,
            files.some((file) => file.name === imageName) ? imageName : undefined,
          ).toJSON(),
        );
        if (embeds.length === 10) {
          break;
        }
      }
      if (embeds.length === 10) {
        break;
      }
    }

    if (embeds.length > 0) {
      if (message.channel.type !== ChannelType.GuildText) {
        throw new Error(`Channel ${message.channelId} is not a guild text channel`);
      }
      const webhook = await webhookForChannel(message.channel);
      await webhook.send({
        embeds,
        files,
        allowedMentions: { parse: [] },
      });
    }
  } catch (error) {
    console.error(
      `Failed to enrich Discord message ${message.id}:`,
      error,
    );
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

await client.login(config.token);
