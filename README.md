# Guildhead

[![CI](https://github.com/corigne/guildhead/actions/workflows/ci.yml/badge.svg)](https://github.com/corigne/guildhead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Bring your WoW guild and Discord closer together.**

Guildhead is a self-hosted Discord bot for World of Warcraft: Forever.
It enriches synced guild chat with Wowhead tooltips and helps guildmates
find crafters, organize groups, and connect their characters to Discord.

## Features

- **Wowhead tooltips and search** for items, quests, spells, NPCs, and achievements.
- **Crafter directory** with manual listings and synced profession skills.
- **Group finding** to bring guildmates together for dungeons, quests, and raids.
- **Guild roster** with member lookup and membership announcements.
- **Optional character linking** with main selection and class/profession roles.
- **Welcome messages and pinned guides** to help members get started.

Linking your Battle.net account is optional. Sign-in happens on Battle.net;
Guildhead never receives your password.

## Get started

Guild members can use the [command guide](docs/commands.md) and
[character setup](docs/character-linking.md).

To host a new copy on Linux, have Docker Compose, curl, and an initialized
`pass` password store ready. Run the guided setup:

```sh
curl -fsSL https://raw.githubusercontent.com/corigne/guildhead/main/scripts/install.sh | sh
```

This downloads and runs a [fixed version of the setup helper](https://github.com/corigne/guildhead/blob/bb454aae3f79dc75122023d7db779418dfd8a26c/scripts/setup.sh);
review it first if you prefer. It walks through Discord setup, keeps the token
encrypted, and starts the published bot. Try `/help` once it connects.
Existing installations are left alone. See the [hosting guide](docs/operations.md)
for manual setup, optional features, and starting again after a reboot.

## More

[Releases](https://github.com/corigne/guildhead/releases) |
[Roadmap](docs/roadmap.md) |
[Privacy](PRIVACY.md) |
[Contributing](CONTRIBUTING.md) |
[Report a security issue](SECURITY.md)

## License and support

[MIT](LICENSE). If Guildhead helps your guild, you can
[support its development on Ko-fi](https://ko-fi.com/michelinboi).

Guildhead is not affiliated with or endorsed by Blizzard Entertainment,
Discord, or Wowhead. World of Warcraft and related marks belong to their
respective owners.
