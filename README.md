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
- Private roster lookup by character name, class, level, and rank
- Guild-maintained crafter directory with find, register, and remove commands
- Server-scoped crafter listings with multiple characters per profession
- Opt-in Battle.net character ownership checks with automatic linking after authorization
- Main-character selection, API-backed profession skills, and optional class/primary-profession roles
- Optional, customizable welcome DMs explaining commands, voluntary linking, privacy, and source code
- Preferred bot-commands channel with persistent pinned command guides
- Server-scoped LFG groups with membership, size limits, and two-hour expiry
- Updated LFG announcements and leader DMs when players join or leave
- Optional dedicated LFG channel for browsing recent group announcements
- Leader-only open-group suggestions for `/lfg close`, labeled `Activity (ID)`
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
DISCORD_CHANNEL_IDS=123456789012345678
```

The default commands are `/wow`, `/help`, `/craft`, `/lfg`, `/roster`, and
`/character`. The default
Wowhead database is Forever; no Blizzard credentials are needed for tooltips,
crafters, or LFG. Blizzard credentials enable roster monitoring and lookup.
Character linking also needs a public HTTPS callback registered with Battle.net;
see [character linking](docs/character-linking.md).

Optional welcome DMs require **Server Members Intent** and
`GUILD_WELCOME_ENABLED=true`. They are off by default. Customize the introduction
using `GUILD_WELCOME_MESSAGE_FILE`; see the
[welcome setup](docs/operations.md#optional-welcome-dms). No linking is required
to use tooltips, manual crafter listings, group finding, or roster lookup.

Set `DISCORD_COMMAND_CHANNEL_ID` to an existing bot-commands channel for
preferred command guidance and a pinned introduction. Add more pinned-guide
channels with `DISCORD_COMMAND_POST_CHANNEL_IDS`. These pins update in place
and do not restrict commands elsewhere; see
[command guides](docs/operations.md#commands-channel-and-pinned-guides).

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

For data storage, secret files, backups, upgrades, and troubleshooting, see the
[operations guide](docs/operations.md). Planned work and known limitations live
in the [roadmap](docs/roadmap.md).

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
/craft remove profession:<profession> character:<optional>
/lfg create activity:<dungeon, quest, or raid> size:<optional, default 5>
/lfg list
/lfg show group:<group ID>
/lfg join group:<group ID>
/lfg leave group:<group ID>
/lfg close group:<group ID>
/roster name:<optional> class:<optional> level:<optional> rank:<optional>
/character link
/character refresh
/character main
/character list
/character unlink
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
stored per Discord server. Registering another character no longer replaces an
alt with the same profession. Re-registering the same name, ignoring case and
extra spaces, updates that character's listing. Users can only remove their own
listings in the current server. When several characters match a profession,
`remove` requires `character`; it never deletes them all by accident.

Pre-v1.8 listings have no server ID. They are preserved but excluded from
searches; owners must re-register in the appropriate server. The bot does not
guess where old registrations belong. Crafter and LFG commands require a server.

`/wow` returns the top Wowhead result. In a WoW-linked channel, Guildhead
posts through its managed webhook and acknowledges the command privately. In
normal Discord channels, the command response appears directly.

### Character ownership

`/character link` privately explains access, retention, and revocation before
showing the Battle.net authorization URL. After consent, matching guild
characters are saved automatically. `/character list` shows the saved names
and check time; `/character unlink` removes them and cancels pending logins.

Run `/character main` to select your main from a private, paginated picker.
This opts into public API-backed crafter listings. `/craft find` prefers the
Blizzard skill snapshot over a duplicate manual listing, while keeping manual
notes explicitly self-reported. Public professions refresh about every six
hours; this is separate from checking who owns an account.

With role sync enabled, the main determines one class role; primary profession
roles cover all linked guild characters. Cooking, Fishing, and First Aid remain
available in synced skills and crafter searches but do not assign roles.
Previously assigned secondary profession roles are removed during reconciliation;
their role definitions are left intact. Existing class roles are reused rather than
duplicated. Conflicting class/profession changes, including Carl-bot reactions,
are reconciled to this selection. Tank/Healer/DPS, region, pronouns, experience,
and officer/guild-rank roles are untouched. Use `#roles` for preference roles;
ask an officer about guild-rank roles.

The sign-in URL expires after ten minutes, not the saved links. Saved ownership
checks remain until unlinked and can become stale. `/character refresh` starts
a new Battle.net check and replaces the snapshot only on success. No tokens
are stored, so ownership cannot be silently refreshed in the background.

Blizzard returns the account's WoW character list, but only characters present
in the saved guild roster are retained, along with public class/profession
snapshots and the selected main. The bot does not save access tokens, BattleTags,
or unrelated alts. Ownership proof is dated, not permanent. API skill snapshots
do not verify free-form recipe notes or availability.

Setup, tested API support, and limitations are in the
[character-linking guide](docs/character-linking.md).

### Roster lookup

`/roster` reads the saved, confirmed guild roster. Combine optional filters:
`/roster name:Pepper`, `/roster class:Mage level:32`, or `/roster rank:0`.
Names match part of a character's name without case sensitivity; class,
level, and rank are exact matches. Rank 0 is highest. Results are alphabetical,
with at most 15 characters shown; narrow the filters for larger rosters.

Replies are private, including in WoW-linked channels. Lookup only works in
the Discord server containing `GUILD_ANNOUNCEMENT_CHANNEL_ID`; installing the
same bot elsewhere does not expose that roster.

Each reply shows when the saved roster was last checked. More than two polling
intervals without a successful stored poll produces a stale warning. Older
snapshots show unknown age until the next successful poll; file modification
times are not treated as Blizzard data timestamps. Lookup does not trigger a
Blizzard request, reveal online status, or bypass the two-poll change confirmation.
Set `DISCORD_ROSTER_COMMAND_NAME` to rename the command.

### Lightweight group finding

`/lfg create activity:Deadmines size:5` creates a group with the leader included
in its size and posts a public announcement in `DISCORD_LFG_CHANNEL_ID` when
configured, or the invoking channel otherwise. Set this to an existing LFG
channel so members can browse recent groups. Commands still work in other
channels; the private acknowledgement points to the configured destination.
The destination must be sendable and in the same server as the group. WoW-linked
channels use the managed webhook. Command acknowledgements are private; the
public post updates when membership changes and is marked closed or expired
when the group ends. Expiry is checked once a minute.

Existing announcements continue updating in their original channels after a
configuration change; they are not duplicated or moved. If the configured
destination is unavailable, the group is still saved and the private response
reports the announcement failure. Guildhead does not post in another channel
as a fallback.

Use the group ID from that announcement with `/lfg join`, `/lfg show`, or
`/lfg leave`. `/lfg close group` suggests your own open groups in the current
server, shown as `Activity (ID)`. Type part of the activity or ID to filter;
selecting a suggestion submits the ID. Closed, expired, and other leaders'
groups are excluded. Manually entered IDs still require leader authorization.
Leaders receive a DM when someone joins or leaves; repeated joins
and leaving a group you did not join do not send notifications. If DMs are
disabled or an announcement cannot be edited, a successful signup still
stands. Use `/lfg show` to check stored membership. Only the leader can close a
group, and a leader leaving closes it. Groups expire two hours after creation.
One person can lead one active group per server, with at most ten active groups
per server and 2-40 members per group. These are Discord sign-ups, not verified
in-game characters, online status, or reserved dungeon spots.

Groups and announcement references survive restarts in `GUILDHEAD_DATA_DIR`
(default `/data`). Failed post edits are retried; deleted posts are not
recreated. No automatic role pings or in-game messages are sent. Set
`DISCORD_LFG_COMMAND_NAME` to rename `/lfg` when another bot uses it.

Posts created before v1.6 remain snapshots because older releases did not save
their message IDs. Existing groups still work through `/lfg show` and `/lfg list`.

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
modules. `src/index.ts` is excluded as the Discord process composition root.
LFG command definitions, persistence, notifications, and Discord delivery paths
are tested with fakes. Live Discord requests and process wiring are outside
this unit-coverage claim.

## Security

The Discord token and optional webhook URL are secrets. Keep `.env`
gitignored, permission it to `0600`, and rotate exposed credentials
immediately.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and
[PRIVACY.md](PRIVACY.md) for data-handling details.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

If Guildhead is useful to your guild, you can [buy me a coffee on Ko-fi](https://ko-fi.com/michelinboi).

## License

[MIT](LICENSE)

Guildhead is not affiliated with or endorsed by Blizzard Entertainment,
Discord, or Wowhead. World of Warcraft and related marks belong to their
respective owners.
