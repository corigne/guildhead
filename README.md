# Guildhead

[![CI](https://github.com/corigne/guildhead/actions/workflows/ci.yml/badge.svg)](https://github.com/corigne/guildhead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Bring your WoW guild and Discord closer together.**

Guildhead is a self-hosted Discord bot for World of Warcraft: Forever. It
started with Wowhead tooltips for linked guild chat and adds ways to find
crafters, organize groups, and connect your guild characters to Discord.

Linking a Battle.net account is optional. Members can use lookups, manual
crafter listings, group finding, and a configured guild roster without it.

## What it does

| Feature | How it helps |
| --- | --- |
| Guild-chat tooltips | Turns bracketed item, quest, spell, NPC, and achievement names into tooltip cards with Wowhead links. |
| Wowhead search | Looks up a name with `/wow`, even outside the synced channel. |
| Crafter directory | Finds guild crafters by profession, with manual listings or opt-in synced profession skills. |
| Group finding | Posts groups, tracks signups, and notifies leaders when members join or leave. An optional LFG channel keeps announcements together. |
| Guild roster | Searches a saved roster and announces confirmed joins, departures, or rank changes. |
| Character setup | Verifies owned guild characters through Battle.net, lets members select a main, and optionally syncs class and primary-profession roles. |
| Member onboarding | Optional welcome DMs and pinned command guides explain what members can use and how linking works. |

Tooltip lookups default to Forever. Retail, Classic Era, and Cataclysm Classic
are also available as **Wowhead databases**; Blizzard roster and character
integration targets Forever.

### Guild-chat example

In a configured channel, send:

```text
Anyone need [Hearthstone] or working on [The Missing Diplomat]?
```

Guildhead looks up each name and replies with tooltip cards and Wowhead links.
It handles up to three unique bracketed references per message and groups
results into one response.

WoW-linked channels block ordinary bot messages, so Guildhead uses a managed
webhook for its output there. Tooltip responses stay in Discord rather than
being sent back into guild chat.

## Using Guildhead

Start with `/help` for private command help. For example:

```text
/wow query:Hearthstone
/craft find profession:Blacksmithing
/craft register character:Your Character profession:Blacksmithing
/lfg create activity:Deadmines size:5
/lfg list
/roster class:Mage
```

| Command | Available actions |
| --- | --- |
| `/wow` | Search by `query`; optionally choose a `database`. |
| `/craft` | `find`, `register`, or `remove` profession listings. |
| `/lfg` | `create`, `list`, `show`, `join`, `leave`, or `close` a group. |
| `/roster` | Filter by `name`, `class`, `level`, or numeric guild `rank`. |
| `/character` | `link`, `refresh`, `main`, `list`, or `unlink` characters. |
| `/help` | See commands, options, and automatic-tooltip syntax. |

Commands work where Discord permissions allow them. Configured tooltip
channels limit automatic message scanning, not slash-command access. The
preferred commands channel is guidance, not a channel-only restriction.
Crafter, LFG, roster, and character commands require a Discord server.
Operators can rename commands to avoid conflicts with other bots.

**Groups:** use the ID from a group post to join, show, or leave it.
`/lfg close group` suggests your open groups as `Activity (ID)`. Public posts
update as members join or leave; command acknowledgements are private.
Groups expire after two hours. Signups do not reserve an in-game spot or
verify that someone is online.

**Characters:** run `/character link`, authorize at Battle.net, then choose
your main with `/character main`. Selecting a main opts into public synced
crafter listings and, if enabled by the operator, class/profession roles.
Your main determines the class role; linked guild characters contribute
primary professions. Cooking, Fishing, and First Aid remain searchable but
do not grant roles. Unrelated preference roles are left alone.

## Self-hosting

You need Docker, a Discord application you control, and permission to add it
to your server. There is no shared hosted bot to invite.

### 1. Get the repository

```sh
git clone https://github.com/corigne/guildhead.git
cd guildhead
```

### 2. Create and invite your Discord bot

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Create an application and bot. Enable **Message Content Intent**.
2. Generate an install URL with the `bot` and `applications.commands` scopes.
3. Grant **View Channels**, **Read Message History**, **Send Messages**,
   **Embed Links**, **Attach Files**, and **Manage Webhooks** in the channels
   Guildhead will use.
4. Invite the bot. Enable Discord developer mode and copy the channel IDs
   where automatic tooltips should run.

Optional welcome DMs and role sync also need **Server Members Intent**.
Role sync needs **Manage Roles** and a bot role above the roles it manages.
Pinned guides need **Pin Messages**. Do not grant Administrator.

### 3. Configure

Create a private configuration file:

```sh
cp .env.example .env
chmod 600 .env
${EDITOR:-nvim} .env
```

Set at least:

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_CHANNEL_IDS=123456789012345678
```

Use comma-separated IDs for multiple tooltip channels. The defaults are
enough for Forever tooltips, manual crafter listings, and LFG.

### 4. Start the bot

Run the published version with persistent storage:

```sh
docker run -d \
  --name guildhead \
  --restart unless-stopped \
  --env-file .env \
  --mount source=guildhead_data,target=/data \
  ghcr.io/corigne/guildhead:1.12.1

docker logs --tail=80 guildhead
```

Wait for login and command registration in the logs, then try `/help` and
`[Hearthstone]` in a configured channel. Keep the data volume when upgrading.
Only run one instance per bot token.

For a source-build alternative, use `docker compose up -d --build` instead of
`docker run`. Do not start both. See the [operations guide](docs/operations.md)
for upgrades, backups, secret-file support, and troubleshooting.

### Optional setup

| To enable | Configure |
| --- | --- |
| A dedicated LFG destination | `DISCORD_LFG_CHANNEL_ID` with an existing channel ID. Existing posts stay in their original channels. |
| Preferred commands channel and pinned guide | `DISCORD_COMMAND_CHANNEL_ID`; add guide channels with `DISCORD_COMMAND_POST_CHANNEL_IDS`. |
| Welcome DMs | `GUILD_WELCOME_ENABLED=true`; customize with a mounted `GUILD_WELCOME_MESSAGE_FILE`. |
| Other tooltip databases | `WOWHEAD_FLAVORS=forever,retail,classic,cata`, choosing only the databases you want. |
| Roster announcements and lookup | Blizzard app credentials, guild name, and announcement channel; see [configuration](docs/operations.md#configuration). |
| Character linking and role sync | Roster setup plus a registered public HTTPS callback; follow the [character-linking guide](docs/character-linking.md). |

## Privacy and limits

Battle.net handles sign-in; we never see your password. Guildhead uses the
player's authorization token in memory and does not save access or refresh
tokens. Saved guild-character links remain until unlinked; ownership is a
dated check that members can renew with `/character refresh`.

Guildhead does not persist scanned chat messages. The operator controls saved
roster, crafter, group, and character data. See the [privacy policy](PRIVACY.md)
for retention, unlinking, backups, and third-party services.

Forever's Blizzard API is undocumented and snapshots can lag behind the game.
Guildhead does **not** show live WoW online/offline status. Recipe-level crafter
search and other investigated features are not shipped; see the
[roadmap](docs/roadmap.md) for plans and evidence.

## Development

Requires Node.js 24.17 or newer.

```sh
npm ci
npm test
```

On Linux with a user systemd session, `npm run test:low-impact` runs checks
under resource limits. Tests enforce 100% line, branch, and function coverage
for covered source modules. `src/index.ts`, live Discord requests, and process
wiring are outside that coverage claim.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributions and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License and support

[MIT](LICENSE). If Guildhead helps your guild, you can
[support its development on Ko-fi](https://ko-fi.com/michelinboi).

Guildhead is not affiliated with or endorsed by Blizzard Entertainment,
Discord, or Wowhead. World of Warcraft and related marks belong to their
respective owners.
