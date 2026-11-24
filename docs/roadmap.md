# What's next for Guildhead

Guildhead focuses on helping guildmates find each other, share useful
information, and organize play through Discord. This is a direction, not a
release schedule.

## Available now

The current release is
[v1.12.1](https://github.com/corigne/guildhead/releases/tag/v1.12.1).

- Wowhead tooltips in synced chat and direct name lookups.
- Manual crafter listings and opt-in synced profession skills.
- Groups with signup posts, leader DMs, two-hour expiry, and a dedicated
  announcement channel when configured.
- Suggestions for your open groups when using `/lfg close`.
- Saved guild-roster search and confirmed membership/rank announcements.
- Optional Battle.net linking, main selection, and class/primary-profession
  roles.
- Optional welcome DMs and pinned command guides.

See the [command guide](commands.md) for how to use these features.

## Next priorities

**Find someone who knows a recipe.** Extend the crafter finder beyond
profession names: find a guildmate who knows the specific recipe and show
the materials needed. Blizzard exposes known recipes and recipe details,
but coverage needs more checking before this becomes a command.

**Show who's online in WoW.** A dedicated guild-status channel remains a
goal, but it is blocked. The Blizzard information checked so far does not
include live character presence, and Discord availability cannot establish
whether someone is playing. We need a reliable in-game source first.
If that source goes away, the display must say status is unknown rather
than marking everyone offline.

**Keep checking everyday use.** Member feedback has confirmed the core
lookups, roster, character setup, crafters, pins, and groups. Some real-world
checks remain, including a welcome on a genuine new-member join, the close
suggestions in Discord, and expired-group and account-removal edge cases.

## Ideas worth exploring

These are candidates, not available commands or promised releases.

| Idea | What it could help with | Important limit |
| --- | --- | --- |
| Quest buddies | Find guildmates sharing a quest or zone. | Members would choose whether to share; saved quest information is not live activity. |
| Character cards | Show gear, talents, stats, and a portrait together. | Informational, not an automatic gear score or signup requirement. |
| Reputation goals | Show progress toward the next standing. | Updates can lag behind the game. |
| Collection goals | Plan shared mount, pet, toy, or appearance goals. | Having a collection list does not tell us how to obtain every reward. |
| Milestone digests | Optional summaries of levels or achievements. | Needs controls to avoid unwanted tracking or notification spam. |
| Server availability | Show whether the guild's ruleset is up. | Server status is separate from individual players being online. |
| Scheduling handoff | Make it easier to use tools such as Raid-Helper. | Needs a specific guild need; no second raid calendar is planned. |

Blizzard supplies useful information for several of these ideas, but some
responses are incomplete or empty. We are not promising boss loot tables,
reliable quest prerequisites, or a full acquisition guide from that data.
Wowhead remains the source for existing tooltip lookups.

## Scope and limits

Guildhead does not currently offer recipe-level crafter searches, quest
matching, live WoW presence, or the ideas above. Saved ownership checks do
not prove continuous ownership; members can recheck with `/character refresh`.

Blizzard's Forever support is undocumented and can change. Neither a recent
chat message nor an old profile update proves someone is online.

General moderation, loot council, AI chat summaries, and another raid
calendar are outside the current focus.
