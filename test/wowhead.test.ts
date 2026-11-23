import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTopResults,
  findExactMatches,
  tooltipToText,
} from "../src/wowhead.js";

const html = `
  <script>
    WH.SearchPage.showTopResults([
      {
        "type": 3,
        "typeId": 6948,
        "lvjson": {
          "name": "Hearthstone",
          "level": 1,
          "quality": 1,
          "reqlevel": 10
        },
        "url": "\\/classic\\/item=6948\\/hearthstone"
      },
      {
        "type": 6,
        "typeId": 8690,
        "lvjson": {"name": "Hearthstone"},
        "url": "\\/classic\\/spell=8690\\/hearthstone"
      }
    ]);
  </script>
`;

test("extracts JSON search results from Wowhead markup", () => {
  const results = extractTopResults(html);
  assert.equal(results.length, 2);
});

test("keeps exact supported entities and builds absolute URLs", () => {
  const matches = findExactMatches(
    "hearthstone",
    "classic",
    extractTopResults(html),
  );

  assert.deepEqual(matches, [
    {
      kind: "item",
      name: "Hearthstone",
      level: 1,
      requiredLevel: 10,
      quality: 1,
      matches: [
        {
          flavor: "classic",
          id: 6948,
          url: "https://www.wowhead.com/classic/item=6948/hearthstone",
        },
      ],
    },
  ]);
});

test("formats Wowhead tooltip HTML as readable Discord text", () => {
  assert.equal(
    tooltipToText(
      '<table><tr><td><b>Hearthstone</b><br>Item Level 1</td></tr></table>' +
        '<span>Use: Returns you to &lt;Home&gt;.&nbsp;</span>',
    ),
    "Hearthstone\nItem Level 1\n\nUse: Returns you to <Home>.",
  );
});
