import assert from "node:assert/strict";
import test from "node:test";

import {
  addEntity,
  buildReferenceResponse,
  buildSearchResponse,
} from "../src/response.js";

function searchHtml(name: string, id: number): string {
  return `WH.SearchPage.showTopResults([{"typeId":${id},"lvjson":{"name":"${name}"},"url":"/forever/item=${id}/test"}]);`;
}

test("builds search and automatic-reference responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input.toString();
    if (url.includes("/search")) {
      const query = new URL(url).searchParams.get("q") ?? "";
      return new Response(searchHtml(query, query === "First" ? 1 : 2));
    }
    return Response.json({
      tooltip: "<b>Test</b><br>Use: Response test.",
    });
  };

  try {
    const search = await buildSearchResponse("Search Test", "forever");
    assert.equal(search.embeds.length, 1);
    assert.equal(search.files.length, 1);

    const automatic = await buildReferenceResponse(
      ["First", "Second"],
      ["forever"],
    );
    assert.equal(automatic.embeds.length, 2);
    assert.equal(automatic.files.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects response entities without a Wowhead match", async () => {
  await assert.rejects(
    addEntity(
      { embeds: [], files: [] },
      { kind: "item", name: "Missing", matches: [] },
    ),
    /without a match/,
  );
});

test("returns an empty search response when Wowhead has no result", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html></html>");

  try {
    assert.deepEqual(await buildSearchResponse("Missing", "forever"), {
      embeds: [],
      files: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to a text embed when card rendering fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...values: unknown[]) => errors.push(values);
  globalThis.fetch = async (input) => {
    const url = input.toString();
    if (url.includes("/search")) {
      return new Response(searchHtml("Broken Card", 3));
    }
    if (url.includes("nether.wowhead.com")) {
      return Response.json({
        icon: "inv_sword_04",
        tooltip: "<b>Broken Card</b>",
      });
    }
    return new Response("", { status: 503 });
  };

  try {
    const response = await buildSearchResponse("Broken Card", "forever");
    assert.equal(response.embeds.length, 1);
    assert.equal(response.files.length, 0);
    assert.equal(errors.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("caps automatic responses at Discord's ten-embed limit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input.toString();
    if (url.includes("/search")) {
      const query = new URL(url).searchParams.get("q") ?? "";
      return new Response(searchHtml(query, Number(query.slice(4))));
    }
    return Response.json({ tooltip: "<b>Reference</b>" });
  };

  try {
    const response = await buildReferenceResponse(
      Array.from({ length: 11 }, (_, index) => `Item${index + 1}`),
      ["forever"],
    );
    assert.equal(response.embeds.length, 10);
    assert.equal(response.files.length, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
