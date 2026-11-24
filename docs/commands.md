# Using Guildhead

Start with `/help` for a private overview. This guide uses the default command
names; your server may use different names to avoid clashes with other bots.

You do not need to link Battle.net to use lookups, manual crafter listings,
groups, or the roster. Roster and character features need your server's host
to finish the optional Blizzard setup first.

## Tooltips and lookups

In a channel where automatic tooltips are enabled, write names in brackets:

```text
Anyone working on [The Missing Diplomat]?
```

Guildhead looks up items, quests, spells, NPCs, and achievements. It handles
up to three different bracketed names per message, with one combined reply.
Use the full name for the best match.

For a direct search, use:

```text
/wow query:Hearthstone
```

The optional `database` choice lets you search Forever, Retail, Classic Era,
or Cataclysm Classic. In a WoW-linked channel, your acknowledgement is private
and the result is posted for the channel. Elsewhere, the result appears as a
normal command reply.

## Find or list a crafter

```text
/craft find profession:Blacksmithing
/craft register character:Your Character profession:Blacksmithing
/craft remove profession:Blacksmithing character:Your Character
```

Add optional `notes` when registering to mention specializations, recipes, or
availability. Notes are supplied by the player, not verified by Guildhead.
Listings belong to the server where you register them.

You can register several characters. Re-registering the same character and
profession updates that listing. You can remove only your own manual
listings; if several match, choose the character to remove.

For automatically updated profession skills, [link your characters and choose
a main](character-linking.md). Synced skills take priority over a duplicate
manual listing, while keeping your notes. Individual recipe search is not
available yet.

## Find a group

```text
/lfg create activity:Deadmines size:5
/lfg list
/lfg show group:<group ID>
/lfg join group:<group ID>
/lfg leave group:<group ID>
/lfg close group:<group ID>
```

Creating a group posts an announcement in the server's configured LFG channel,
or the channel you used if no destination is set. Use the group ID from that
post or `/lfg list` to show, join, or leave it.

The post updates as membership changes. Leaders receive a DM when someone
joins or leaves, if their DM settings allow it. Your signup still counts if
Guildhead cannot deliver the DM or update the post; `/lfg show` shows the saved
membership.

Only the leader can close a group. The `group` field on `/lfg close` suggests
your open groups as `Activity (ID)`; type part of the activity or ID to filter.
If the leader leaves, the group closes.

Groups last two hours. Size includes the leader, defaults to five, and can be
2-40. You can lead one open group per server, with up to ten open groups per
server. These are Discord signups, not reserved in-game spots or proof that
members are online. Guildhead does not send role pings or messages into WoW.

## Browse the roster

```text
/roster name:Pepper
/roster class:Mage level:32
/roster rank:0
```

Results are private. Names match part of a name; class, level, and rank match
exactly. Rank 0 is the highest guild rank. Results show up to 15 characters;
add filters if you need to narrow the list.

The roster shows the last successful check and warns when it is old. It is
not an online list. New members and rank changes need two checks before
Guildhead confirms them, and Blizzard's information can be delayed.

## Set up your characters

Use `/character link` to get started, then `/character main` to select your
main. `/character list` shows saved characters, `/character refresh` rechecks
ownership, and `/character unlink` removes the link.

See [character setup](character-linking.md) for what linking shares and how
class/profession roles work.

## Channels and welcome messages

Automatic tooltip scanning runs only in the channels selected by your host.
Slash commands work elsewhere where Discord permissions allow; crafter,
group, roster, and character commands must be used in a server, not a DM.

Pinned guides and welcome DMs may point to a preferred commands channel.
That is a recommendation, not a command restriction. A closed DM setting
does not prevent you from using the bot.
