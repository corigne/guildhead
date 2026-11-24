# Guildhead

[![CI](https://github.com/corigne/guildhead/actions/workflows/ci.yml/badge.svg)](https://github.com/corigne/guildhead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Bring your WoW guild and Discord closer together.**

Guildhead is a self-hosted Discord bot for World of Warcraft: Forever. It
started with Wowhead tooltips in synced guild chat and now helps guildmates
find crafters, get groups together, and connect their characters to Discord.

**Linking your Battle.net account is optional.** Lookups, manual crafter
listings, groups, and the guild roster work without linking, once your server
has Guildhead set up.

## What you can do

| Feature | Try it |
| --- | --- |
| See tooltips in guild chat | Mention `[Hearthstone]` in a configured channel. Guildhead replies with a tooltip card and Wowhead link. |
| Look something up | `/wow query:Hearthstone` searches items, quests, spells, NPCs, and achievements. |
| Find a crafter | `/craft find profession:Blacksmithing` shows guild listings. Add yours manually or link your characters for synced skills. |
| Get a group together | `/lfg create activity:Deadmines size:5` posts a group. Members can join, leave, and browse recent groups. |
| Browse the guild roster | `/roster class:Mage` searches saved guild members by name, class, level, or rank. |
| Connect your characters | `/character link`, then `/character main`, sets up synced crafter listings and optional class/profession roles. |

Use `/help` for private command help. See the [command guide](docs/commands.md)
for examples and [character setup](docs/character-linking.md) for linking,
choosing a main, and removing your link.

## Made for your guild's Discord

Group posts can collect in a dedicated LFG channel and update as people join
or leave. Leaders receive signup DMs, and `/lfg close group` suggests the
groups they lead.

Optional welcome DMs and pinned guides help new members get started. A
preferred commands channel points people in the right direction without
blocking commands elsewhere.

When role sync is enabled, your selected main sets your class role, and your
linked guild characters supply primary-profession roles. Cooking, Fishing,
and First Aid remain searchable but do not grant roles. Other preferences,
such as Tank, Healer, or DPS, stay yours to choose.

Automatic tooltip replies stay in Discord rather than being sent back into
WoW. Tooltips default to Forever; Retail, Classic Era, and Cataclysm Classic
are also available as lookup databases. Guild roster and character features
are for Forever.

## Add Guildhead to your server

Guildhead is self-hosted: run your own copy with your own Discord bot.
The [hosting guide](docs/operations.md) covers installation, permissions,
optional features, backups, and upgrades. The current release is
[v1.12.1](https://github.com/corigne/guildhead/releases/tag/v1.12.1).

## Your account and data

Battle.net handles sign-in, and we never see your password. Guildhead does
not save your Battle.net access tokens. You can view saved characters with
`/character list` or remove your link with `/character unlink`.

The roster and profession skills can lag behind the game. Guildhead does not
show live WoW online/offline status or search individual crafting recipes yet.
See the [roadmap](docs/roadmap.md) for what's next and the
[privacy policy](PRIVACY.md) for what is saved and how to remove it.

## Links

[Command guide](docs/commands.md) |
[Character setup](docs/character-linking.md) |
[Hosting](docs/operations.md) |
[Roadmap](docs/roadmap.md) |
[Contributing](CONTRIBUTING.md) |
[Report a security issue](SECURITY.md)

## License and support

[MIT](LICENSE). If Guildhead helps your guild, you can
[support its development on Ko-fi](https://ko-fi.com/michelinboi).

Guildhead is not affiliated with or endorsed by Blizzard Entertainment,
Discord, or Wowhead. World of Warcraft and related marks belong to their
respective owners.
