import {
  flavorDefinitions,
  type Flavor,
} from "./config.js";

const WOWHEAD_ORIGIN = "https://www.wowhead.com";
const WOWHEAD_TOOLTIP_ORIGIN = "https://nether.wowhead.com";
const SEARCH_MARKER = "WH.SearchPage.showTopResults(";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export type EntityKind =
  | "item"
  | "quest"
  | "spell"
  | "npc"
  | "achievement";

interface SearchEntry {
  typeId?: number;
  lvjson?: {
    name?: string;
    displayName?: string;
    title?: string;
    level?: number;
    reqlevel?: number;
    quality?: number;
  };
  url?: string;
}

export interface FlavorMatch {
  flavor: Flavor;
  url: string;
  id: number;
}

export interface WowheadEntity {
  kind: EntityKind;
  name: string;
  description?: string;
  icon?: string;
  level?: number;
  requiredLevel?: number;
  quality?: number;
  matches: FlavorMatch[];
}

interface CacheEntry {
  expiresAt: number;
  entities: WowheadEntity[];
}

const cache = new Map<string, CacheEntry>();

interface TooltipResponse {
  name?: string;
  icon?: string;
  tooltip?: string;
}

function apiRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function optionalNumber(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

export function parseWowheadSearchEntries(value: unknown): SearchEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("Wowhead search results must be an array");
  }
  return value.map((rawEntry, index) => {
    const entry = apiRecord(rawEntry, `Wowhead search result ${index}`);
    const parsed: SearchEntry = {};
    const typeId = optionalNumber(
      entry.typeId,
      `Wowhead search result ${index} typeId`,
    );
    if (typeId !== undefined) {
      parsed.typeId = typeId;
    }
    const rawMetadata =
      entry.lvjson === undefined
        ? undefined
        : apiRecord(entry.lvjson, `Wowhead search result ${index} metadata`);
    if (rawMetadata) {
      const metadata: NonNullable<SearchEntry["lvjson"]> = {};
      const fields = [
        ["name", optionalString] as const,
        ["displayName", optionalString] as const,
        ["title", optionalString] as const,
        ["level", optionalNumber] as const,
        ["reqlevel", optionalNumber] as const,
        ["quality", optionalNumber] as const,
      ];
      for (const [field, parser] of fields) {
        const fieldValue = parser(
          rawMetadata[field],
          `Wowhead search result ${index} ${field}`,
        );
        if (fieldValue !== undefined) {
          Object.assign(metadata, { [field]: fieldValue });
        }
      }
      parsed.lvjson = metadata;
    }
    const url = optionalString(
      entry.url,
      `Wowhead search result ${index} URL`,
    );
    if (url !== undefined) {
      parsed.url = url;
    }
    return parsed;
  });
}

export function parseWowheadTooltip(value: unknown): TooltipResponse {
  const tooltip = apiRecord(value, "Wowhead tooltip response");
  const parsed: TooltipResponse = {};
  const name = optionalString(tooltip.name, "Wowhead tooltip name");
  const icon = optionalString(tooltip.icon, "Wowhead tooltip icon");
  const html = optionalString(tooltip.tooltip, "Wowhead tooltip HTML");
  if (name !== undefined) {
    parsed.name = name;
  }
  if (icon !== undefined) {
    parsed.icon = icon;
  }
  if (html !== undefined) {
    parsed.tooltip = html;
  }
  return parsed;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function entityName(entry: SearchEntry): string | undefined {
  return entry.lvjson?.displayName ?? entry.lvjson?.name ?? entry.lvjson?.title;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    );
}

export function tooltipToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<table\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|table|tr)>/gi, "\n")
      .replace(/<\/(?:td|th)>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(
      /\bBinds when (equipped|picked up|used)\b/gi,
      (_match, state: string) =>
        `Binds when ${state.charAt(0).toUpperCase()}${state.slice(1).toLowerCase()}`,
    )
    .replace(
      /Unique(?=(?:One-Hand|Two-Hand|Main Hand|Off Hand))/g,
      "Unique\n",
    )
    .replace(
      /(One-Hand|Two-Hand|Main Hand|Off Hand)(?=(?:Sword|Axe|Mace|Staff|Dagger|Polearm))/g,
      "$1 ",
    )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseEntityUrl(
  url: string,
): { kind: EntityKind; id: number } | undefined {
  const match = url.match(
    /\/(item|quest|spell|npc|achievement)=(\d+)(?:\/|$)/,
  );
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    kind: match[1] as EntityKind,
    id: Number.parseInt(match[2], 10),
  };
}

export function extractTopResults(html: string): SearchEntry[] {
  const markerIndex = html.indexOf(SEARCH_MARKER);
  if (markerIndex === -1) {
    return [];
  }

  const start = html.indexOf("[", markerIndex + SEARCH_MARKER.length);
  if (start === -1) {
    return [];
  }

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return parseWowheadSearchEntries(
          JSON.parse(html.slice(start, index + 1)),
        );
      }
    }
  }

  return [];
}

function absoluteUrl(path: string): string {
  return new URL(path.replaceAll("\\/", "/"), WOWHEAD_ORIGIN).toString();
}

export function findExactMatches(
  name: string,
  flavor: Flavor,
  entries: readonly SearchEntry[],
): WowheadEntity[] {
  const expectedName = normalize(name);

  for (const entry of entries) {
    const resultName = entityName(entry);
    if (!resultName || normalize(resultName) !== expectedName || !entry.url) {
      continue;
    }

    const target = parseEntityUrl(entry.url);
    if (!target) {
      continue;
    }

    return [{
      kind: target.kind,
      name: resultName,
      ...(entry.lvjson?.level !== undefined
        ? { level: entry.lvjson.level }
        : {}),
      ...(entry.lvjson?.reqlevel !== undefined
        ? { requiredLevel: entry.lvjson.reqlevel }
        : {}),
      ...(entry.lvjson?.quality !== undefined
        ? { quality: entry.lvjson.quality }
        : {}),
      matches: [
        {
          flavor,
          id: entry.typeId ?? target.id,
          url: absoluteUrl(entry.url),
        },
      ],
    }];
  }

  return [];
}

export function findTopMatch(
  flavor: Flavor,
  entries: readonly SearchEntry[],
): WowheadEntity | undefined {
  for (const entry of entries) {
    const resultName = entityName(entry);
    if (!resultName || !entry.url) {
      continue;
    }

    const target = parseEntityUrl(entry.url);
    if (!target) {
      continue;
    }

    return {
      kind: target.kind,
      name: resultName,
      ...(entry.lvjson?.level !== undefined
        ? { level: entry.lvjson.level }
        : {}),
      ...(entry.lvjson?.reqlevel !== undefined
        ? { requiredLevel: entry.lvjson.reqlevel }
        : {}),
      ...(entry.lvjson?.quality !== undefined
        ? { quality: entry.lvjson.quality }
        : {}),
      matches: [
        {
          flavor,
          id: entry.typeId ?? target.id,
          url: absoluteUrl(entry.url),
        },
      ],
    };
  }

  return undefined;
}

async function fetchSearchEntries(
  name: string,
  flavor: Flavor,
): Promise<SearchEntry[]> {
  const definition = flavorDefinitions[flavor];
  const url = new URL(`${definition.path}search`, `${WOWHEAD_ORIGIN}/`);
  url.searchParams.set("q", name);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "guildhead/1.0",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Wowhead ${definition.label} search failed with HTTP ${response.status}`,
    );
  }

  return extractTopResults(await response.text());
}

async function searchFlavor(
  name: string,
  flavor: Flavor,
): Promise<WowheadEntity[]> {
  return findExactMatches(name, flavor, await fetchSearchEntries(name, flavor));
}

function mergeEntities(entities: readonly WowheadEntity[]): WowheadEntity[] {
  const merged = new Map<string, WowheadEntity>();

  for (const entity of entities) {
    const key = `${entity.kind}:${normalize(entity.name)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.matches.push(...entity.matches);
      continue;
    }
    merged.set(key, { ...entity, matches: [...entity.matches] });
  }

  return [...merged.values()];
}

export async function enrichEntity(
  entity: WowheadEntity,
): Promise<WowheadEntity> {
  const primaryMatch = entity.matches[0];
  if (!primaryMatch) {
    return entity;
  }

  const dataEnv = flavorDefinitions[primaryMatch.flavor].dataEnv;
  const url = new URL(
    `tooltip/${entity.kind}/${primaryMatch.id}`,
    `${WOWHEAD_TOOLTIP_ORIGIN}/`,
  );
  url.searchParams.set("dataEnv", dataEnv.toString());

  const response = await fetch(url, {
    headers: {
      "User-Agent": "wow-forever-discord-bot/1.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) {
    return entity;
  }
  if (!response.ok) {
    throw new Error(
      `Wowhead ${primaryMatch.flavor} tooltip failed with HTTP ${response.status}`,
    );
  }

  const tooltip = parseWowheadTooltip(await response.json());
  const text = tooltip.tooltip ? tooltipToText(tooltip.tooltip) : "";
  const description =
    normalize(text).startsWith(normalize(entity.name))
      ? text.slice(entity.name.length).trim()
      : text;

  return {
    ...entity,
    ...(description ? { description } : {}),
    ...(tooltip.icon ? { icon: tooltip.icon } : {}),
  };
}

export async function searchReference(
  query: string,
  flavor: Flavor,
): Promise<WowheadEntity | undefined> {
  const exact = await searchFlavor(query, flavor);
  const entity =
    exact[0] ?? findTopMatch(flavor, await fetchSearchEntries(query, flavor));
  return entity ? enrichEntity(entity) : undefined;
}

export async function lookupReference(
  name: string,
  flavors: readonly Flavor[],
): Promise<WowheadEntity[]> {
  const cacheKey = `${normalize(name)}:${flavors.join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entities;
  }

  const results: WowheadEntity[] = [];
  for (const flavor of flavors) {
    results.push(...(await searchFlavor(name, flavor)));
  }

  const entities = await Promise.all(mergeEntities(results).map(enrichEntity));
  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    entities,
  });
  return entities;
}
