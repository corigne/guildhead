# Connect your characters

Linking is optional. It lets Guildhead check which guild characters you own,
keep your profession listings up to date, and set class/profession roles if
your server enables them.

You can use tooltips, manual crafter listings, groups, and the configured
roster without linking.

## Link and choose a main

1. Run `/character link` in your guild's Discord server.
2. Read the private explanation, open the sign-in link, and authorize your own
   Battle.net account.
3. After the success page, return to Discord and run `/character main`.
4. Choose your main from the private list. Use the page controls if needed.

Selecting a main opts into public crafter listings for your linked guild
characters and, when enabled, class/profession roles. Linking alone does not
publish your crafter listings.

Battle.net handles sign-in, and we never see your password or authenticator
codes. Only open a login you started yourself. Keep the link private; it
works once and expires after ten minutes.

If linking is unavailable, ask your server's host to complete the
[character-linking setup](operations.md#character-linking-setup).

## What gets connected

Guildhead keeps only characters that match the saved guild roster. Unrelated
alts and BattleTags are not saved. `/character list` shows your saved guild
characters, selected main, and the last ownership check.

Public profession skills refresh about every six hours. Cooking, Fishing,
and First Aid remain available in crafter searches alongside primary
professions. Notes you add manually, including recipe claims, remain
self-reported.

Choosing a different main changes your main class role when role sync is
enabled. Your linked guild alts can still contribute profession listings and
primary-profession roles.

## How roles work

When your server enables role sync:

- Your selected main supplies one class role.
- Your linked guild characters supply primary-profession roles, including
  gathering professions.
- Cooking, Fishing, and First Aid do not grant roles. Earlier assignments
  from Guildhead are removed without deleting the roles themselves.
- Tank/Healer/DPS, pronouns, region, experience, and guild-rank roles stay
  separate. Use your server's usual process for those choices.

Guildhead keeps managed class/profession roles aligned with your selection.
Picking a conflicting class through another bot may be undone. If a
character's profession information is unavailable, Guildhead keeps existing
primary-profession roles rather than assuming the professions were dropped.

## Refresh or unlink

`/character refresh` starts a new Battle.net sign-in to check ownership again.
If it fails or you cancel, your previous saved link stays in place. Saved
links do not expire automatically, and profession updates do not recheck
ownership.

`/character unlink` removes your saved link in this server, cancels pending
logins, stops synced crafter listings, and attempts to remove Guildhead's
managed roles. If role removal fails, ask an officer for help.

Manual crafter listings are separate; remove them with `/craft remove`.
You can also revoke Guildhead's access in Battle.net account settings.
Unlinking does not remove copies in the host's backups.

## If something is missing

**A new guild character is absent:** wait for the guild roster to update,
then run `/character refresh`. Guildhead needs two roster checks to confirm
new members, and Blizzard may take longer to update.

**Skills are unavailable:** some characters, especially low-level alts, have
no public profession information yet. They can still be selected as your
main; other characters' available skills can still be used.

**The sign-in link expired:** run `/character link` or `/character refresh`
again. Restarting Guildhead also cancels unfinished sign-ins.

**Roles did not change:** your server may not have role sync enabled, or the
bot may lack permission to update those roles. Ask an officer to check.

See the [privacy policy](../PRIVACY.md) for saved data and retention. Never
post sign-in links or authorization codes when asking for help.
