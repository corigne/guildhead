import assert from "node:assert/strict";
import test from "node:test";

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
