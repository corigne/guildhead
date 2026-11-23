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

## State and backups

Compose mounts a named volume at `/data`. It contains:

| File | Contents |
|---|---|
| `guild-roster-<guild-slug>.json` | Confirmed members, pending observations, last successful stored poll time |
| `crafters.json` | Self-registered crafter listings |
| `lfg.json` | LFG groups and announcement tracking |

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

For image deployments, pin a version such as `ghcr.io/corigne/guildhead:1.7.0`
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
