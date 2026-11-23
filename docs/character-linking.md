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
| Forever character professions | HTTP 200 on Traveler | Available for future skill/recipe work; not yet presented as verified |
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

1. Run `/character link` in the configured Discord server.
2. Open the private link and authorize your own Battle.net account.
3. Return to Discord and run `/character list`. Check the character names.
4. Run `/character confirm` to save, or `/character unlink` to cancel.

Links expire after ten minutes and work once. New login attempts invalidate
previous attempts by the same Discord user/server. State is bound to the
requesting user and server, but the authorization URL must still stay private.
Discord review is required before confirmation, so a browser callback alone
cannot attach characters to an account.

Only characters present in both the authorized account and the confirmed
guild snapshot are saved. A recent join may need two roster polls to appear.
Other alts, BattleTags, Battle.net account IDs, and access/refresh tokens are not
stored. Pending authorization disappears after restart. Saved links survive
restart and are removed by `/character unlink`; Battle.net app access can be
revoked separately in the player's account settings.

Ownership is a dated check, not permanent attestation. This feature does not
grant roles, continuously revalidate transfers, or verify crafter professions.
Re-run the flow to refresh proof. Other Discord servers cannot use the bot's
configured guild roster for linking.

## Verification

Automated tests cover user-token contracts, denied scopes, account mismatches,
state replacement/replay/expiry, server isolation, review and confirmation,
unlink during an in-flight exchange, storage failures, and the real HTTP
listener. Fixtures are not a substitute for one real consent round-trip.
Never paste authorization codes, state URLs, or user tokens into an issue.
