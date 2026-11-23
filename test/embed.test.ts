import assert from "node:assert/strict";
import test from "node:test";

import { buildEmbed } from "../src/embed.js";

test("builds image and text Wowhead embeds", () => {
  const item = {
    kind: "item" as const,
    name: "Sword",
    quality: 4,
    matches: [
      {
        flavor: "forever" as const,
        id: 1,
        url: "https://www.wowhead.com/forever/item=1/sword",
      },
    ],
  };
  assert.equal(
    buildEmbed(item, "sword.png").data.image?.url,
    "attachment://sword.png",
  );

  const quest = buildEmbed({
    kind: "quest",
    name: "Long Quest",
    icon: "INV_Misc_Note_01",
    level: 20,
    requiredLevel: 15,
    description: "x".repeat(1_000),
    matches: [
      {
        flavor: "forever",
        id: 2,
        url: "https://www.wowhead.com/forever/quest=2/long-quest",
      },
      {
        flavor: "classic",
        id: 2,
        url: "https://www.wowhead.com/classic/quest=2/long-quest",
      },
    ],
  }).data;
  assert.match(quest.description ?? "", /Requires level 15/);
  assert.match(quest.description ?? "", /\.\.\.$/);
  assert.match(quest.thumbnail?.url ?? "", /inv_misc_note_01/);
});

test("uses fallback descriptions and rejects missing matches", () => {
  const embed = buildEmbed({
    kind: "achievement",
    name: "Complete",
    icon: "invalid!",
    matches: [
      {
        flavor: "retail",
        id: 3,
        url: "https://www.wowhead.com/achievement=3/complete",
      },
    ],
  }).data;
  assert.equal(embed.description, "Achievement on Wowhead");
  assert.equal(embed.thumbnail, undefined);

  assert.throws(
    () =>
      buildEmbed({
        kind: "item",
        name: "Missing",
        matches: [],
      }),
    /without a match/,
  );
});
