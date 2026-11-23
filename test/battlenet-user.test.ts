import assert from "node:assert/strict";
import test from "node:test";

import { BattleNetUserClient, parseOwnedCharacterIds } from "../src/battlenet-user.js";

const config = { clientId: "client", clientSecret: "secret", region: "us" as const };
const redirect = "https://guildhead.example.org/oauth/battlenet/callback";
const token = { access_token: "user-token", expires_in: 3600, token_type: "Bearer", scope: "wow.profile" };

test("validates Forever account ownership IDs across WoW accounts without trusting profile links", () => {
  assert.deepEqual([...parseOwnedCharacterIds({ wow_accounts: [
    { characters: [{ id: 1, character: { href: "https://untrusted.invalid" } }, { id: 2 }] },
    { characters: [{ id: 1 }] },
  ] })], ["1", "2"]);
  assert.deepEqual([...parseOwnedCharacterIds({ wow_accounts: [] })], []);
  for (const value of [
    null, [], "profile", {}, { wow_accounts: {} }, { wow_accounts: [null] },
    { wow_accounts: [{}] }, { wow_accounts: [{ characters: [null] }] },
    ...["1", 0, 1.5].map(id => ({ wow_accounts: [{ characters: [{ id }] }] })),
  ]) assert.throws(() => parseOwnedCharacterIds(value));
});

test("uses a Discord-bound state, exact redirect, and only the wow.profile permission", () => {
  const url = new URL(new BattleNetUserClient(config, redirect).authorizationUrl("private-state"));
  assert.equal(url.origin, "https://oauth.battle.net");
  assert.equal(url.searchParams.get("scope"), "wow.profile");
  assert.equal(url.searchParams.get("state"), "private-state");
  assert.equal(url.searchParams.get("redirect_uri"), redirect);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client");
  assert(!url.toString().includes("secret"));
});

test("exchanges a user code server-side and fetches ownership in the configured Forever namespace", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input.toString();
    requests.push(url);
    if (url.endsWith("/token")) {
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Authorization"), `Basic ${Buffer.from("client:secret").toString("base64")}`);
      const body = new URLSearchParams(init?.body as URLSearchParams);
      assert.equal(body.get("code"), "one-time-code");
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), redirect);
      return Response.json(token);
    }
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer user-token");
    assert.equal(new URL(url).searchParams.get("namespace"), "profile-forever-eu");
    return Response.json({ wow_accounts: [{ characters: [{ id: 1 }] }] });
  };
  try {
    assert.deepEqual([...await new BattleNetUserClient({ ...config, region: "eu" }, redirect).ownedCharacters("one-time-code")], ["1"]);
    assert(requests.every(url => !url.includes("user-token") && !url.includes("one-time-code")));
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects denied scopes, invalid tokens, HTTP failures, and malformed account profiles", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [exchange, profile] of [
      [new Response("", { status: 401 }), Response.json({})],
      [Response.json({}), Response.json({})],
      ...[
        { ...token, token_type: 1 }, { ...token, token_type: "basic" },
        { ...token, scope: [] }, { ...token, scope: "openid" },
      ].map(value => [Response.json(value), Response.json({})]),
      [Response.json(token), new Response("", { status: 404 })],
      [Response.json(token), Response.json({ wow_accounts: [{}] })],
    ]) {
      globalThis.fetch = async input => input.toString().endsWith("/token") ? exchange! : profile!;
      await assert.rejects(new BattleNetUserClient(config, redirect).ownedCharacters("code"));
    }
  } finally { globalThis.fetch = originalFetch; }
});
