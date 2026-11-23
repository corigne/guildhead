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

export interface CrafterListing {
  discordUserId: string;
  characterName: string;
  profession: Profession;
  notes?: string;
  updatedAt: string;
}

interface CrafterState {
  version: 1;
  listings: CrafterListing[];
}

export class CrafterDirectory {
  private readonly path: string;
  private operation: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.path = join(dataDir, "crafters.json");
  }

  private async load(): Promise<CrafterState> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("listings" in parsed) ||
        !Array.isArray(parsed.listings)
      ) {
        throw new Error("stored crafter directory has an unsupported shape");
      }
      return parsed as CrafterState;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { version: 1, listings: [] };
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
      const saved: CrafterListing = {
        ...listing,
        updatedAt: new Date().toISOString(),
      };
      const listings = state.listings.filter(
        (existing) =>
          !(
            existing.discordUserId === listing.discordUserId &&
            existing.profession === listing.profession
          ),
      );
      listings.push(saved);
      await this.save({ version: 1, listings });
      return saved;
    });
  }

  public async remove(
    discordUserId: string,
    profession: Profession,
  ): Promise<boolean> {
    return this.serialize(async () => {
      const state = await this.load();
      const listings = state.listings.filter(
        (listing) =>
          !(
            listing.discordUserId === discordUserId &&
            listing.profession === profession
          ),
      );
      if (listings.length === state.listings.length) {
        return false;
      }
      await this.save({ version: 1, listings });
      return true;
    });
  }

  public async find(profession: Profession): Promise<CrafterListing[]> {
    return this.serialize(async () => {
      const state = await this.load();
      return state.listings
        .filter((listing) => listing.profession === profession)
        .sort((left, right) =>
          left.characterName.localeCompare(right.characterName),
        );
    });
  }
}
