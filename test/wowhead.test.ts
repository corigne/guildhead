import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTopResults,
  enrichEntity,
  findExactMatches,
  findTopMatch,
  lookupReference,
  parseWowheadSearchEntries,
  parseWowheadTooltip,
  searchReference,
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
  assert.equal(tooltipToText("Code &#65;"), "Code A");
});

test("uses the top supported result for explicit searches", () => {
  assert.deepEqual(findTopMatch("classic", extractTopResults(html)), {
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
  });
});

test("separates nested tooltip tables and binding text", () => {
  assert.equal(
    tooltipToText(
      '<table><tr><td><b>Ranger Bow</b><br>Item Level 25<br>' +
        'Binds when equipped<table><tr><td>Ranged</td><th>Bow</th></tr></table>' +
        '</td></tr></table>',
    ),
    "Ranger Bow\nItem Level 25\nBinds when Equipped\nRanged Bow",
  );
});

test("returns no entries for incomplete search markup", () => {
  assert.deepEqual(extractTopResults("<html></html>"), []);
  assert.deepEqual(
    extractTopResults(`${"WH.SearchPage.showTopResults("} no-array`),
    [],
  );
  assert.deepEqual(
    extractTopResults(`${"WH.SearchPage.showTopResults("} [`),
    [],
  );
});

test("skips malformed and unsupported search results", () => {
  assert.deepEqual(
    findExactMatches("Hearthstone", "forever", [
      {},
      { lvjson: { name: "Other" }, url: "/item=1/other" },
      { lvjson: { name: "Hearthstone" }, url: "/unsupported=1/test" },
    ]),
    [],
  );
  assert.equal(findTopMatch("forever", [{}]), undefined);
});

test("searches and enriches a top Wowhead result", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = input.toString();
    requests.push(url);
    if (url.includes("/search")) {
      return new Response(
        `WH.SearchPage.showTopResults([{"typeId":42,"lvjson":{"name":"Top Result"},"url":"/forever/item=42/top-result"}]);`,
      );
    }
    return Response.json({
      icon: "inv_sword_04",
      tooltip: "<b>Top Result</b><br>Use: Testing.",
    });
  };

  try {
    const entity = await searchReference("not exact", "forever");
    assert.equal(entity?.name, "Top Result");
    assert.equal(entity?.description, "Use: Testing.");
    assert.equal(entity?.icon, "inv_sword_04");
    assert.equal(requests.filter((url) => url.includes("/search")).length, 2);
    assert.match(requests.at(-1) ?? "", /dataEnv=16/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("merges flavor matches, caches lookups, and tolerates missing tooltips", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (input) => {
    fetchCount += 1;
    const url = input.toString();
    if (url.includes("/search")) {
      const flavor = url.includes("/classic/") ? "classic" : "forever";
      return new Response(
        `WH.SearchPage.showTopResults([{"typeId":7,"lvjson":{"name":"Cache Test"},"url":"/${flavor}/item=7/cache-test"}]);`,
      );
    }
    return new Response("", { status: 404 });
  };

  try {
    const first = await lookupReference("Cache Test", [
      "forever",
      "classic",
    ]);
    assert.equal(first.length, 1);
    assert.equal(first[0]?.matches.length, 2);
    const countAfterFirst = fetchCount;
    assert.deepEqual(
      await lookupReference("Cache Test", ["forever", "classic"]),
      first,
    );
    assert.equal(fetchCount, countAfterFirst);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces Wowhead HTTP failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 503 });

  try {
    await assert.rejects(
      searchReference("failure test", "forever"),
      /search failed with HTTP 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces Wowhead search-result contracts", () => {
  for (const value of [null, {}, "results"]) {
    assert.throws(
      () => parseWowheadSearchEntries(value),
      /must be an array/,
    );
  }
  for (const value of [[null], [[]], [["entry"]]]) {
    assert.throws(
      () => parseWowheadSearchEntries(value),
      /must be an object/,
    );
  }
  assert.throws(
    () => parseWowheadSearchEntries([{ typeId: "1" }]),
    /finite number/,
  );
  assert.throws(
    () => parseWowheadSearchEntries([{ typeId: Number.NaN }]),
    /finite number/,
  );
  assert.throws(
    () => parseWowheadSearchEntries([{ lvjson: null }]),
    /metadata must be an object/,
  );
  for (const field of ["name", "displayName", "title", "url"]) {
    const entry =
      field === "url"
        ? { url: 1 }
        : { lvjson: { [field]: 1 } };
    assert.throws(
      () => parseWowheadSearchEntries([entry]),
      /must be a string/,
    );
  }
  for (const field of ["level", "reqlevel", "quality"]) {
    assert.throws(
      () => parseWowheadSearchEntries([{ lvjson: { [field]: "1" } }]),
      /finite number/,
    );
  }

  assert.deepEqual(parseWowheadSearchEntries([{}]), [{}]);
  assert.deepEqual(
    parseWowheadSearchEntries([
      {
        typeId: 1,
        lvjson: {
          name: "Name",
          displayName: "Display",
          title: "Title",
          level: 2,
          reqlevel: 1,
          quality: 4,
        },
        url: "/item=1/test",
      },
    ]),
    [
      {
        typeId: 1,
        lvjson: {
          name: "Name",
          displayName: "Display",
          title: "Title",
          level: 2,
          reqlevel: 1,
          quality: 4,
        },
        url: "/item=1/test",
      },
    ],
  );
});

test("enforces Wowhead tooltip contracts", () => {
  for (const value of [null, [], "tooltip"]) {
    assert.throws(() => parseWowheadTooltip(value), /must be an object/);
  }
  for (const field of ["name", "icon", "tooltip"]) {
    assert.throws(
      () => parseWowheadTooltip({ [field]: 1 }),
      /must be a string/,
    );
  }
  assert.deepEqual(parseWowheadTooltip({}), {});
  assert.deepEqual(
    parseWowheadTooltip({
      name: "Sword",
      icon: "inv_sword",
      tooltip: "<b>Sword</b>",
    }),
    {
      name: "Sword",
      icon: "inv_sword",
      tooltip: "<b>Sword</b>",
    },
  );
});

test("covers unsupported top results and tooltip edge paths", async () => {
  assert.equal(
    findTopMatch("forever", [
      { lvjson: { name: "Unsupported" }, url: "/object=1/test" },
    ]),
    undefined,
  );
  assert.deepEqual(
    await enrichEntity({
      kind: "item",
      name: "No Match",
      matches: [],
    }),
    {
      kind: "item",
      name: "No Match",
      matches: [],
    },
  );

  const originalFetch = globalThis.fetch;
  let status = 500;
  globalThis.fetch = async () =>
    status === 200
      ? Response.json({})
      : new Response("", { status });
  try {
    await assert.rejects(
      enrichEntity({
        kind: "item",
        name: "Failure",
        matches: [
          {
            flavor: "forever",
            id: 1,
            url: "https://www.wowhead.com/forever/item=1/failure",
          },
        ],
      }),
      /tooltip failed with HTTP 500/,
    );
    status = 200;
    assert.deepEqual(
      await enrichEntity({
        kind: "item",
        name: "No Tooltip",
        matches: [
          {
            flavor: "forever",
            id: 2,
            url: "https://www.wowhead.com/forever/item=2/no-tooltip",
          },
        ],
      }),
      {
        kind: "item",
        name: "No Tooltip",
        matches: [
          {
            flavor: "forever",
            id: 2,
            url: "https://www.wowhead.com/forever/item=2/no-tooltip",
          },
        ],
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("supports alternate result names and URL-derived IDs", () => {
  assert.equal(
    findTopMatch("forever", [
      {
        lvjson: { displayName: "Display", level: 2 },
        url: "/item=9/display",
      },
    ])?.matches[0]?.id,
    9,
  );
  assert.equal(
    findTopMatch("forever", [
      { lvjson: { title: "Title" }, url: "/quest=10/title" },
    ])?.name,
    "Title",
  );
});

test("refreshes expired Wowhead cache entries", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000;
  let fetchCount = 0;
  Date.now = () => now;
  globalThis.fetch = async (input) => {
    fetchCount += 1;
    const url = input.toString();
    return url.includes("/search")
      ? new Response(
          'WH.SearchPage.showTopResults([{"lvjson":{"name":"Expiry Test"},"url":"/forever/item=4/expiry"}]);',
        )
      : new Response("", { status: 404 });
  };
  try {
    await lookupReference("Expiry Test", ["forever"]);
    const firstCount = fetchCount;
    now += 24 * 60 * 60 * 1000 + 1;
    await lookupReference("Expiry Test", ["forever"]);
    assert.ok(fetchCount > firstCount);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("parses brackets and escapes inside Wowhead result strings", () => {
  const results = [
    {
      lvjson: { name: 'A [quoted] "name"' },
      url: "/item=1/test",
    },
  ];
  assert.deepEqual(
    extractTopResults(
      `WH.SearchPage.showTopResults(${JSON.stringify(results)});`,
    ),
    results,
  );
});
