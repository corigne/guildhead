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

A broader follow-up checked 25 documented API routes. Character `/status`
returned only links, an identity ID, and `is_valid`, not session presence.
Ruleset detail returned `status.type: UP`; that is ruleset/server availability,
not the status of guild members. Guild endpoints advertised
`Cache-Control: public, max-age=10800`, which permits three hours of HTTP
caching and is not a guarantee of any particular update interval.

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

### Broader API evidence

On November 24, 2026 UTC, 25 bounded read-only GET requests all returned HTTP
200 in the configured US region. The sample covered one guild and one
opted-in, roster-confirmed main character. Only aggregate counts, field names,
and response metadata were retained. No raw player profiles, names, IDs,
tokens, or chat messages were saved by the probe.

| API family | Observed data | Limit |
| --- | --- | --- |
| Guild profile and roster | Membership, ranks, ruleset, faction, crest reference | No member presence |
| Guild activity and achievements | Guild/link metadata only | No activity events or achievement entries in this sample |
| Character profile and status | Profile links, level/item-level fields, identity validity | A profile timestamp or `is_valid` does not prove online status |
| Equipment and statistics | Equipped items/sets, stats, enchantments, weapon and defensive fields | Snapshot data, not live combat telemetry |
| Specializations | Specialization groups and selected talents | Sample does not establish every class/build contract |
| Professions and recipes | Primary/secondary skills, 113 known-recipe references, one recipe detail | Not yet a production recipe-search contract |
| Reputations and PvP | Standing references, honorable kills/rank, battleground statistics | No live PvP or player location feed |
| Quests and achievements | In-progress/completed quest entries, achievement criteria and recent events | Not a live quest or session event stream |
| Character media | Four image asset references | Images were not downloaded; other characters may return 404 |
| Raid/dungeon encounters | Links/character metadata only | No completion history in this sample |
| Rulesets | Four ruleset references; selected ruleset reported `UP` | Server availability, not player availability; advertised cache lifetime 30 seconds |
| Auction indexes | Both `/auctions/` and `/auctions/index` returned 15 house references | Auction listings/prices were not downloaded |
| Static professions and recipe detail | Profession index plus crafted item/quantity, description, media and reagents | Static alias resolved to `static-1.60.1_70399-forever-us` |

Useful unofficial references:

- [Forever API notes](https://mhuijskens.com/WoWForever/Api/).
- [Community findings on Blizzard's API forum](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334).
- [TypeScript client character/guild notes](https://github.com/Pinta365/blizzard_api/blob/0f66238c7a4e4269cfcd37c19c76fe6062d9f4ba/docs/content/02-forever/02-characters-and-guilds.md)
  and [open questions](https://github.com/Pinta365/blizzard_api/blob/0f66238c7a4e4269cfcd37c19c76fe6062d9f4ba/docs/content/02-forever/05-open-questions.md).
- [Python SDK character models](https://github.com/SideQuest-Guild/wow-forever-sdk/blob/cd48fdbe9d66c43eea88628be667972a16edfb98/src/wow/models/character.py),
  which independently distinguish character validity from presence.

The community sources report logout-based character snapshots. This probe
did not perform a controlled login/logout timing test or establish freshness
guarantees. Documentation also differs on auction index paths; both forms
above worked in this sample, not necessarily every region or future version.
HTTP 200 alone does not establish useful data or a stable contract.

Account/protected-character routes require a fresh authorized user token and
were not probed. The official website's internal GraphQL routes were not used
as an alternate presence source. No SDK was installed and production settings
were unchanged.

### Additional feature candidates

A second November 24 survey made 33 bounded GET requests, including one
repeated index read: 31 returned HTTP 200 and two returned 404. Populated
responses support the candidates below, not finished feature contracts.
Profile checks still covered only the same opted-in US main.

| Suggested order | Proposed feature | Evidence and delivery boundary |
| --- | --- | --- |
| 1 | Find a crafter for an exact recipe, with reagent quantities | Blacksmithing exposes 507 recipe references in 33 categories; earlier probes confirmed character-known recipes and recipe details. Catalog entries alone do not prove obtainability or that a player knows the recipe. |
| 2 | Find guildmates sharing a quest or zone | 138 quest-area references, a populated area catalog, active quest IDs and three quest details with rewards. Snapshot-based matching needs visible age and explicit sharing; all three sampled quest prerequisites were empty, so do not claim attunement or eligibility checks. |
| 3 | Rich character inspection card | Previously verified gear/stats/talents/media, plus populated appearance data. Keep it informational, not an automatic gear score or role gate. |
| 4 | Reputation goal/progress helper | 56 faction references and eight standing bands with numeric minimum/maximum thresholds; character reputations were verified in the first survey. No live reputation tracking implied. |
| 5 | Collection checklist or shared collection goals | 141 mount references and populated mount, pet, toy and appearance collections. Ownership scope and item/appearance mapping need validation; the sampled mount lacked acquisition-source fields. |
| 6 | Optional achievement/level milestone digest | 176 achievement references and a populated criterion; character achievement events and roster levels were previously verified. Any announcements need explicit opt-in and snapshot deduplication, not live-event claims. |

Keep Wowhead as the existing lookup source. The item-search sample returned
three results with only one exact name match; preserve exact-match filtering.
The sampled Fireball spell and Hogger creature IDs returned 404, and their
name searches returned no results. This does not establish that all spells
or creatures are unavailable.

Both dungeon journal indexes were metadata-only, and the sampled character
had no title entries. Do not promise boss loot tables, dungeon completion
checks, reliable prerequisite graphs, or a full acquisition guide from these
responses. No new commands, recurring collection, SDK dependencies, or
production configuration were added.

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

The broader follow-up above also inspected one known recipe's detail response.
It exposed crafted-item and quantity fields, description, media and reagents.
That confirms a useful next validation target, not a finished recipe parser.

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
