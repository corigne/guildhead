# Host Guildhead

This guide is for the person running Guildhead for a server. Members can use
the [command guide](commands.md) and [character setup](character-linking.md)
without doing any of this.

Run one copy per Discord bot token. Keep its saved data when replacing a
container.

## Install

You need Git, Docker with Compose, and a Discord application you control.
This setup uses the published image rather than building it on your computer.

```sh
git clone https://github.com/corigne/guildhead.git
cd guildhead
cp .env.example .env
chmod 600 .env
${EDITOR:-nvim} .env
```

In the [Discord Developer Portal](https://discord.com/developers/applications),
create a bot and enable **Message Content Intent**. Invite it with the `bot`
and `applications.commands` scopes. In the channels it will use, grant:

- View Channels and Read Message History.
- Send Messages, Embed Links, and Attach Files.
- Manage Webhooks for tooltip output in WoW-linked channels.

Do not grant Administrator. Automatic tooltips need access to message content;
they scan only the channels you select.

Set these required values in your private configuration:

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_CHANNEL_IDS=123456789012345678
```

Use comma-separated channel IDs for multiple tooltip channels. Enable Discord
developer mode to copy IDs.

For a new installation, create `compose.override.yaml` beside `compose.yaml`:

```yaml
services:
  bot:
    image: ghcr.io/corigne/guildhead:1.12.1
```

If that file already exists, merge the image setting into it. Preserve its
other settings.

```sh
docker compose pull bot
docker compose up -d --no-build bot
docker compose logs --tail=80 bot
```

Wait for login and command registration, then try `/help` and `[Hearthstone]`
in a configured channel. Basic tooltips, manual crafter listings, and groups
do not need Blizzard credentials.

Already running with `docker run`? Do not start a second copy with Compose.
Back up the existing data and arrange to reuse or restore it first: Compose
may use a different volume name.

## Configuration

All features below are optional. Set their values in your private
configuration and recreate the container to apply changes.

| Feature | Setting | Default |
| --- | --- | --- |
| Tooltip databases | `WOWHEAD_FLAVORS`: choose `forever`, `retail`, `classic`, or `cata`, comma-separated | `forever` |
| Preferred commands channel | `DISCORD_COMMAND_CHANNEL_ID` | Unset |
| Additional pinned-guide channels | `DISCORD_COMMAND_POST_CHANNEL_IDS`, comma-separated | Unset |
| New LFG announcements | `DISCORD_LFG_CHANNEL_ID` | Channel where the group was created |
| Welcome DMs | `GUILD_WELCOME_ENABLED` | `false` |
| Custom welcome | `GUILD_WELCOME_MESSAGE_FILE`, a mounted text file | Built-in introduction |
| Class/primary-profession roles | `GUILD_ROLE_SYNC_ENABLED` | `false` |
| Character sign-in page | `BLIZZARD_OAUTH_REDIRECT_URI` | Linking disabled |
| Supplied output webhook | `DISCORD_WEBHOOK_URL` | Guildhead manages its own |

To rename commands, use `DISCORD_COMMAND_NAME`, `DISCORD_HELP_COMMAND_NAME`,
`DISCORD_CRAFT_COMMAND_NAME`, `DISCORD_LFG_COMMAND_NAME`,
`DISCORD_ROSTER_COMMAND_NAME`, or `DISCORD_CHARACTER_COMMAND_NAME`.
Names must be different and contain 1-32 lowercase letters, digits,
underscores, or hyphens. The new name replaces the old one.

Credentials must stay out of Git and shared logs. The bot also supports
`DISCORD_TOKEN_FILE` and `BLIZZARD_CLIENT_SECRET_FILE` for mounted secret
files; adapt the bundled Compose settings if using those instead of values.
Never post bot tokens, webhook URLs, or sign-in links when asking for help.

### Guild roster

Create a [Battle.net developer application](https://develop.battle.net/access/clients)
and configure:

```dotenv
BLIZZARD_CLIENT_ID=your-client-id
BLIZZARD_CLIENT_SECRET=your-client-secret
BLIZZARD_REGION=us
BLIZZARD_GUILD_NAME=Your Guild Name
GUILD_ANNOUNCEMENT_CHANNEL_ID=123456789012345678
```

`GUILD_ANNOUNCE_EVENTS` accepts `joins`, `leaves`, and `ranks`, comma-separated;
the default is `joins`. `GUILD_ROSTER_POLL_MINUTES` defaults to `10` and accepts
2-1440 minutes. Supported regions are `us`, `eu`, `kr`, and `tw`.

The first successful check saves the starting roster without announcing old
joins. Later changes need two checks before announcement. Rank names are not
available, so announcements use numbers.

Roster search and character linking work only in the Discord server containing
the announcement channel. Blizzard information can lag behind the game; this
is not an online/offline feed.

### Commands channel and pinned guides

Set `DISCORD_COMMAND_CHANNEL_ID` to an existing channel for command guidance
and a pinned introduction. Add more guide channels with
`DISCORD_COMMAND_POST_CHANNEL_IDS`.

Grant Pin Messages as well as the usual read/send permissions. Guides update
in place; a ten-minute check repairs missing pins or deleted guides. Other
pins are untouched. Disabling the feature leaves existing guides in Discord.

No channels are created. The preferred channel does not restrict commands in
other channels where Discord permissions allow them.

### LFG destination

Set `DISCORD_LFG_CHANNEL_ID` to an existing, sendable channel in the same
server. New groups post there, while private replies stay with the command.
Existing posts remain in their original channels after a setting change.

If posting fails, the group is still saved and the leader gets a private
warning. Guildhead does not silently choose another channel.

### Welcome DMs

Enable **Server Members Intent** in the Discord Developer Portal, then set
`GUILD_WELCOME_ENABLED=true`. Only new human members joining servers with a
configured tooltip channel receive a welcome. Existing members are not
messaged on startup. Blocked DMs fail quietly without a public fallback.

For custom text, create `welcome-config/welcome.txt` and merge this into your
Compose override:

```yaml
services:
  bot:
    environment:
      GUILD_WELCOME_MESSAGE_FILE: /config/welcome.txt
    volumes:
      - ./welcome-config:/config:ro
```

Supported placeholders are `{help}`, `{wow}`, `{craft}`, `{lfg}`, `{roster}`,
`{character}`, `{commandChannel}`, and `{source}`. For example,
`{character} link` becomes the full command name. Keep the finished message
between 1 and 2000 characters. An unreadable or invalid template stops startup.
Mentions and automatic link previews are disabled.

Keep the introduction accurate: linking is optional, Battle.net handles
sign-in, and members can unlink later. Restart after editing a mounted welcome
file. Back it up separately from the bot's saved data.

### Character-linking setup

Finish roster setup first. Register an exact HTTPS callback address in your
Battle.net application, for example:

```text
https://guildhead.example.org/oauth/battlenet/callback
```

Set `BLIZZARD_OAUTH_REDIRECT_URI` to the same address. Merge this into your
Compose override, preserving the image setting and other configuration:

```yaml
services:
  bot:
    ports:
      - "127.0.0.1:8787:8787"
```

Use a reverse proxy with a valid HTTPS certificate. For example, with Caddy:

```caddyfile
guildhead.example.org {
    log {
        output discard
    }
    handle /oauth/battlenet/callback {
        reverse_proxy 127.0.0.1:8787
    }
    handle {
        respond "Not found." 404
    }
}
```

Replace the example hostname in both places. Do not expose port 8787 directly,
put a login challenge in front of this address, or log its query strings:
they contain private, short-lived sign-in information. Recreate the bot after
changing configuration, then try `/character link` in Discord.

### Class and profession roles

Enable **Server Members Intent**, grant Manage Roles, and put Guildhead's
bot role above the class/profession roles it should manage. Then set
`GUILD_ROLE_SYNC_ENABLED=true`. Character linking must already be configured.

Members opt in by selecting a main. Existing matching role names are reused;
missing roles are created without extra permissions. Duplicate names,
roles with elevated permissions, and roles the bot cannot edit need an
officer's attention. Guildhead does not rename, delete, or reorder roles.

Keep other bots' class/profession menus consistent with this setup.
Guildhead may undo conflicting choices for opted-in members, but it does not
edit those bots' menus. Other preference and guild-rank roles stay separate.
See [character setup](character-linking.md#how-roles-work) for member-facing
details.

## Backups and upgrades

Compose keeps saved rosters, crafter listings, groups, character links, and
pinned-guide references in a named volume at `/data`. Keep that volume.
**Do not use `docker compose down -v` for routine upgrades:** it deletes
the saved data.

For a consistent backup, this example stops the bot, checks the archive,
and starts the bot again even if archiving fails:

```sh
(
  set -eu
  umask 077
  backup="guildhead-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  trap 'docker compose start bot' 0
  docker compose stop bot
  docker compose run --rm --no-deps -T --entrypoint tar bot \
    -C /data -czf - . > "$backup"
  tar -tzf "$backup"
)
```

Check that the backup command succeeded before relying on the archive.
Back up custom welcomes and non-secret host settings separately. Keep
credential backups encrypted. Saved-data backups contain member identifiers
and character data, so restrict access and choose a retention period.

To upgrade, take a backup, update the image version in your override, then:

```sh
docker compose pull bot
docker compose up -d --no-build bot
docker compose logs --tail=80 bot
```

Use a versioned image instead of `latest` so you know what you are running.
Check the [release notes](https://github.com/corigne/guildhead/releases)
before upgrading or downgrading. Older releases may not preserve newer data.

Restore backups into a new volume, never over the only existing copy.
Discord role assignments and posted messages are outside the data backup;
restoring files will not undo those changes. Preserve guide references when
moving the same bot so it can reuse its posts.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Commands are missing | Bot installation, command registration in the logs, Discord permissions, or a command-name conflict. |
| Tooltips cannot post | Manage Webhooks in linked channels; Send Messages, Embed Links, and Attach Files elsewhere. |
| Roster is missing or old | Blizzard credentials, guild name/region, announcement channel access, and recent check failures. Searching does not force a refresh. |
| A group is missing | It may have expired, closed, or been created in another server. |
| A group post is outdated | Use `/lfg show` to check membership; inspect channel permissions. Failed edits retry, but deleted posts are not recreated. |
| A leader gets no DM | Their DM settings may block it. The signup still counts; missed notifications are not replayed. |
| Roles do not update | Main selected, role sync enabled, Server Members Intent, Manage Roles, and bot role position. |
| The bot cannot save data | Its `/data` directory must be writable by the container's user, UID 1000 in the published image. |

If saved files are damaged, stop the bot, keep a copy, and restore a known-good
backup. Do not delete saved data just to hide an error. Review logs for private
information before sharing them.
