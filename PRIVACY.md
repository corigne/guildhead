# Privacy policy

Effective date: November 23, 2026

Guildhead scans messages only in Discord channel IDs configured by the
operator. Slash commands may be used in other channels where the application
is available; LFG and roster commands require a server.

## Data processed

- Discord message content, solely to detect bracketed World of Warcraft names
- Discord guild, channel, message, user, and webhook identifiers required to
  receive messages and post tooltip cards
- Item, quest, spell, NPC, and achievement names sent to Wowhead for lookup

## Storage

Guildhead does not persist Discord message content. Wowhead lookup results are
cached in process memory for 24 hours and disappear when the process restarts.
When guild-roster monitoring is enabled, Guildhead stores a local roster
snapshot containing character IDs, names, classes, levels and numeric guild
ranks, plus the time of the last successful stored poll. This state detects
changes and supplies private `/roster` results in the Discord server containing
the configured announcement channel. Lookup filters are not persisted or sent
to Blizzard. The state remains under the self-hosting operator's control.
Crafter directory registrations store the
registering Discord user ID, character name, profession, optional notes, and
update time until the user removes that listing. Operational logs may contain
Discord message IDs, character names and error details, but not bot tokens or
webhook URLs.

LFG state stores the Discord server ID, group ID, leader and member user IDs,
activity name, capacity, expiry time, and announcement channel/message/webhook
IDs in the operator's data directory. No webhook tokens are stored in that
state. Groups are visible through commands in their originating server.
Creation announcements and roster edits are public in the invoking channel;
command acknowledgements are private. Leaders receive a DM identifying users
who join or leave their group. Failed DMs are not queued or replayed.

Leaving removes a user from the current roster; closing removes a group from
active listings. Groups expire after two hours. Guildhead checks for expiry
once a minute and keeps a final roster snapshot until its closed/expired
announcement has been updated or the message is found to have been deleted.
Failed edits retain that snapshot for retry, including across restarts.
Discord announcements and leader DMs remain subject to Discord and server
message-retention policies.

## Third parties

Guildhead communicates with Discord, Wowhead, and Wowhead's image CDN. Their
respective privacy policies govern data processed by those services.

## Self-hosted deployments

Each operator controls their Guildhead instance, configured channels, logs,
retention, and infrastructure. Contact that operator for requests involving a
self-hosted instance.

## Contact

Report privacy concerns through the repository's GitHub issue tracker. Report
sensitive security concerns using GitHub private vulnerability reporting.
