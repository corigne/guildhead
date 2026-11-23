# Privacy policy

Effective date: November 22, 2026

Guildhead processes messages only in Discord channel IDs configured by the
operator.

## Data processed

- Discord message content, solely to detect bracketed World of Warcraft names
- Discord guild, channel, message, user, and webhook identifiers required to
  receive messages and post tooltip cards
- Item, quest, spell, NPC, and achievement names sent to Wowhead for lookup

## Storage

Guildhead has no database and does not persist Discord message content.
Wowhead lookup results are cached in process memory for 24 hours and disappear
when the process restarts. Operational logs may contain Discord message IDs and
error details, but not bot tokens or webhook URLs.

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
