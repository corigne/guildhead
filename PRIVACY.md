# Privacy policy

Effective date: November 23, 2026

Guildhead scans messages only in Discord channel IDs configured by the
operator. Slash commands may be used in other channels where the application
is available; LFG commands require a server.

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
ranks. This state is used only to detect changes and remains under the
self-hosting operator's control. Crafter directory registrations store the
registering Discord user ID, character name, profession, optional notes, and
update time until the user removes that listing. Operational logs may contain
Discord message IDs, character names and error details, but not bot tokens or
webhook URLs.

LFG state stores the Discord server ID, group ID, leader and member user IDs,
activity name, capacity, and expiry time in the operator's data directory.
Groups are visible only through commands in their originating server. A group
creation announcement is public in the invoking channel; other LFG responses
are private. Leaving removes that user from the stored group; closing removes
the group. Groups expire after two hours and are pruned from storage on the
next successful LFG command. Previously posted Discord announcements remain
subject to the server's message-retention policy.

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
