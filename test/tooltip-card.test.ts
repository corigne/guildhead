import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { buildTooltipCard } from "../src/tooltip-card.js";

test("renders a WoW-style tooltip PNG", async () => {
  const image = await buildTooltipCard({
    kind: "quest",
    name: "The Lost Tools",
    description:
      "Foreman Oslow wants you to retrieve his toolbox.\n\nRequirements:\n- Oslow's Toolbox",
    level: 16,
    requiredLevel: 15,
    matches: [
      {
        flavor: "forever",
        id: 125,
        url: "https://www.wowhead.com/forever/quest=125/the-lost-tools",
      },
    ],
  });

  assert.deepEqual([...image.subarray(0, 8)], [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  assert.ok(image.length > 5_000);
});

test("expands quest cards without clipping long text", async () => {
  const image = await buildTooltipCard({
    kind: "quest",
    name: "Fire Hardened Mail",
    description:
      "Level 28\nGather the materials Furen Longbeard requires, and bring them to him in Stormwind.\nRequirements:\n- Scorched Spider Fang x 50\n- Charred Horn x 12\n- Galvanized Horn\n- Vial of Phlogiston",
    level: 28,
    requiredLevel: 20,
    matches: [
      {
        flavor: "forever",
        id: 1701,
        url: "https://www.wowhead.com/forever/quest=1701/fire-hardened-mail",
      },
    ],
  });
  const metadata = await sharp(image).metadata();

  assert.equal(metadata.width, 640);
  assert.ok((metadata.height ?? 0) >= 360);
});

test("renders item icons and wraps oversized words", async () => {
  const originalFetch = globalThis.fetch;
  const icon = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#ff0000",
    },
  }).jpeg().toBuffer();
  globalThis.fetch = async () =>
    new Response(icon, {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });

  try {
    const image = await buildTooltipCard({
      kind: "item",
      name: "Extremely Long Sword Name That Wraps",
      icon: "INV_Sword_04",
      quality: 4,
      description:
        `Use: ${"Supercalifragilisticexpialidocious".repeat(8)}\nRequires level 60\n+10 Strength`,
      matches: [
        {
          flavor: "forever",
          id: 99,
          url: "https://www.wowhead.com/forever/item=99/test",
        },
      ],
    });
    assert.equal((await sharp(image).metadata()).width, 640);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renders a fallback body and rejects missing matches", async () => {
  const image = await buildTooltipCard({
    kind: "npc",
    name: "Innkeeper",
    matches: [
      {
        flavor: "forever",
        id: 1,
        url: "https://www.wowhead.com/forever/npc=1/innkeeper",
      },
    ],
  });
  assert.ok(image.length > 1_000);

  await assert.rejects(
    buildTooltipCard({
      kind: "item",
      name: "Missing",
      icon: "not-valid!",
      matches: [],
    }),
    /without a Wowhead match/,
  );
});

test("surfaces icon download failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 503 });

  try {
    await assert.rejects(
      buildTooltipCard({
        kind: "item",
        name: "Broken Icon",
        icon: "inv_sword_04",
        matches: [
          {
            flavor: "forever",
            id: 2,
            url: "https://www.wowhead.com/forever/item=2/broken",
          },
        ],
      }),
      /icon fetch failed with HTTP 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
