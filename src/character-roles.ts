import { PermissionFlagsBits, type Client, type Guild, type Role } from "discord.js";

import { CLASS_NAMES } from "./blizzard.js";
import type { CharacterLink } from "./character-links.js";
import { professionNames } from "./professions.js";

const managedNames = [...new Set([...Object.values(CLASS_NAMES), ...Object.values(professionNames)])];
const professionRoleNames = new Set<string>(Object.values(professionNames));
const dangerousPermissions =
  PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageWebhooks | PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers | PermissionFlagsBits.ModerateMembers;

export class DiscordCharacterRoles {
  public constructor(
    private readonly client: Pick<Client, "guilds">,
    private readonly guildId: string,
  ) {}

  private async roles(guild: Guild, createMissing: boolean): Promise<Map<string, Role>> {
    const available = await guild.roles.fetch();
    const result = new Map<string, Role>();
    for (const name of managedNames) {
      const matches = available.filter(role => role.name.toLowerCase() === name.toLowerCase());
      if (matches.size > 1) throw new Error(`Duplicate class/profession role: ${name}`);
      let role = matches.first();
      if (!role && createMissing) {
        role = await guild.roles.create({
          name, permissions: [], mentionable: false, reason: "Guildhead character role setup",
        });
      }
      if (role) {
        if (role.managed || !role.editable || (role.permissions.bitfield & dangerousPermissions) !== 0n) {
          throw new Error(`Class/profession role is not safe to manage: ${name}`);
        }
        result.set(name, role);
      }
    }
    return result;
  }

  public async sync(link: CharacterLink): Promise<void> {
    if (link.guildId !== this.guildId) throw new Error("Character role server mismatch");
    const guild = await this.client.guilds.fetch(this.guildId);
    const roles = await this.roles(guild, true);
    const desired = new Set<string>();
    const characters = link.profile!.characters;
    const main = characters.find(character => character.id === link.mainCharacterId);
    if (main && roles.has(main.className)) desired.add(roles.get(main.className)!.id);
    for (const character of characters) {
      for (const profession of character.professions) desired.add(roles.get(profession.name)!.id);
    }
    await this.apply(guild, link.discordUserId, roles, desired, characters.some(character => character.professionsUnavailable));
  }

  public async clear(guildId: string, userId: string): Promise<void> {
    if (guildId !== this.guildId) throw new Error("Character role server mismatch");
    const guild = await this.client.guilds.fetch(this.guildId);
    await this.apply(guild, userId, await this.roles(guild, false), new Set());
  }

  private async apply(guild: Guild, userId: string, roles: ReadonlyMap<string, Role>, desired: ReadonlySet<string>, preserveProfessions = false): Promise<void> {
    const member = await guild.members.fetch({ user: userId, force: true });
    for (const [name, role] of roles) {
      if (member.roles.cache.has(role.id) && !desired.has(role.id) && !(preserveProfessions && professionRoleNames.has(name))) {
        await member.roles.remove(role.id, "Guildhead main character/profession sync");
      }
    }
    for (const roleId of desired) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId, "Guildhead main character/profession sync");
      }
    }
  }
}
