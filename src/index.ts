import {
  ActivityType,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type TextChannel,
  WebhookClient,
} from "discord.js";

import {
  flavorDefinitions,
  loadConfig,
  type Flavor,
} from "./config.js";
import { extractReferences } from "./parser.js";
import {
  buildReferenceResponse,
  buildSearchResponse,
} from "./response.js";
import { GuildRosterMonitor, loadRosterState } from "./guild-roster.js";
import { CrafterDirectory } from "./crafter-directory.js";
import { buildCraftCommand, handleCraftCommand } from "./craft-command.js";
import { LfgDirectory } from "./lfg-directory.js";
import { buildLfgCommand, handleLfgCommand } from "./lfg-command.js";
import { LfgCommunications } from "./lfg-communications.js";
import { DiscordLfgTransport } from "./lfg-discord.js";
import { buildRosterCommand, handleRosterCommand } from "./roster-command.js";
import { BattleNetUserClient } from "./battlenet-user.js";
import { CharacterLinks, CharacterLinkStore } from "./character-links.js";
import { startCharacterCallback } from "./character-callback.js";
import { buildCharacterCommand, handleCharacterCommand } from "./character-command.js";

const config = loadConfig();
const configuredWebhook = config.webhookUrl
  ? new WebhookClient({ url: config.webhookUrl })
  : undefined;
const channelWebhooks = new Map<string, WebhookClient>();
const crafterDirectory = new CrafterDirectory(config.dataDir);
const lfgDirectory = new LfgDirectory(config.dataDir);
const lfgCommand = buildLfgCommand(config.lfgCommandName);
const rosterCommand = buildRosterCommand(config.rosterCommandName);
const craftCommand = buildCraftCommand(config.craftCommandName);
const characterCommand = buildCharacterCommand(config.characterCommandName);
const guildRosterConfig = config.guildRoster;
const characterLinks = config.characterRedirectUri && guildRosterConfig
  ? new CharacterLinks(
      new CharacterLinkStore(config.dataDir),
      new BattleNetUserClient(guildRosterConfig, config.characterRedirectUri),
      () => loadRosterState(guildRosterConfig),
      guildRosterConfig.region,
    )
  : undefined;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const lfgCommunications = new LfgCommunications(
  lfgDirectory,
  new DiscordLfgTransport(
    client,
    config.channelIds,
    webhookForChannel,
    config.lfgCommandName,
  ),
);
const wowCommand = new SlashCommandBuilder()
  .setName(config.commandName)
  .setDescription("Search Wowhead for items, quests, spells, NPCs, and achievements")
  .addStringOption((option) =>
    option
      .setName("query")
      .setDescription("Item, quest, spell, NPC, or achievement")
      .setRequired(true)
      .setMaxLength(100),
  )
  .addStringOption((option) =>
    option
      .setName("database")
      .setDescription("Wowhead database")
      .addChoices(
        ...Object.entries(flavorDefinitions).map(([value, definition]) => ({
          name: definition.label,
          value,
        })),
      ),
  );
const helpCommand = new SlashCommandBuilder()
  .setName(config.helpCommandName)
  .setDescription("Show Guildhead commands and usage");
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
  readyClient.user.setActivity(
    `/${config.helpCommandName} | /${config.commandName}`,
    {
      type: ActivityType.Watching,
    },
  );

  try {
    await readyClient.application.commands.set([
      wowCommand.toJSON(),
      helpCommand.toJSON(),
      craftCommand.toJSON(),
      lfgCommand.toJSON(),
      rosterCommand.toJSON(),
      characterCommand.toJSON(),
    ]);
    console.log(
      `Registered /${config.commandName}, /${config.helpCommandName}, /${config.craftCommandName}, /${config.lfgCommandName}, /${config.rosterCommandName}, and /${config.characterCommandName} commands`,
    );
  } catch (error) {
    console.error("Could not register Discord commands:", error);
  }

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

  lfgCommunications.start();

  if (config.guildRoster) {
    new GuildRosterMonitor(readyClient, config.guildRoster).start();
    console.log(
      `Guild roster monitor enabled for ${config.guildRoster.guildName}`,
    );
  } else {
    console.log(
      "Guild roster monitor disabled; configure Blizzard credentials to enable it",
    );
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
    const response = await buildReferenceResponse(references, config.flavors);

    if (response.embeds.length > 0) {
      if (message.channel.type !== ChannelType.GuildText) {
        throw new Error(`Channel ${message.channelId} is not a guild text channel`);
      }
      const webhook = await webhookForChannel(message.channel);
      await webhook.send({
        ...response,
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

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === config.helpCommandName) {
    const databases = config.flavors
      .map((flavor) => flavorDefinitions[flavor].label)
      .join(", ");
    const help = new EmbedBuilder()
      .setTitle("Guildhead commands")
      .setColor(0xf0b132)
      .setDescription(
        "Guildhead adds WoW-style Wowhead tooltips to Discord conversations.",
      )
      .addFields(
        {
          name: `/${config.commandName}`,
          value:
            "`query` (required): item, quest, spell, NPC, or achievement\n" +
            "`database` (optional): Forever, Retail, Classic Era, or Cataclysm Classic",
        },
        {
          name: `/${config.craftCommandName}`,
          value:
            "`find profession`: find registered guild crafters\n" +
            "`register character profession notes?`: add or update a character in this server\n" +
            "`remove profession character?`: remove one of your listings",
        },
        {
          name: `/${config.lfgCommandName}`,
          value:
            "`create activity size?`: start a two-hour group\n" +
            "`list`: active groups in this server\n" +
            "`show|join|leave|close group`: manage a group by ID",
        },
        {
          name: `/${config.rosterCommandName}`,
          value:
            "`name? class? level? rank?`: filter the saved guild roster\n" +
            "Private results with snapshot age; not live online status",
        },
        {
          name: `/${config.characterCommandName}`,
          value:
            "`link`: authorize your own Battle.net account\n" +
            "`list|confirm|unlink`: review, save, or remove your guild-character links",
        },
        {
          name: "Automatic tooltips",
          value:
            "Use `[Exact Name]` in a configured WoW-linked channel. " +
            "Up to three unique links are resolved per message.",
        },
        {
          name: "Configured databases",
          value: databases,
        },
      )
      .setFooter({ text: "Guildhead | Wowhead tooltips for guild chat" });
    await interaction.reply({
      embeds: [help],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === config.characterCommandName) {
    await handleCharacterCommand(interaction, client, config.guildRoster, characterLinks);
    return;
  }

  if (interaction.commandName === config.rosterCommandName) {
    await handleRosterCommand(interaction, client, config.guildRoster);
    return;
  }

  if (interaction.commandName === config.lfgCommandName) {
    await handleLfgCommand(
      interaction,
      lfgDirectory,
      config.lfgCommandName,
      lfgCommunications,
    );
    return;
  }

  if (interaction.commandName === config.craftCommandName) {
    await handleCraftCommand(interaction, crafterDirectory, config.channelIds, webhookForChannel);
    return;
  }

  if (interaction.commandName !== config.commandName) {
    return;
  }

  const query = interaction.options.getString("query", true);
  const requestedFlavor = interaction.options.getString("database");
  const flavor = (requestedFlavor as Flavor | null) ?? config.flavors[0];
  if (!flavor) {
    await interaction.reply({
      content: "Guildhead has no configured Wowhead database.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const linkedChannel = config.channelIds.has(interaction.channelId);
  await interaction.deferReply(
    linkedChannel ? { flags: MessageFlags.Ephemeral } : undefined,
  );

  try {
    const response = await buildSearchResponse(query, flavor);
    if (response.embeds.length === 0) {
      await interaction.editReply(`No Wowhead result found for \`${query}\`.`);
      return;
    }

    if (linkedChannel) {
      if (interaction.channel?.type !== ChannelType.GuildText) {
        throw new Error(
          `Channel ${interaction.channelId} is not a guild text channel`,
        );
      }
      const webhook = await webhookForChannel(interaction.channel);
      await webhook.send({
        ...response,
        allowedMentions: { parse: [] },
      });
      await interaction.editReply(`Posted the top ${flavorDefinitions[flavor].label} result.`);
      return;
    }

    await interaction.editReply(response);
  } catch (error) {
    console.error(`Failed /${config.commandName} query "${query}":`, error);
    await interaction.editReply("Guildhead could not complete that Wowhead search.");
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

if (characterLinks && config.characterRedirectUri) {
  await startCharacterCallback(characterLinks, config.characterRedirectUri, 8787);
  console.log("Battle.net character callback listening on port 8787");
}

await client.login(config.token);
