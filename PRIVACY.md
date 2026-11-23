# Privacy policy

Effective date: November 23, 2026

Guildhead scans messages only in Discord channel IDs configured by the
operator. Slash commands may be used in other channels where the application
is available; crafter, LFG, roster, and character commands require a server.

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
Crafter directory registrations store the Discord server ID, registering user
ID, character name, profession, optional notes, and update time until the owner
removes that listing. Pre-v1.8 registrations lack server IDs and are retained
in a separate legacy list, excluded from searches. Re-registering does not
delete that old record; contact the operator for legacy-data removal.
Operational logs may contain
Discord message IDs, character names and error details, but not bot tokens or
webhook URLs.

Optional welcome DMs use Discord member-join events in configured servers,
requiring Server Members Intent independently of role sync. Guildhead sends
the operator's introduction to new human members only; it does not read their
private messages. It stores no welcome recipients or delivery history and
does not retry or publicly announce blocked DMs. Existing members are not
backfilled after restart. Sent welcomes remain subject to Discord retention.
The default message explains voluntary linking and points to the source code;
operators can customize it for their server.

Optional pinned command guides store only channel, message, and webhook IDs
in a separate reference file; no webhook tokens or member data are stored for
this feature. Configured guides are refreshed in place and may be recreated
if deleted. Disabling the feature leaves existing Discord posts untouched.

Character linking is opt-in. The player authorizes `wow.profile` at Battle.net.
An access token is used in memory to retrieve owned character IDs; it is not
persisted. Only IDs and names matching the saved guild roster, region, Discord
server/user IDs, and verification time are saved automatically after successful
authorization. Public class and profession skill snapshots are cached for
those characters and refreshed about every six hours. Blizzard returns the WoW character list, including unrelated
alts; those unrelated entries, BattleTags, and Battle.net account IDs are not
retained. Guildhead never receives passwords or authenticator codes and does
not save access or refresh tokens. Pending logins expire after ten minutes or a
restart; saved links have no automatic expiry and remain until unlinked.
Ownership checks can become stale. `/character refresh` requires a new
Battle.net authorization flow and replaces saved links only after a successful
check; ownership is not refreshed in the background. Selecting a main with
`/character main` stores that choice and opts into public crafter listings,
which associate the user's Discord ID with their guild characters and API
profession skills. Previously linked users are not published until they
select a main. Manual recipe notes remain self-reported.

When enabled by the operator, role sync uses the selected main's class and all
linked guild characters' primary professions. Cooking, Fishing, and First Aid
remain in skill snapshots and searches but do not assign roles. Legacy secondary
profession role assignments are removed during reconciliation; role definitions
are preserved. Member-update events and periodic
reconciliation keep only those managed role assignments consistent; unrelated
roles are not changed. This requires Server Members Intent and exposes Discord
member/role metadata to the bot, not private messages or online presence.
Unavailable public profession data is marked explicitly, not treated as proof
that a character has no professions. Existing primary profession roles are preserved
while any linked character's data is unavailable.
`/character unlink` removes that user's saved link in the current
server, stops synced crafter listings, cancels pending logins, and attempts to
remove class/profession roles if the user opted into setup and role sync is
enabled. Failed role cleanup is reported for officer assistance. Manually
registered crafter entries are separate and must be removed with the craft
command. Unlinking does not revoke the app at Battle.net.
Battle.net permissions can be revoked separately in account settings.
Unlinking does not remove copies in operator-managed backups; those follow the
operator's backup retention policy.

LFG state stores the Discord server ID, group ID, leader and member user IDs,
activity name, capacity, expiry time, and announcement channel/message/webhook
IDs in the operator's data directory. No webhook tokens are stored in that
state. Groups are visible through commands in their originating server.
Creation announcements are public in the configured LFG channel, or the
invoking channel when none is configured. Roster edits update the saved
announcement in its original channel, including after configuration changes;
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

Guildhead communicates with Discord, Blizzard/Battle.net, Wowhead, and Wowhead's
image CDN. Public callback hosting may also pass through an operator's reverse
proxy or Cloudflare. Do not log callback query strings, which contain short-lived
authorization codes and login state. Their
respective privacy policies govern data processed by those services.

## Self-hosted deployments

Each operator controls their Guildhead instance, configured channels, logs,
retention, and infrastructure. Contact that operator for requests involving a
self-hosted instance.

## Contact

Report privacy concerns through the repository's GitHub issue tracker. Report
sensitive security concerns using GitHub private vulnerability reporting.
