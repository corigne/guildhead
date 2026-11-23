# Running Guildhead

Guildhead runs as one process per Discord application. Do not start a second
copy with the same token while upgrading or testing: both processes will
receive interactions and may try to change the same messages.

## Configuration

Only `DISCORD_TOKEN` and `DISCORD_CHANNEL_IDS` are required. Channel IDs are
comma-separated. They control automatic tooltip scanning and identify channels
that need webhook output; slash commands work in other available channels.

Optional settings:

| Setting | Default | Purpose |
|---|---|---|
| `WOWHEAD_FLAVORS` | `forever` | Comma-separated databases for automatic lookups |
| `DISCORD_COMMAND_NAME` | `wow` | Explicit Wowhead lookup |
| `DISCORD_HELP_COMMAND_NAME` | `help` | Private command help |
| `DISCORD_CRAFT_COMMAND_NAME` | `craft` | Crafter directory |
| `DISCORD_LFG_COMMAND_NAME` | `lfg` | Group finding |
| `DISCORD_ROSTER_COMMAND_NAME` | `roster` | Private saved-roster lookup |
| `DISCORD_CHARACTER_COMMAND_NAME` | `character` | Private character linking |
| `GUILD_ROLE_SYNC_ENABLED` | `false` | Authoritative main-class/profession roles; needs Server Members Intent and Manage Roles |
| `GUILD_WELCOME_ENABLED` | `false` | DM new human members in servers containing configured tooltip channels; needs Server Members Intent |
| `GUILD_WELCOME_MESSAGE_FILE` | unset | UTF-8 welcome template; omitted uses the built-in neutral introduction |
| `BLIZZARD_OAUTH_REDIRECT_URI` | unset | Enable Battle.net consent callback; requires roster configuration |
| `DISCORD_WEBHOOK_URL` | unset | Use a supplied webhook instead of managing one per channel |
| `GUILDHEAD_DATA_DIR` | `/data` | Persistent JSON state |

Command names must be distinct, 1-32 characters long, and use only lowercase
letters, digits, underscores, or hyphens. Renaming a command replaces the old
registration on restart.

For roster announcements, provide both Blizzard credentials,
`BLIZZARD_GUILD_NAME`, and `GUILD_ANNOUNCEMENT_CHANNEL_ID`. Optional roster
settings are `BLIZZARD_REGION` (`us` by default), `GUILD_ANNOUNCE_EVENTS`
(`joins`), and `GUILD_ROSTER_POLL_MINUTES` (`10`, allowed range 2-1440).
Events are `joins`, `leaves`, and `ranks`.

The application can read `DISCORD_TOKEN_FILE` and `BLIZZARD_CLIENT_SECRET_FILE`
instead of secret values. Mount those files read-only and pass their container
paths. The bundled Compose file uses environment values; secret-file mounts
need a local Compose override. Never commit credentials or post them in issues.

The first successful roster poll establishes a baseline without announcements.
Changes need two consecutive observations. These are delayed Blizzard
snapshots, not live login/logout events.

## Optional welcome DMs

Enable **Server Members Intent** in the Discord Developer Portal before setting
`GUILD_WELCOME_ENABLED=true`. Welcomes are disabled by default, independent of
character linking and role sync. Only new human joins in servers containing a
configured `DISCORD_CHANNEL_IDS` channel receive a DM. Existing members are not
messaged on startup; bots are skipped. Blocked DMs fail quietly without public
fallback, retry, or stored delivery history. Leaving and rejoining can trigger
another welcome.

The default introduces Guildhead, commands usable without linking, optional
linking/main selection, privacy limits, and the source repository. It makes no
server-specific authorship claims. For your own text, mount a UTF-8 file
read-only and set its container path. For example, merge this into a local
Compose override, preserving any existing ports, mounts, and settings:

```yaml
services:
  bot:
    environment:
      GUILD_WELCOME_ENABLED: "true"
      GUILD_WELCOME_MESSAGE_FILE: /config/welcome.txt
    volumes:
      - ./welcome-config:/config:ro
```

Create `welcome-config/welcome.txt` before starting. Templates support `{help}`,
`{wow}`, `{craft}`, `{lfg}`, `{roster}`, and `{character}` for configured slash
command names, plus `{source}` for the GitHub repository. For example,
`{character} link` renders the full linking command. Other braces remain literal.
Keep rendered text between 1 and 2000 characters; invalid or unreadable files
stop startup. Mentions and automatic link previews are disabled.

Keep custom wording accurate: never promise zero risk or require linking to
participate. Explain that Battle.net handles sign-in, user tokens are not
stored, and saved guild-character data remains until unlinked. Describe
Guildhead as convenience, not pressure about progression or gameplay roles.
Custom templates are deployment configuration, separate from the data-volume
backup. Restart Guildhead after editing the template.

## State and backups

Compose mounts a named volume at `/data`. It contains:

| File | Contents |
|---|---|
| `guild-roster-<guild-slug>.json` | Confirmed members, pending observations, last successful stored poll time |
| `crafters.json` | Self-registered crafter listings |
| `lfg.json` | LFG groups and announcement tracking |
| `character-links.json` | Dated ownership, selected mains, public class/profession snapshots; no access tokens |

Keep the volume when replacing a container. `docker compose down -v` removes
it; do not use that command for routine upgrades.

For a consistent backup, stop the bot briefly, archive the volume, and restart:

```sh
docker compose stop bot
(umask 077; docker compose run --rm --no-deps -T --entrypoint tar bot \
  -C /data -czf - . > "guildhead-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz")
docker compose start bot
```

Check the archive with `tar -tzf <backup-file>` before relying on it. Keep a
separate encrypted backup of credentials using your normal secret manager.
State backups contain Discord identifiers and character data, but do not
contain the bot token.

Restore into a new volume, not over the only copy of existing state. This
example uses the published image; replace `<version>` with the version you
intend to run and `<backup-file>` with your archive:

```sh
docker volume create guildhead-restored
docker run --rm -i --user root \
  --mount source=guildhead-restored,target=/data \
  --entrypoint sh ghcr.io/corigne/guildhead:<version> \
  -c 'tar -xzf - -C /data && chown -R node:node /data' < <backup-file>
```

Use a new volume name for each restore attempt. Stop the existing bot before
starting a replacement pointed at the restored volume. Check logs and commands
before retiring the old container or its volume.

## Upgrades and rollback

For source deployments, note the current commit, take a backup, then:

```sh
git pull --ff-only
docker compose up -d --build
docker compose logs --tail=80 bot
```

For image deployments, pin a version such as `ghcr.io/corigne/guildhead:1.10.0`
instead of `latest` when repeatable rollbacks matter. Pull the replacement
before stopping the working container.

Rollback means running the previous image with a compatible state backup.
Restore that backup into a separate volume first. New fields may be ignored
by an older release, but that release can drop them when rewriting state;
do not assume a downgrade preserves new features. Keep the pre-upgrade backup.

v1.6 can read v1.5 LFG files without resetting groups. It adds announcement
tracking to the same file. Before downgrading, keep a backup: v1.5 ignores that
tracking and drops it on its next write. Existing pre-v1.6 announcements remain
snapshots; do not reset group state to try to recover their message IDs.

v1.7 adds an optional roster check timestamp without changing the state version
or resetting confirmed members and pending observations. Older files remain
usable; `/roster` reports unknown age until a successful poll stores the time.
Older releases ignore the timestamp and may drop it on their next write.

v1.8 reads old crafter files without assigning their entries to a server. On
the first successful registration or removal it writes schema v2, preserving
unscoped entries in `legacyListings`. Searches do not migrate or rewrite the
file. Owners re-register in the appropriate server; old entries are never
automatically exposed there. Previous releases reject schema v2 rather than
misinterpreting the new scope. To downgrade, restore the pre-upgrade backup
into a separate volume. Do not change the version number by hand.

v1.10 adds optional main-selection and public profile fields to character links.
Old links remain private until their owner selects a main. Older releases can
read those links but may drop the new fields when writing. Profession choices
now include gathering, Fishing, and First Aid; older releases reject crafter
files containing those names. Use a pre-upgrade backup when downgrading.
Discord role definitions and member assignments are not part of the data
archive: disable role sync first and arrange any role rollback separately.

Character linking adds a separate file and leaves existing roster, LFG, and
crafter data alone. See the [linking guide](character-linking.md) for callback
hosting and consent setup. `compose.override.yaml` is ignored by Git and can
hold non-secret host-local ports and callback configuration.

## Troubleshooting

**No slash commands:** check the startup log for registration errors and verify
that the app is installed in the server. Discord may cache the command picker.
Command-name collisions can be avoided with the settings above.

**Tooltips read messages but cannot post:** linked channels reject ordinary bot
messages. Grant View Channel and Manage Webhooks there. In normal channels,
grant Send Messages and Embed Links.

**Roster monitoring does not start:** both Blizzard credentials are required.
Check guild spelling, region, announcement channel access, and HTTP errors in
the logs. Guildhead never prints credentials intentionally; still review logs
before sharing them.

**Permission denied under `/data`:** the container runs as the `node` user
(UID 1000 in the bundled image). Bind mounts and restored volumes must be
writable by that user. Repair ownership only on Guildhead's data directory,
not on a shared parent directory.

**Roster lookup unavailable:** `/roster` needs the existing Blizzard roster
configuration and a successful initial poll. It only works in the server
containing the configured announcement channel. The bot must still be able to
fetch that channel to verify the server, even when lookup runs elsewhere in
that server.

**Roster lookup is stale:** the saved snapshot has not advanced for more than
two polling intervals. Check poll errors, credentials, Blizzard availability,
and announcement delivery permissions. A failed poll or announcement delivery
does not advance the stored timestamp. Searching the roster never fetches new
Blizzard data or changes the existing confirmation rules.

**Corrupt JSON state:** stop the bot and copy the affected file for inspection.
Restore a known-good backup. Do not delete the file merely to silence an error:
resetting roster state loses its baseline and resetting directories loses
registrations.

**LFG group not found:** groups are scoped to a Discord server and expire after
two hours. A leader leaving also closes the group. Old public posts are not
evidence that a group remains joinable.

**LFG post is stale:** new groups save their announcement message ID and update
that post after changes. Failed edits retry once a minute; `/lfg show` reads
stored membership even if Discord delivery fails. Check channel permissions,
webhook access, and logs. A deleted post is not recreated. Posts made before
v1.6 cannot be updated automatically because those releases did not store their
message IDs.

**No leader DM:** the leader may block DMs from the bot or server members. The
signup still succeeds. Notification delivery is best effort, and old
notifications are not replayed after restarts.

## Development checks

Run `npm test` and `docker build .` before publishing. The test command enforces
100% line, branch, and function coverage for source modules other than
`src/index.ts`. That exclusion includes process wiring and some Discord
transport code; unit coverage is not proof of a successful live Discord flow.
