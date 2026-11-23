# Guildhead

Guildhead adds World of Warcraft tooltips, guild-roster announcements, crafter
lookup, and lightweight group finding to Discord.

[![CI](https://github.com/corigne/guildhead/actions/workflows/ci.yml/badge.svg)](https://github.com/corigne/guildhead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Messages such as:

```text
Check [Hearthstone] and [Thunderfury, Blessed Blade of the Windseeker]
```

produce one Guildhead response containing one WoW-style tooltip image per
link. Cards include item icons, quality colors, requirements, stats, effects,
and Wowhead links.

## Features

- WoW Forever database by default
- Retail, Classic Era, and Cataclysm Classic database support
- Items, quests, spells, NPCs, and achievements
- Up to three unique bracketed links per message
- Multiple tooltip cards grouped into one Discord message
- `/wow` search command usable in any Discord channel
- Confirmed guild join and rank-change announcements from Blizzard roster data
- Guild-maintained crafter directory with find, register, and remove commands
- Server-scoped LFG groups with membership, size limits, and two-hour expiry
- Exact-name matching to avoid unrelated search results
- 24-hour lookup cache to reduce Wowhead traffic
- Docker and Docker Compose deployment

## Why Guildhead uses a webhook

Discord allows bots to read WoW-linked channels but blocks bot-authored
messages in them. Guildhead creates and reuses an incoming webhook in each
configured channel. Tooltip output appears only in Discord and is never sent
back into WoW.

## Discord application setup

1. Create an application and bot in the
   [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable **Bot -> Privileged Gateway Intents -> Message Content Intent**.
3. Under **OAuth2 -> URL Generator**, select the `bot` scope.
4. Grant these bot permissions:
   - View Channels
   - Read Message History
   - Manage Webhooks
   - Send Messages and Embed Links (for normal announcement channels)
5. Invite the bot to the server.
6. Enable Discord developer mode and copy each WoW-linked channel ID.

## Configure

```sh
cp .env.example .env
chmod 600 .env
${EDITOR:-nvim} .env
```

Required values:

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_COMMAND_NAME=wow
DISCORD_HELP_COMMAND_NAME=help
DISCORD_CHANNEL_IDS=123456789012345678
WOWHEAD_FLAVORS=forever
```

Multiple channel IDs and databases use comma-separated values:

```dotenv
DISCORD_CHANNEL_IDS=123456789012345678,234567890123456789
WOWHEAD_FLAVORS=forever,classic
```

Supported database values:

| Value | Wowhead database |
|---|---|
| `forever` | WoW Forever |
| `retail` | Retail |
| `classic` | Classic Era |
| `cata` | Cataclysm Classic |

`DISCORD_WEBHOOK_URL` is optional. When omitted, Guildhead automatically
creates and reuses a webhook in each configured channel.

## Guild roster announcements

Guildhead can poll the observed WoW Forever guild-roster API and announce
confirmed joins, departures, and numeric rank changes. Forever API support is
not yet documented by Blizzard and roster snapshots may lag behind the game.
Guildhead requires the same change to appear in two consecutive polls before
announcing it.

Create a Battle.net developer application, then add:

```dotenv
BLIZZARD_CLIENT_ID=your-client-id
BLIZZARD_CLIENT_SECRET=your-client-secret
BLIZZARD_REGION=us
BLIZZARD_GUILD_NAME=Pizzahut Smoking Section
GUILD_ANNOUNCEMENT_CHANNEL_ID=123456789012345678
GUILD_ANNOUNCE_EVENTS=joins,ranks
GUILD_ROSTER_POLL_MINUTES=10
```

Supported events are `joins`, `leaves`, and `ranks`. Rank names are not
provided by the Forever API, so rank announcements use numeric values. The
first successful poll creates a baseline and never emits historical joins.

Blizzard OAuth, roster, Wowhead search, and Wowhead tooltip responses are
validated at runtime. Guildhead rejects malformed upstream payloads instead of
silently storing or displaying partial data.

## Commands

```text
/wow query:<name> database:<optional database>
/help
/craft find profession:<profession>
/craft register character:<name> profession:<profession> notes:<optional>
/craft remove profession:<profession>
/lfg create activity:<dungeon, quest, or raid> size:<optional, default 5>
/lfg list
/lfg show group:<group ID>
/lfg join group:<group ID>
/lfg leave group:<group ID>
/lfg close group:<group ID>
```

Discord advertises the command description, query argument, and database
choices in its slash-command picker. `/help` privately shows Guildhead's
commands, arguments, automatic-tooltip syntax, and configured databases.
Guildhead also advertises its help and lookup command names in Discord activity.

Set `DISCORD_COMMAND_NAME=guildhead` to use `/guildhead` instead when another
bot already owns `/wow`. Set `DISCORD_HELP_COMMAND_NAME=guildhead-help` when
`/help` also overlaps. Changing either setting replaces the previously
registered commands after Guildhead restarts.

Set `DISCORD_CRAFT_COMMAND_NAME` to rename `/craft`. Crafter registrations are
stored in the configured data directory and associate a Discord user ID with a
character name, profession, and optional notes. Users can replace or remove
their own listings.

`/wow` returns the top Wowhead result. In a WoW-linked channel, Guildhead
posts through its managed webhook and acknowledges the command privately. In
normal Discord channels, the command response appears directly.

### Lightweight group finding

`/lfg create activity:Deadmines size:5` creates a group with the leader included
in its size and posts a public announcement in the current channel. WoW-linked
channels use the managed webhook. All command acknowledgements and subsequent
LFG responses are private; no automatic role pings or in-game messages are sent.

Use the group ID from that announcement with `/lfg join`, `/lfg show`, or
`/lfg leave`. Announcements are snapshots, not live-updating rosters; `/lfg show`
always returns current membership. Only the leader can close a group, and a
leader leaving closes it. Groups expire exactly two hours after creation.
One person can lead one active group per server, with at most ten active groups
per server and 2-40 members per group. These are Discord sign-ups, not verified
in-game characters, online status, or reserved dungeon spots.

Groups survive restarts in `GUILDHEAD_DATA_DIR` (default `/data`). Closed groups
are removed immediately; expired groups are pruned on the next successful LFG
command. Set `DISCORD_LFG_COMMAND_NAME` to rename `/lfg` when another bot uses it.

## Run with Docker Compose

```sh
docker compose up -d --build
docker compose logs -f bot
```

Upgrade:

```sh
git pull --ff-only
docker compose up -d --build
```

## Run from the published image

```sh
docker run -d \
  --name guildhead \
  --restart unless-stopped \
  --env-file .env \
  --mount source=guildhead_data,target=/data \
  ghcr.io/corigne/guildhead:latest
```

## Develop

Requires Node.js 24.17 or newer.

```sh
npm ci
npm test
```

`npm test` enforces 100% line, branch, and function coverage across source
modules. `src/index.ts` is excluded as the Discord process composition root;
LFG command handling and slash-command definitions are tested directly. Live
Discord transport and process wiring are outside this unit-coverage claim.

## Security

The Discord token and optional webhook URL are secrets. Keep `.env`
gitignored, permission it to `0600`, and rotate exposed credentials
immediately.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and
[PRIVACY.md](PRIVACY.md) for data-handling details.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

Guildhead is not affiliated with or endorsed by Blizzard Entertainment,
Discord, or Wowhead. World of Warcraft and related marks belong to their
respective owners.
