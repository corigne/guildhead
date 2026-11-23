import assert from "node:assert/strict";
import test from "node:test";

import { Collection, PermissionFlagsBits, type Client, type Role } from "discord.js";
import { DiscordCharacterRoles } from "../src/character-roles.js";
import type { CharacterLink } from "../src/character-links.js";

const link: CharacterLink = {
  guildId: "20", discordUserId: "30", region: "us", verifiedAt: 1_000,
  characters: [{ id: "1", name: "Anvil" }, { id: "2", name: "Alt" }],
  mainCharacterId: "1", rolesManaged: true,
  profile: { checkedAt: 2_000, characters: [
    { id: "1", name: "Anvil", className: "Warrior", professions: [{ name: "Blacksmithing", skill: 131, maxSkill: 150 }, { name: "Mining", skill: 148, maxSkill: 225 }] },
    { id: "2", name: "Alt", className: "Mage", professions: [
      { name: "Cooking", skill: 225, maxSkill: 225 }, { name: "Fishing", skill: 225, maxSkill: 225 },
      { name: "First Aid", skill: 225, maxSkill: 225 }, { name: "Blacksmithing", skill: 100, maxSkill: 150 },
    ] },
  ] },
};

function fixture() {
  const role = (id: string, name: string) => ({ id, name, managed: false, editable: true, permissions: { bitfield: 0n } }) as unknown as Role;
  const available = new Collection<string, Role>([["warrior", role("warrior", "Warrior")], ["mage", role("mage", "Mage")]]);
  const current = new Map([["mage", true], ["officer", true], ["healer", true]]);
  const actions: string[] = [];
  const guild = {
    roles: {
      fetch: async () => available,
      create: async (options: { name: string; permissions: unknown[] }) => {
        assert.deepEqual(options.permissions, []);
        const created = role(options.name, options.name);
        available.set(created.id, created);
        actions.push(`create:${created.name}`);
        return created;
      },
    },
    members: { fetch: async (options: { user: string; force: boolean }) => {
      assert.equal(options.user, "30");
      assert.equal(options.force, true);
      return { roles: {
        cache: current,
        add: async (id: string) => { current.set(id, true); actions.push(`add:${id}`); },
        remove: async (id: string) => { current.delete(id); actions.push(`remove:${id}`); },
      } };
    } },
  };
  const client = { guilds: { fetch: async (id: string) => { assert.equal(id, "20"); return guild; } } } as unknown as Pick<Client, "guilds">;
  return { available, current, actions, role, sync: new DiscordCharacterRoles(client, "20") };
}

test("reuses class roles, deduplicates alt professions, and changes only managed class/profession roles", async () => {
  const f = fixture();
  await f.sync.sync(link);
  assert(f.current.has("warrior") && f.current.has("Blacksmithing") && f.current.has("Mining"));
  for (const name of ["Cooking", "Fishing", "First Aid"]) {
    assert(!f.available.has(name) && !f.current.has(name));
  }
  assert(!f.current.has("mage"));
  assert(f.current.has("officer") && f.current.has("healer"));
  assert(!f.actions.includes("create:Warrior"));
  assert.equal(f.actions.filter(action => action === "add:Blacksmithing").length, 1);
  f.actions.length = 0;
  await f.sync.sync(link);
  assert.deepEqual(f.actions, []);
  f.current.set("mage", true);
  await f.sync.sync(link);
  assert.deepEqual(f.actions, ["remove:mage"]);
  f.current.set("Alchemy", true);
  f.current.set("mage", true);
  const unavailable = { ...link, profile: { ...link.profile!, characters: [
    link.profile!.characters[0]!, { ...link.profile!.characters[1]!, professions: [], professionsUnavailable: true },
  ] } };
  await f.sync.sync(unavailable);
  assert(f.current.has("Alchemy") && !f.current.has("mage"));
  await f.sync.sync(link);
  assert(!f.current.has("Alchemy"));
  const withoutMain = { ...link };
  delete withoutMain.mainCharacterId;
  await f.sync.sync(withoutMain);
  assert(!f.current.has("warrior") && f.current.has("Blacksmithing"));
  await f.sync.sync({ ...link, profile: { ...link.profile!, characters: [{ ...link.profile!.characters[0]!, className: "Unknown class" }] } });
  await f.sync.clear("20", "30");
  assert.deepEqual([...f.current.keys()].sort(), ["healer", "officer"]);
});

test("removes legacy secondary assignments even with unavailable alts while preserving role definitions and primary roles", async () => {
  const f = fixture();
  for (const name of ["Cooking", "Fishing", "First Aid", "Alchemy"]) {
    f.available.set(name, f.role(name, name));
    f.current.set(name, true);
  }
  await f.sync.sync({ ...link, profile: { ...link.profile!, characters: [
    link.profile!.characters[0]!, { ...link.profile!.characters[1]!, professions: [], professionsUnavailable: true },
  ] } });
  for (const name of ["Cooking", "Fishing", "First Aid"]) {
    assert(!f.current.has(name));
    assert(f.available.has(name), "Do not delete Discord role definitions");
    assert(f.actions.includes(`remove:${name}`));
  }
  for (const name of ["Alchemy", "Blacksmithing", "Mining", "warrior", "officer", "healer"]) assert(f.current.has(name));
});

test("refuses cross-server, ambiguous, managed, inaccessible, or privileged role mappings", async () => {
  await assert.rejects(fixture().sync.sync({ ...link, guildId: "21" }), /server mismatch/);
  await assert.rejects(fixture().sync.clear("21", "30"), /server mismatch/);
  const duplicates = fixture();
  duplicates.available.set("duplicate", duplicates.role("duplicate", "warrior"));
  await assert.rejects(duplicates.sync.sync(link), /Duplicate/);
  for (const patch of [
    { managed: true }, { editable: false }, { permissions: { bitfield: PermissionFlagsBits.Administrator } },
  ]) {
    const f = fixture();
    Object.assign(f.available.get("warrior")!, patch);
    await assert.rejects(f.sync.sync(link), /not safe/);
    assert(!f.actions.some(action => action.startsWith("add:") || action.startsWith("remove:")));
  }
  const f = fixture();
  await f.sync.clear("20", "30");
  assert(!f.actions.some(action => action.startsWith("create:")));
  assert.deepEqual([...f.current.keys()].sort(), ["healer", "officer"]);
});
