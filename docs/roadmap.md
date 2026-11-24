# Roadmap

Guildhead prioritizes finding players, answering gameplay questions, and
keeping guild communication useful in Discord. This is an ordered worklist,
not a release-date promise.

## Release checkpoint: v1.12.1

Checkpointed November 23, 2026:
[release and tag](https://github.com/corigne/guildhead/releases/tag/v1.12.1).

The published baseline includes dedicated LFG announcements and close-group
autocomplete. All 141 tests pass with exact 100% line, branch, and function
coverage for covered modules; application wiring in `src/index.ts` remains
explicitly excluded. Main/tag CI and container publication passed.

A player has confirmed help, automatic tooltips, explicit search, roster,
linking/main selection, crafters, pinned guides, and LFG operation. Deployment
checks separately verified primary-only role reconciliation, welcome-demo
delivery, dedicated-channel posting/same-post closing, and registered
close-command autocomplete. Genuine join-triggered welcome delivery and the
remaining edge cases below still need real-world checks.

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
  restarts. An optional dedicated LFG channel collects new announcements
  regardless of where a command was invoked; existing posts keep updating in
  their original channels.
- `/lfg close group` suggestions show the caller's open groups in the current
  server as `Activity (ID)`, with activity/ID filtering and unchanged leader
  authorization.
- Private roster lookup by name, class, level, and numeric rank, using saved
  snapshots with stale/unknown-age labels.
- Opt-in Battle.net character ownership linking with automatic saving after
  authorization, private access/retention disclosures, and an explicit refresh
  command. A player has confirmed login and main selection on this deployment.
- Private main-character selection, API-backed profession skills, and optional
  main-class/primary-profession roles. Secondary skills stay searchable without
  assigning roles. Skills refresh about every six hours; ownership
  still requires explicit Battle.net authorization. Existing class roles are
  reused, and unrelated Carl-bot preference roles remain untouched.
- Customizable welcome DMs and persistent pinned command guides.

## Next

1. Complete remaining manual checks such as a welcome on a genuine new member
   join, LFG leader DMs/expiry, the autocomplete dropdown in Discord, and
   refresh/unlink edge cases.
2. Add a dedicated guild-status channel once an authoritative in-game presence
   source is available. The source investigation and delivery criteria are
   recorded below. This remains blocked, not shipped.
3. Expand known-recipe validation before adding recipe lookup. The first public
   sample is documented below. Profession skills are synced; free-form recipe
   notes remain self-reported.
4. Add a useful handoff to established scheduling tools such as Raid-Helper.
   Do not build another raid calendar without a concrete unmet need.

### Guild-status channel: source blocked

The proposed channel shows actual WoW guild presence, not Discord availability.
Prefer one persistent, edited roster message. Login/logout announcements can
be considered separately after the source and roster view are validated.

A read-only deployment check on November 24, 2026 UTC found:

- The current 27-member Blizzard roster contained character references and
  ranks, but no online/offline, presence, or last-seen fields.
- The latest 100 messages in the configured synced-chat channel contained no
  online/offline or login/logout wording. This bounded sample is not proof
  that the integration can never emit such events.
- Guildhead currently receives chat messages and polls roster snapshots. It
  has no configured authoritative in-game presence feed.

[Blizzard's integration guide](https://news.blizzard.com/en-us/article/24296228/stay-connected-in-world-of-warcraft-with-discord)
describes chat mirroring, not a bot-accessible presence stream.
[Forever API notes](https://mhuijskens.com/WoWForever/Api/) describe delayed
roster/profile snapshots; profile timestamps are not a live session signal.
The deployment probe saved only aggregate counts, message shapes, and field
names, not message content, player identifiers, or credentials.

The next prerequisite is a supported native presence event, or an explicitly
configured addon/companion bridge supplying full in-game roster snapshots.
Do not treat chat activity, Discord availability, profile updates, or silence
as proof that a character is online or offline.

Before delivery, the source must establish:

- The correct guild and stable character identities.
- An initial full snapshot and freshness/heartbeat information, not only
  login/logout transitions that can be missed during downtime.
- Authenticated source identity and safe handling of duplicate or late data.
- An explicit unknown/stale state after source loss or restart. Source failure
  must not mark everyone offline; roster membership changes remain separate.
- A configured destination and saved message reference, with bounded output
  and no repeated startup announcements.

No presence intent, player tracking, new Discord channel, or production
configuration was enabled by this investigation. Discord-presence tracking
would be a separate, explicitly opted-in feature.

### Recipe API evidence

A read-only check on November 23, 2026 validated 113 recipe references across
two primary and three secondary professions on one available public profile.
Each observed `known_recipes` entry contained a positive integer `id`, a
nonempty `name`, and `key.href` pointing to the regional Blizzard
`/data/wow/recipe/{id}` endpoint. The links used a versioned
`static-<version>-forever-us` namespace.

This is one sample, not a complete contract for all regions, profession states,
or recipe-detail responses. Recipe lookup still needs runtime validation,
focused fixtures, and a defined user command. Future requests should construct
fixed regional endpoints rather than follow upstream URLs blindly. No player
identifiers, recipe lists, or tokens were saved during this probe.

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
