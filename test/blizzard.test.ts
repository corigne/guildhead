import assert from "node:assert/strict";
import test from "node:test";

import {
  BlizzardClient,
  parseBlizzardRoster,
  parseBlizzardToken,
  slugifyGuildName,
} from "../src/blizzard.js";
import type { GuildRosterConfig } from "../src/config.js";

test("converts Forever guild names to API slugs", () => {
  assert.equal(
    slugifyGuildName("Pizzahut Smoking Section"),
    "pizzahut-smoking-section",
  );
});

const config: GuildRosterConfig = {
  clientId: "client",
  clientSecret: "secret",
  region: "us",
  guildName: "Pizzahut Smoking Section",
  announcementChannelId: "123",
  events: new Set(["joins", "ranks"]),
  pollMinutes: 10,
  dataDir: "/tmp",
};

test("fetches and maps a roster while reusing its OAuth token", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = input.toString();
    requests.push(url);
    if (url === "https://oauth.battle.net/token") {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    return Response.json({
      members: [
        {
          character: {
            id: 7,
            name: "Anvil",
            surname: "Stone",
            slug: "anvil",
            level: 60,
            playable_class: { id: 1 },
          },
          rank: 2,
        },
      ],
    });
  };

  try {
    const client = new BlizzardClient(config);
    assert.deepEqual(await client.guildRoster(), [
      {
        id: "7",
        name: "Anvil Stone",
        slug: "anvil",
        level: 60,
        className: "Warrior",
        rank: 2,
      },
    ]);
    await client.guildRoster();
    assert.equal(
      requests.filter((url) => url.includes("/token")).length,
      1,
    );
    assert.match(requests[1] ?? "", /profile-forever-us/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects incomplete Blizzard responses", async () => {
  const originalFetch = globalThis.fetch;
  let response = 0;
  globalThis.fetch = async () => {
    response += 1;
    return response === 1
      ? Response.json({ access_token: "token", expires_in: 3600 })
      : Response.json({ members: [{}] });
  };

  try {
    await assert.rejects(
      new BlizzardClient(config).guildRoster(),
      /must be an object/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces Battle.net token contracts", () => {
  for (const value of [null, [], "token"]) {
    assert.throws(() => parseBlizzardToken(value), /must be an object/);
  }
  for (const value of [
    {},
    { access_token: "", expires_in: 3600 },
    { access_token: "token" },
    { access_token: "token", expires_in: "3600" },
    { access_token: "token", expires_in: Number.NaN },
    { access_token: "token", expires_in: 0 },
  ]) {
    assert.throws(() => parseBlizzardToken(value), /incomplete/);
  }
  assert.deepEqual(
    parseBlizzardToken({ access_token: "token", expires_in: 3600 }),
    { accessToken: "token", expiresIn: 3600 },
  );
});

test("enforces Blizzard roster contracts", () => {
  for (const value of [null, [], "roster"]) {
    assert.throws(() => parseBlizzardRoster(value), /must be an object/);
  }
  assert.throws(() => parseBlizzardRoster({}), /no members array/);
  assert.throws(
    () => parseBlizzardRoster({ members: [null] }),
    /member must be an object/,
  );
  assert.throws(
    () => parseBlizzardRoster({ members: [{}] }),
    /character must be an object/,
  );

  const valid = {
    id: 1,
    name: "Anvil",
    slug: "anvil",
    level: 60,
  };
  assert.throws(
    () =>
      parseBlizzardRoster({
        members: [{ character: { ...valid, playable_class: null }, rank: 1 }],
      }),
    /class reference must be an object/,
  );

  const invalidCharacters: Array<[Record<string, unknown>, unknown]> = [
    [{ ...valid, id: "1" }, 1],
    [{ ...valid, id: 1.5 }, 1],
    [{ ...valid, name: 1 }, 1],
    [{ ...valid, name: "" }, 1],
    [{ ...valid, surname: 1 }, 1],
    [{ ...valid, slug: 1 }, 1],
    [{ ...valid, slug: "" }, 1],
    [{ ...valid, level: "60" }, 1],
    [{ ...valid, level: 1.5 }, 1],
    [valid, "1"],
    [valid, 1.5],
    [{ ...valid, playable_class: { id: "1" } }, 1],
    [{ ...valid, playable_class: { id: 1.5 } }, 1],
  ];
  for (const [character, rank] of invalidCharacters) {
    assert.throws(
      () => parseBlizzardRoster({ members: [{ character, rank }] }),
      /invalid member/,
    );
  }

  assert.deepEqual(
    parseBlizzardRoster({
      members: [
        { character: valid, rank: 1 },
        {
          character: {
            ...valid,
            id: 2,
            surname: "Stone",
            playable_class: { id: 99 },
          },
          rank: 2,
        },
      ],
    }).map((entry) => [entry.name, entry.className]),
    [
      ["Anvil", "Unknown class"],
      ["Anvil Stone", "Class 99"],
    ],
  );
});

test("surfaces Blizzard token and roster failures", async () => {
  const originalFetch = globalThis.fetch;
  const cases: Array<{
    guildName?: string;
    responses: Response[];
    expected: RegExp;
  }> = [
    {
      responses: [new Response("", { status: 401 })],
      expected: /token request failed with HTTP 401/,
    },
    {
      responses: [Response.json({ expires_in: 3600 })],
      expected: /token response was incomplete/,
    },
    {
      guildName: "!!!",
      responses: [],
      expected: /does not produce a valid slug/,
    },
    {
      responses: [
        Response.json({ access_token: "token", expires_in: 3600 }),
        new Response("", { status: 503 }),
      ],
      expected: /roster request failed with HTTP 503/,
    },
    {
      responses: [
        Response.json({ access_token: "token", expires_in: 3600 }),
        Response.json({}),
      ],
      expected: /no members array/,
    },
  ];

  try {
    for (const testCase of cases) {
      const responses = [...testCase.responses];
      globalThis.fetch = async () => {
        const response = responses.shift();
        assert.ok(response);
        return response;
      };
      await assert.rejects(
        new BlizzardClient({
          ...config,
          guildName: testCase.guildName ?? config.guildName,
        }).guildRoster(),
        testCase.expected,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses European locale for EU roster requests", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = input.toString();
    requests.push(url);
    return url.includes("/token")
      ? Response.json({ access_token: "token", expires_in: 3600 })
      : Response.json({ members: [] });
  };
  try {
    await new BlizzardClient({ ...config, region: "eu" }).guildRoster();
    assert.match(requests.at(-1) ?? "", /locale=en_GB/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
