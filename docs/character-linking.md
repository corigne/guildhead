# Character linking

Guildhead can check which characters a consenting player owns through
Battle.net, then keep only characters matching the saved guild roster. An app
token cannot do this: it identifies the bot application, not the player.

## What works

Checked November 23, 2026:

| Surface | Evidence | Use |
|---|---|---|
| Authorization-code flow with `wow.profile` | [Blizzard's OAuth guide](https://community.developer.battle.net/documentation/guides/using-oauth/authorization-code-flow), also available in a [documentation archive](https://back1ply.github.io/bnet-docs-backup/documentation/guides/using-oauth/authorization-code-flow.html) | Obtain a consenting player's token |
| Forever public character profile | HTTP 200 on Traveler | Character metadata, not ownership |
| Forever character professions | HTTP 200 on Traveler; primary/secondary profession IDs and one Forever tier with skill/max skill | Validated public skill snapshots; recipe notes remain self-reported |
| `/profile/user/wow` with an app token | HTTP 403 on Traveler | Expected rejection: app credentials do not attest ownership |
| `/profile/user/wow?namespace=profile-forever-{region}` with a user token | [Community live reports](https://mhuijskens.com/WoWForever/Api/#the-account-profile) and [published response types](https://github.com/Pinta365/blizzard_api/blob/main/src/wow_forever/account.ts) | Account characters under `wow_accounts[].characters[]`; live player consent still required for deployment validation |

Forever's API remains undocumented by Blizzard. Guildhead validates account
objects, character IDs, token type, and granted scope at runtime. It does not
follow character URLs supplied in a response. A malformed response, wrong
scope, missing roster, or lack of matching characters saves nothing.

## Hosting the callback

Use the existing Battle.net client and register an exact HTTPS redirect URI:

```text
https://guildhead.example.org/oauth/battlenet/callback
```

Set `BLIZZARD_OAUTH_REDIRECT_URI` to that same URI. Existing Blizzard roster
credentials and configuration are required. The listener starts only when
this setting is present, on container port 8787.

For Compose, expose it on host loopback only:

```sh
docker compose -f compose.yaml -f compose.oauth.yaml up -d --build
```

Alternatively, put the port mapping and non-secret redirect URI in a local
`compose.override.yaml`, which Compose loads automatically. Do not publish
port 8787 on all host interfaces.

A Caddy site can terminate HTTPS and proxy only the callback path:

```caddyfile
guildhead.example.org {
    log {
        output discard
    }
    handle /oauth/battlenet/callback {
        reverse_proxy 127.0.0.1:8787
    }
    handle {
        respond "Not found." 404
    }
}
```

Replace the example hostname everywhere. With valid DNS and ACME reachability,
Caddy can issue and renew the certificate itself; Certbot is not required.
If the operator uses Certbot instead, its certificate must cover the callback
hostname and its renewal hook must reload Caddy. A certificate for the root
domain alone does not cover subdomains.

Do not put a login challenge or bot-interstitial page in front of this path.
Do not log callback query strings at the proxy or application layer. Cloudflare
may proxy the host normally; its connection to the origin must have valid TLS.
An empty or invalid callback request should return HTTP 400 without contacting
Battle.net, not a proxy error.

## Linking a character

1. Run `/character link` in the configured Discord server. Read the private
   access, retention, and revocation explanation before opening the URL.
2. Open the private link and authorize your own Battle.net account.
3. Matching guild characters are saved automatically. Return to Discord and
   run `/character list` to view them, or `/character unlink` to remove them.
4. Run `/character main` and choose your main from the private picker. This
   opts into API-backed crafter listings and configured class/profession roles.
   The picker supports multiple pages; another user's controls cannot select
   a main for your account.

The browser callback shows a WoW-themed status page with complete Discord
commands to copy, using the configured command name if renamed. It loads
no external assets or scripts and never displays authorization codes or tokens.
It reports success only after the matched characters have been saved.

Sign-in URLs expire after ten minutes and work once. New login attempts invalidate
previous attempts by the same Discord user/server. State is bound to the
requesting user and server, but the authorization URL must still stay private.
Successful authorization saves to the Discord user and server that started the
flow. Never forward a sign-in URL or authorize one somebody else sends you.

Only characters present in both the authorized account and the confirmed
guild snapshot are saved. A recent join may need two roster polls to appear.
Other alts, BattleTags, Battle.net account IDs, and access/refresh tokens are not
stored. Pending authorization disappears after restart. Saved links have no
automatic expiry and survive restarts until removed by `/character unlink`.
Operator-managed backups have their own retention policy. Unlinking does not
revoke Battle.net app permission; revoke that separately in account settings.

Ownership is a dated check, not permanent attestation. It does not continuously
revalidate transfers.
Use `/character refresh` to start another private Battle.net authorization flow.
It replaces the saved character snapshot and check time only on success; failed,
denied, or expired refreshes preserve the last good proof. No tokens are stored,
so Guildhead cannot silently recheck ownership in the background. Public class
and profession skill data refresh about every six hours with renewable app
credentials. Failed profile requests preserve the last good snapshot and its
check time. Profile updates cannot resurrect an unlinked or refreshed ownership
record. Only characters still in the confirmed guild roster contribute to
roles or synced crafters. Public snapshots cannot prove continued ownership.
Other Discord servers cannot use the configured guild roster for linking.

Some low-level characters return HTTP 404 for public professions. Guildhead
labels that data unavailable, not "no professions"; those characters remain
selectable as mains and do not block other characters' skills. If previously
available data becomes unavailable, the last good snapshot is retained.

Selecting a main opts into public crafter listings. `/craft find` combines
synced skills with manual registrations, prefers the API snapshot for the same
owner/character, and retains manual notes as self-reported. Skill snapshots do
not verify arbitrary recipe claims or current availability.

## Discord roles

The selected main supplies one class role. All linked, confirmed guild
characters contribute primary profession roles, deduplicated across alts.
Cooking, Fishing, and First Aid stay in skill snapshots and crafter searches
but do not assign roles. Reconciliation removes their legacy assignments from
opted-in members without deleting the Discord role definitions. Enable role
sync only after enabling **Server Members Intent** in Developer Portal ->
Guildhead -> Bot -> Privileged Gateway Intents, granting Manage Roles, and
placing Guildhead above the class/profession roles. Set
`GUILD_ROLE_SYNC_ENABLED=true`. It is off by default.

Existing class/profession role names are reused case-insensitively. Missing
roles are created with no permissions. Duplicate names, elevated permissions,
managed roles, or inaccessible hierarchy fail closed instead of silently
choosing a role. No roles are renamed, deleted, or reordered.

Guildhead is authoritative for class/profession roles of users who select a
main. Member-update events reconcile conflicting assignments (including
Carl-bot reactions), with a ten-minute periodic fallback. It changes individual
managed roles rather than replacing the member's complete role list.
If any linked character's professions are unavailable, known primary profession
roles can be added but existing primary profession roles are not removed based on missing
data. Class-role reconciliation still works. Full profession reconciliation
resumes after the next successful complete refresh.
Unlinked users remain outside this authority. Other Carl-bot preferences stay
untouched. Retiring Carl's old class menu is recommended to avoid misleading
choices, but Guildhead does not delete it or edit Carl-bot's configuration.

The callback gives full copyable commands and directs players to `#roles` for
Tank/Healer/DPS, region, pronouns, and experience preferences. Guild-rank roles
remain officer-managed. Unlinking attempts to clear managed roles and stops
synced crafter listings; manually registered entries remain separate.

Battle.net's documented authorization-code flow returns an expiring access
token, not a renewable offline credential. A
[Blizzard developer-forum discussion](https://us.forums.blizzard.com/en/blizzard/t/oauth-api-refresh-token/559)
also reports that refresh tokens are unavailable. Do not promise unattended
ownership renewal or confuse renewable app-only roster access with player
authorization.

The requested `wow.profile` scope permits reading WoW profile data, not playing
characters, making purchases, or changing Battle.net account settings. Guildhead
uses it only for the character-list request and never receives the player's
password or authenticator codes. Discord role permissions are separate from
Battle.net authorization.

## Verification

Automated tests cover user-token contracts, denied scopes, account mismatches,
state replacement/replay/expiry, server isolation, automatic saving and refresh,
unlink during an in-flight exchange, storage failures, and the real HTTP
listener. Tests also cover main-picker pagination, owner binding, skill
contracts, role deduplication and permission safety, background refresh,
stale-guild filtering, failed-sync recovery, and unlink races.
Fixtures are not a substitute for one real consent round-trip.
Never paste authorization codes, state URLs, or user tokens into an issue.
