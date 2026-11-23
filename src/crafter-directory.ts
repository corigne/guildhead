import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const professions = [
  "Alchemy",
  "Blacksmithing",
  "Enchanting",
  "Engineering",
  "Leatherworking",
  "Tailoring",
  "Cooking",
] as const;

export type Profession = (typeof professions)[number];

interface LegacyCrafterListing {
  discordUserId: string;
  characterName: string;
  profession: Profession;
  notes?: string;
  updatedAt: string;
}

export interface CrafterListing extends LegacyCrafterListing {
  guildId: string;
}

interface CrafterState {
  version: 2;
  listings: CrafterListing[];
  legacyListings: LegacyCrafterListing[];
}

export class CrafterError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}$/.test(value);
}

function characterKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("en-US");
}

function parseListing(value: unknown): LegacyCrafterListing {
  assert(isRecord(value), "Crafter listing must be an object");
  assert(isDiscordId(value.discordUserId), "Invalid crafter user ID");
  assert(
    typeof value.characterName === "string" &&
      value.characterName.trim().length >= 2 && value.characterName.length <= 24,
    "Invalid crafter character name",
  );
  assert(
    professions.includes(value.profession as Profession),
    "Invalid crafting profession",
  );
  assert(
    value.notes === undefined ||
      (typeof value.notes === "string" && value.notes.length <= 120),
    "Invalid crafter notes",
  );
  assert(
    typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)),
    "Invalid crafter update time",
  );
  return value as unknown as LegacyCrafterListing;
}

export function parseCrafterState(value: unknown): CrafterState {
  assert(isRecord(value), "Stored crafter directory must be an object");
  assert(
    value.version === 1 || value.version === 2,
    "stored crafter directory has an unsupported shape",
  );
  assert(Array.isArray(value.listings), "Invalid crafter listings");
  if (value.version === 1) {
    return { version: 2, listings: [], legacyListings: value.listings.map(parseListing) };
  }
  assert(Array.isArray(value.legacyListings), "Invalid legacy crafter listings");
  const keys = new Set<string>();
  const listings = value.listings.map((raw: unknown) => {
    const listing: LegacyCrafterListing & { guildId?: unknown } = parseListing(raw);
    assert(isDiscordId(listing.guildId), "Invalid crafter server ID");
    const key = `${listing.guildId}:${listing.discordUserId}:${listing.profession}:${characterKey(listing.characterName)}`;
    assert(!keys.has(key), "Duplicate scoped crafter listing");
    keys.add(key);
    return { ...listing, guildId: listing.guildId };
  });
  return { version: 2, listings, legacyListings: value.legacyListings.map(parseListing) };
}

export class CrafterDirectory {
  private readonly path: string;
  private operation: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.path = join(dataDir, "crafters.json");
  }

  private async load(): Promise<CrafterState> {
    try {
      return parseCrafterState(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { version: 2, listings: [], legacyListings: [] };
      }
      throw new Error(`Could not load crafter directory: ${String(error)}`, {
        cause: error,
      });
    }
  }

  private async save(state: CrafterState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);
  }

  private async serialize<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.operation;
    const result = previous.then(action);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  public async register(
    listing: Omit<CrafterListing, "updatedAt">,
  ): Promise<CrafterListing> {
    return this.serialize(async () => {
      const state = await this.load();
      parseListing({ ...listing, updatedAt: new Date().toISOString() });
      assert(isDiscordId(listing.guildId), "Invalid crafter server ID");
      const saved: CrafterListing = {
        ...listing,
        characterName: listing.characterName.trim().replace(/\s+/g, " "),
        updatedAt: new Date().toISOString(),
      };
      const listings = state.listings.filter(
        (existing) =>
          !(
            existing.guildId === saved.guildId &&
            existing.discordUserId === listing.discordUserId &&
            existing.profession === listing.profession &&
            characterKey(existing.characterName) === characterKey(saved.characterName)
          ),
      );
      listings.push(saved);
      await this.save({ ...state, listings });
      return saved;
    });
  }

  public async remove(
    guildId: string,
    discordUserId: string,
    profession: Profession,
    characterName?: string,
  ): Promise<boolean> {
    return this.serialize(async () => {
      const state = await this.load();
      const targets = state.listings.filter((listing) =>
        listing.guildId === guildId &&
        listing.discordUserId === discordUserId &&
        listing.profession === profession &&
        (characterName === undefined || characterKey(listing.characterName) === characterKey(characterName)),
      );
      if (targets.length > 1) {
        throw new CrafterError("You have multiple characters for this profession. Include the character to remove.");
      }
      if (targets.length === 0) {
        return false;
      }
      const listings = state.listings.filter((listing) => listing !== targets[0]);
      await this.save({ ...state, listings });
      return true;
    });
  }

  public async find(guildId: string, profession: Profession): Promise<CrafterListing[]> {
    return this.serialize(async () => {
      const state = await this.load();
      return state.listings
        .filter((listing) => listing.guildId === guildId && listing.profession === profession)
        .sort((left, right) =>
          left.characterName.localeCompare(right.characterName),
        );
    });
  }
}
