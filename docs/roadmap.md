# Roadmap

Guildhead prioritizes finding players, answering gameplay questions, and
keeping guild communication useful in Discord. This is an ordered worklist,
not a release-date promise.

## Shipped

- Automatic Wowhead tooltips and explicit `/wow` lookups.
- Private `/help` and configurable command names.
- Blizzard roster snapshots with confirmed join and rank announcements.
- Self-registered crafter finder.
- Persistent, server-scoped LFG groups with two-hour expiry.
- Updated LFG announcements and join/leave notifications to group leaders.
  Delivery failures do not discard signups; failed post edits retry after
  restarts.

## Next

1. Roster lookup by character name, class, level, and rank. Reuse existing
   Blizzard snapshots and show how fresh they are.
2. Harden existing features: scope crafter listings to their server, support
   multiple characters per crafter, and cover more Discord delivery paths.
3. Add a useful handoff to established scheduling tools such as Raid-Helper.
   Do not build another raid calendar without a concrete unmet need.
4. Link Discord users to verified characters only if the available Blizzard
   authentication and character APIs support trustworthy ownership proof.

## Known limits

Crafter entries are self-reported, not API-verified, and currently shared by
all servers using one bot instance. One user can register only one character
per profession. Run separate instances if that scope is unsuitable.

Forever's roster API is undocumented and can change. Polling is not live
presence. Discord activity and voice connections do not prove a character is
online in WoW.

## Not priorities

Vanity dashboards, inferred online status, loot council, general moderation,
and AI chat summaries. Prefer integration with mature tools over owning
unrelated features.
