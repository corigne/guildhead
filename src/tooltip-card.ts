import sharp from "sharp";

import type { WowheadEntity } from "./wowhead.js";

const CARD_WIDTH = 640;
const PADDING = 22;
const LINE_HEIGHT = 24;
const BODY_FONT_SIZE = 18;
const TITLE_FONT_SIZE = 24;
const TITLE_LINE_HEIGHT = 30;
const QUALITY_COLORS = [
  "#9d9d9d",
  "#ffffff",
  "#1eff00",
  "#0070dd",
  "#a335ee",
  "#ff8000",
  "#e6cc80",
] as const;
const KIND_COLORS = {
  item: "#ffd100",
  quest: "#ffd100",
  spell: "#69ccf0",
  npc: "#ff7d0a",
  achievement: "#f4c430",
} as const;

interface CardLine {
  text: string;
  color: string;
  gapBefore: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function estimatedTextWidth(value: string, fontSize: number): number {
  let ems = 0;
  for (const character of value) {
    if (character === " ") {
      ems += 0.32;
    } else if (/[ilI.,'!:;|]/.test(character)) {
      ems += 0.28;
    } else if (/[MW@#%&]/.test(character)) {
      ems += 0.9;
    } else if (/[A-Z0-9]/.test(character)) {
      ems += 0.64;
    } else {
      ems += 0.54;
    }
  }
  return ems * fontSize;
}

function wrapLine(value: string, maxWidth: number, fontSize: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimatedTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    if (estimatedTextWidth(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }

    let fragment = "";
    for (const character of word) {
      const candidateFragment = `${fragment}${character}`;
      if (
        fragment &&
        estimatedTextWidth(candidateFragment, fontSize) > maxWidth
      ) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = candidateFragment;
      }
    }
    current = fragment;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function lineColor(value: string): string {
  if (/^(Use|Equip|Chance on hit):/i.test(value) || value.startsWith("+")) {
    return "#1eff00";
  }
  if (/^Requires/i.test(value)) {
    return "#ff4040";
  }
  if (/^(Item Level|Level )/i.test(value)) {
    return "#ffd100";
  }
  return "#ffffff";
}

function cardLines(entity: WowheadEntity): CardLine[] {
  const lines: CardLine[] = [];
  const details: string[] = [];
  if (entity.level !== undefined && entity.level > 0) {
    details.push(`Level ${entity.level}`);
  }
  if (entity.requiredLevel !== undefined && entity.requiredLevel > 0) {
    details.push(`Requires level ${entity.requiredLevel}`);
  }
  if (details.length > 0) {
    lines.push({
      text: details.join(" | "),
      color: "#ffd100",
      gapBefore: 0,
    });
  }

  for (const paragraph of (entity.description ?? "").split("\n")) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      if (lines.length > 0) {
        lines[lines.length - 1]!.gapBefore += 8;
      }
      continue;
    }
    const wrapped = wrapLine(
      trimmed,
      CARD_WIDTH - PADDING * 2,
      BODY_FONT_SIZE,
    );
    for (const [index, text] of wrapped.entries()) {
      lines.push({
        text,
        color: lineColor(trimmed),
        gapBefore: index === 0 && lines.length > 0 ? 2 : 0,
      });
    }
  }

  if (lines.length === 0) {
    lines.push({
      text: `${entity.kind.charAt(0).toUpperCase()}${entity.kind.slice(1)} on Wowhead`,
      color: "#ffffff",
      gapBefore: 0,
    });
  }
  return lines;
}

async function iconDataUri(icon: string | undefined): Promise<string | undefined> {
  if (!icon || !/^[a-z0-9_]+$/i.test(icon)) {
    return undefined;
  }

  const response = await fetch(
    `https://wow.zamimg.com/images/wow/icons/large/${icon.toLowerCase()}.jpg`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) {
    throw new Error(`Wowhead icon fetch failed with HTTP ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return `data:image/jpeg;base64,${data}`;
}

export async function buildTooltipCard(
  entity: WowheadEntity,
): Promise<Buffer> {
  const primaryMatch = entity.matches[0];
  if (!primaryMatch) {
    throw new Error(`Cannot render ${entity.name} without a Wowhead match`);
  }

  const qualityColor =
    entity.kind === "item"
      ? (QUALITY_COLORS[entity.quality ?? -1] ?? KIND_COLORS.item)
      : KIND_COLORS[entity.kind];
  const lines = cardLines(entity);
  const icon = await iconDataUri(entity.icon);
  const titleX = icon ? 104 : PADDING;
  const titleLines = wrapLine(
    entity.name,
    CARD_WIDTH - titleX - PADDING,
    TITLE_FONT_SIZE,
  );
  const titleStartY = PADDING + 28;
  const titleEndY =
    titleStartY + (titleLines.length - 1) * TITLE_LINE_HEIGHT;
  const metadataY = titleEndY + 27;
  const headerBottom = Math.max(
    icon ? PADDING + 66 : 0,
    metadataY + 8,
  );
  const bodyStartY = headerBottom + 30;
  const bodyHeight = lines.reduce(
    (height, line) => height + LINE_HEIGHT + line.gapBefore,
    0,
  );
  const cardHeight = Math.max(
    150,
    bodyStartY + bodyHeight + PADDING,
  );
  let y = bodyStartY;
  const body = lines
    .map((line) => {
      y += line.gapBefore;
      const text = `<text x="${PADDING}" y="${y}" fill="${line.color}" font-size="${BODY_FONT_SIZE}">${escapeXml(line.text)}</text>`;
      y += LINE_HEIGHT;
      return text;
    })
    .join("");
  const title = titleLines
    .map(
      (line, index) =>
        `<text x="${titleX}" y="${titleStartY + index * TITLE_LINE_HEIGHT}" fill="${qualityColor}" font-size="${TITLE_FONT_SIZE}" font-weight="700">${escapeXml(line)}</text>`,
    )
    .join("");
  const iconMarkup = icon
    ? `
      <rect x="${PADDING}" y="${PADDING}" width="66" height="66" rx="7"
        fill="#05070c" stroke="${qualityColor}" stroke-width="3"/>
      <image href="${icon}" x="${PADDING + 4}" y="${PADDING + 4}"
        width="58" height="58" preserveAspectRatio="xMidYMid slice"/>`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${cardHeight}">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.45" stop-color="#060a12"/>
          <stop offset="1" stop-color="#020305"/>
        </linearGradient>
        <filter id="shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#000000" flood-opacity="0.8"/>
        </filter>
      </defs>
      <rect x="7" y="7" width="${CARD_WIDTH - 14}" height="${cardHeight - 14}"
        rx="10" fill="url(#background)" stroke="#c79b42" stroke-width="2"
        filter="url(#shadow)"/>
      <rect x="11" y="11" width="${CARD_WIDTH - 22}" height="${cardHeight - 22}"
        rx="8" fill="none" stroke="#5d4823" stroke-width="1"/>
      ${iconMarkup}
      ${title}
      <text x="${titleX}" y="${metadataY}" fill="#9ca3af"
        font-size="15">${escapeXml(`${entity.kind.toUpperCase()} ${primaryMatch.id} | WOW FOREVER`)}</text>
      ${body}
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
