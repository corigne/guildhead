# Roadmap

Guildhead prioritizes finding players, answering gameplay questions, and
keeping guild communication useful in Discord. This is an ordered worklist,
not a release-date promise.

## Shipped

- Automatic Wowhead tooltips and explicit `/wow` lookups.
- Private `/help` and configurable command names.
- Blizzard roster snapshots with confirmed join and rank announcements.
- Self-registered crafter finder.
- Server-scoped crafter listings, multiple characters per profession, and
  tested ordinary/webhook delivery. Unscoped legacy records remain preserved
  and hidden until owners re-register.
- Persistent, server-scoped LFG groups with two-hour expiry.
- Updated LFG announcements and join/leave notifications to group leaders.
  Delivery failures do not discard signups; failed post edits retry after
  restarts.
- Private roster lookup by name, class, level, and numeric rank, using saved
  snapshots with stale/unknown-age labels.
- Opt-in Battle.net character ownership linking with automatic saving after
  authorization, private access/retention disclosures, and an explicit refresh
  command. Real-player consent is still needed to validate Forever's
  user-token response on this deployment.
- Private main-character selection, API-backed profession skills, and optional
  main-class/profession roles. Skills refresh about every six hours; ownership
  still requires explicit Battle.net authorization. Existing class roles are
  reused, and unrelated Carl-bot preference roles remain untouched.

## Next

1. Validate character linking with a consenting player on the deployed
   callback. Public character and profession endpoints return 200; app tokens
   correctly receive 403 from the account endpoint.
2. Validate known-recipe payloads before adding recipe lookup. Profession skills
   are synced; free-form recipe notes remain self-reported.
3. Add a useful handoff to established scheduling tools such as Raid-Helper.
   Do not build another raid calendar without a concrete unmet need.

## Known limits

Manual crafter entries and recipe notes remain self-reported. Synced skills
have a separate Blizzard check time. Ownership checks do not prove current
guild membership or continuous ownership. Optional roles use confirmed guild
snapshots and public profile data, not live presence.

Forever's roster API is undocumented and can change. Polling is not live
presence. Discord activity and voice connections do not prove a character is
online in WoW.

Forever's user-token account endpoint is
[reported working](https://mhuijskens.com/WoWForever/Api/#the-account-profile).
Character linking needs an authorization-code consent flow and callback
service; it is not blocked by a known lack of Blizzard ownership APIs.

## Not priorities

Vanity dashboards, inferred online status, loot council, general moderation,
and AI chat summaries. Prefer integration with mature tools over owning
unrelated features.
