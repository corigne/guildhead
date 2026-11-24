# Privacy policy

Effective date: November 24, 2026

Guildhead is self-hosted. Your server's host controls its saved data, logs,
backups, and retention. Contact that person for help with your data.

## Messages and lookups

Guildhead scans messages only in the channels chosen by the host, looking for
bracketed WoW names. It does not save scanned chat messages. Names used for
tooltips and `/wow` searches are sent to Wowhead. Lookup results are kept in
memory for 24 hours and disappear when the bot restarts.

Slash commands can work in other channels where Discord allows them.
Crafter, group, roster, and character commands require a server, not a DM.
Welcome DMs do not give Guildhead access to your private conversations.

## What is saved

| Feature | Saved information |
| --- | --- |
| Guild roster | Character IDs, names, classes, levels, numeric guild ranks, and check information used for searches and change announcements. |
| Manual crafter listings | Server/user IDs, character names, professions, notes, and update times. |
| Character linking | Server/user IDs, region, matching guild-character IDs/names, ownership check time, selected main, sharing choice, and public class/profession information. |
| Groups | Server/group IDs, leader and member IDs, activity, size, expiry, and references to the public announcement. |
| Pinned guides | Channel, message, and webhook IDs needed to update the guides. No member data is saved for this feature. |

Discord identifiers are also used to receive commands and deliver replies.
Logs may include character names, message IDs, and error details. Credentials
and webhook URLs are not intentionally logged. Roster search and group-close
suggestion filters are not saved.

Roster results are private and available only in the configured guild's
server. Public group posts show signups; leaders receive DMs identifying
members who join or leave. Manual crafter listings are searchable in the
server where they were registered.

## Optional Battle.net linking

Battle.net handles sign-in; Guildhead never receives your password or
authenticator codes. You approve read-only WoW profile access. Guildhead
briefly uses your authorization token to read the account's character list;
it does not save access or refresh tokens.

Only characters matching the saved guild roster are retained. Unrelated alts,
BattleTags, and Battle.net account IDs are not saved. Sign-in links work once
for ten minutes; unfinished sign-ins also end when the bot restarts.

Saved links have no automatic expiry. Ownership is not rechecked in the
background; `/character refresh` starts another Battle.net sign-in. A failed
refresh keeps your previous saved link. Public class/profession information
refreshes about every six hours, separately from ownership.

Choosing a main opts into public synced crafter listings, associating your
Discord account with linked guild characters and their skills. Linking alone
does not publish those listings. Manually entered recipe notes are not
verified.

If role sync is enabled, your main supplies one class role and linked guild
characters supply primary-profession roles. Cooking, Fishing, and First Aid
do not grant roles; earlier assignments are removed without deleting the roles.
Guildhead uses Discord member/role information to keep those roles in step
with your selection, not to monitor online presence. Unrelated roles are
unchanged. Missing profession information does not cause existing primary
profession roles to be removed.

## Removing data

- `/character unlink` removes your link in this server, cancels unfinished
  sign-ins, stops synced listings, and attempts to remove managed roles.
  If role removal fails, ask an officer for help.
- `/craft remove` removes your manual listing. Those listings are separate
  from character linking.
- Revoke Guildhead's Battle.net permission separately in your account
  settings. Unlinking does not revoke it for you.
- Ask the host about roster data, older manual registrations that are no
  longer shown, logs, or backups. Registering again does not erase older,
  hidden registrations.

Leaving a group removes you from its signup list. Groups expire two hours
after creation; closing a group removes it from active listings immediately.
After a group ends, Guildhead may retain its final signup information until
it can update the announcement or confirm the post was deleted. Public posts
and DMs remain subject to Discord/server retention.

Removing data from Guildhead does not erase copies in the host's backups.
Those follow the host's retention policy.

## Welcome DMs and pinned guides

Optional welcomes go to new human members in configured servers. Guildhead
stores no recipient list or delivery history, does not message existing
members on startup, and does not retry blocked DMs or announce them publicly.
Leaving and rejoining can trigger another welcome.

Pinned guides are updated in place and may be recreated if deleted.
Disabling guides leaves the existing Discord messages. Sent messages remain
subject to Discord retention.

## Other services and contact

Guildhead communicates with Discord, Blizzard/Battle.net, Wowhead, and
Wowhead's image service. Hosts may use a web proxy for Battle.net sign-in;
it must not log private sign-in query strings. Those services have their own
privacy policies.

For privacy requests, contact your server's host. For project questions, use
the [issue tracker](https://github.com/corigne/guildhead/issues). Report
sensitive security concerns [privately](SECURITY.md), not in a public issue.
