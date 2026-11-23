import assert from "node:assert/strict";

export const professionNames = {
  171: "Alchemy",
  164: "Blacksmithing",
  333: "Enchanting",
  202: "Engineering",
  165: "Leatherworking",
  197: "Tailoring",
  185: "Cooking",
  186: "Mining",
  182: "Herbalism",
  393: "Skinning",
  356: "Fishing",
  129: "First Aid",
} as const;

export type SyncedProfession = (typeof professionNames)[keyof typeof professionNames];
export interface ProfessionSkill {
  name: SyncedProfession;
  skill: number;
  maxSkill: number;
}
export interface SyncedCharacter {
  id: string;
  name: string;
  className: string;
  professions: ProfessionSkill[];
}
export interface CharacterProfileSnapshot {
  checkedAt: number;
  characters: SyncedCharacter[];
}

function record(value: unknown): asserts value is Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid profession object");
}

function validSkill(skill: unknown, maximum: unknown): void {
  assert(typeof skill === "number" && Number.isSafeInteger(skill) && skill >= 0, "Invalid profession skill");
  assert(typeof maximum === "number" && Number.isSafeInteger(maximum) && maximum > 0 && (skill as number) <= maximum, "Invalid profession maximum");
}

export function parseBlizzardProfessions(value: unknown, characterId: string): ProfessionSkill[] {
  record(value);
  record(value.character);
  assert(typeof value.character.id === "number" && Number.isSafeInteger(value.character.id) && value.character.id > 0 && String(value.character.id) === characterId, "Profession character ID mismatch");
  assert(Array.isArray(value.primaries) && Array.isArray(value.secondaries), "Missing profession arrays");
  const skills: ProfessionSkill[] = [];
  const seen = new Set<number>();
  for (const entry of [...value.primaries, ...value.secondaries] as unknown[]) {
    record(entry);
    record(entry.profession);
    const id = entry.profession.id;
    assert(typeof id === "number" && Number.isSafeInteger(id) && id > 0 && !seen.has(id), "Invalid or duplicate profession ID");
    seen.add(id);
    assert(Array.isArray(entry.tiers) && entry.tiers.length === 1, "Expected one Forever profession tier");
    const tier: unknown = entry.tiers[0];
    record(tier);
    validSkill(tier.skill_points, tier.max_skill_points);
    const name = professionNames[id as keyof typeof professionNames];
    if (name) skills.push({ name, skill: tier.skill_points as number, maxSkill: tier.max_skill_points as number });
  }
  return skills;
}

export function parseProfileSnapshot(value: unknown): CharacterProfileSnapshot {
  record(value);
  assert(typeof value.checkedAt === "number" && Number.isSafeInteger(value.checkedAt) && value.checkedAt > 0 && value.checkedAt <= 8_640_000_000_000_000, "Invalid profession check time");
  assert(Array.isArray(value.characters), "Missing synced characters");
  const ids = new Set<string>();
  for (const character of value.characters as unknown[]) {
    record(character);
    assert(typeof character.id === "string" && /^\d{1,20}$/.test(character.id) && !ids.has(character.id), "Invalid synced character ID");
    ids.add(character.id);
    assert(typeof character.name === "string" && character.name.trim().length > 0, "Invalid synced character name");
    assert(typeof character.className === "string" && character.className.length > 0, "Invalid synced character class");
    assert(Array.isArray(character.professions), "Missing character professions");
    const names = new Set<string>();
    for (const profession of character.professions as unknown[]) {
      record(profession);
      assert(Object.values(professionNames).includes(profession.name as SyncedProfession) && !names.has(profession.name as string), "Invalid synced profession");
      names.add(profession.name as string);
      validSkill(profession.skill, profession.maxSkill);
    }
  }
  return value as unknown as CharacterProfileSnapshot;
}
