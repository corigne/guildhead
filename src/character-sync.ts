import type { BlizzardClient } from "./blizzard.js";
import type { CharacterLinkStore } from "./character-links.js";
import type { DiscordCharacterRoles } from "./character-roles.js";
import type { CrafterListing, Profession } from "./crafter-directory.js";
import type { RosterState } from "./roster-state.js";

export interface SyncedCrafterListing extends CrafterListing {
  skill: number;
  maxSkill: number;
  checkedAt: number;
  ownershipCheckedAt: number;
}

export class CharacterSync {
  public readonly rolesEnabled: boolean;
  private polling = false;
  private readonly operations = new Map<string, Promise<void>>();

  public constructor(
    private readonly store: CharacterLinkStore,
    private readonly blizzard: Pick<BlizzardClient, "characterProfessions">,
    private readonly roster: () => Promise<RosterState | undefined>,
    private readonly guildId: string,
    private readonly region: string,
    private readonly roles?: Pick<DiscordCharacterRoles, "sync" | "clear">,
    private readonly now: () => number = Date.now,
  ) { this.rolesEnabled = roles !== undefined; }

  public start(): ReturnType<typeof setInterval> {
    void this.poll();
    return setInterval(() => { void this.poll(); }, 10 * 60_000);
  }

  public async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const link of await this.store.all()) {
        if (link.guildId === this.guildId) {
          try { await this.syncOwner(link.guildId, link.discordUserId); }
          catch (error) { console.error("Could not sync character professions or roles:", error); }
        }
      }
    } catch (error) {
      console.error("Could not load character sync state:", error);
    } finally { this.polling = false; }
  }

  public syncOwner(guildId: string, userId: string, force = false): Promise<void> {
    const key = `${guildId}:${userId}`;
    const previous = this.operations.get(key) ?? Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      if (guildId !== this.guildId) throw new Error("Character sync server mismatch");
      let link = await this.store.get(guildId, userId);
      if (!link) return;
      if (link.region !== this.region) throw new Error("Character sync region mismatch");
      const roster = await this.roster();
      if (!roster) throw new Error("No confirmed guild roster for character sync");
      if (force || !link.profile || this.now() - link.profile.checkedAt >= 6 * 60 * 60_000) {
        const characters = [];
        for (const owned of link.characters) {
          const member = roster.members[owned.id];
          if (member) characters.push({
            id: member.id, name: member.name, className: member.className,
            professions: await this.blizzard.characterProfessions(member.slug, member.id),
          });
        }
        await this.store.saveProfile(guildId, userId, link.verifiedAt, { checkedAt: this.now(), characters });
        link = await this.store.get(guildId, userId);
      }
      if (link?.profile && link.rolesManaged && this.roles) {
        await this.roles.sync({
          ...link, profile: { ...link.profile, characters: link.profile.characters.filter(character => roster.members[character.id]) },
        });
      }
    });
    this.operations.set(key, work);
    void work.finally(() => {
      if (this.operations.get(key) === work) this.operations.delete(key);
    }).catch(() => {});
    return work;
  }

  public async selectMain(guildId: string, userId: string, characterId: string): Promise<void> {
    await this.syncOwner(guildId, userId, true);
    await this.store.selectMain(guildId, userId, characterId);
    await this.syncOwner(guildId, userId);
  }

  public async clearRoles(guildId: string, userId: string): Promise<boolean> {
    if (!this.roles) return true;
    try {
      const pending = this.operations.get(`${guildId}:${userId}`);
      await Promise.allSettled(pending ? [pending] : []);
      await this.roles.clear(guildId, userId);
      return true;
    }
    catch (error) { console.error("Could not remove character roles:", error); return false; }
  }

  public async findCrafters(guildId: string, profession: Profession): Promise<SyncedCrafterListing[]> {
    if (guildId !== this.guildId) return [];
    const roster = await this.roster();
    if (!roster) return [];
    const listings: SyncedCrafterListing[] = [];
    for (const link of await this.store.all()) {
      if (link.guildId !== guildId || link.region !== this.region || !link.rolesManaged || !link.profile) continue;
      for (const character of link.profile.characters) {
        if (!roster.members[character.id]) continue;
        const skill = character.professions.find(entry => entry.name === profession);
        if (skill) listings.push({
          guildId, discordUserId: link.discordUserId, characterName: character.name,
          profession, skill: skill.skill, maxSkill: skill.maxSkill,
          checkedAt: link.profile.checkedAt, ownershipCheckedAt: link.verifiedAt,
          updatedAt: new Date(link.profile.checkedAt).toISOString(),
        });
      }
    }
    return listings;
  }
}
