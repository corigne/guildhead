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
