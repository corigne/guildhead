import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCharacterCallback, startCharacterCallback } from "../src/character-callback.js";
import { CharacterLinkError, CharacterLinks, CharacterLinkStore } from "../src/character-links.js";
import { initialRosterState } from "../src/roster-state.js";

const uri = "https://guildhead.example.org/oauth/battlenet/callback";
const state = "a".repeat(43);

test("validates callback parameters, hides upstream details, and disables response caching and referrers", async () => {
  const calls: Array<string | null> = [];
  const server = createCharacterCallback({ callback: async (_state, code) => {
    calls.push(code);
    if (code === "domain") throw new CharacterLinkError("Login expired.");
    if (code === "html") throw new CharacterLinkError('<img src=x onerror="alert(1)"> & \'unsafe\'');
    if (code === "secret") throw new Error("sensitive upstream details");
  } }, uri);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/battlenet/callback`;
  try {
    assert.equal((await fetch(base, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${base}/other`)).status, 404);
    for (const query of [
      "", "state=short&code=ok", `state=${state}&state=${state}&code=ok`,
      `state=${state}&code=a&code=b`, `state=${state}&error=a&error=b`,
      `state=${state}&code=a&error=b`, `state=${state}`, `state=${state}&code=`,
      `state=${state}&code=${"a".repeat(2049)}`,
    ]) assert.equal((await fetch(`${base}?${query}`)).status, 400);
    assert.deepEqual(calls, []);
    const success = await fetch(`${base}?state=${state}&code=ok`);
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal(success.headers.get("referrer-policy"), "no-referrer");
    assert.equal(success.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(success.headers.get("x-content-type-options"), "nosniff");
    const page = await success.text();
    assert.match(page, /^<!doctype html>/);
    assert.match(page, /<meta name="viewport"/);
    assert.match(page, /<h1>Characters linked<\/h1>/);
    assert.match(page, /No roles were changed/);
    assert.match(page, /<code>list<\/code>/);
    assert.doesNotMatch(page, /<code>confirm<\/code>/);
    assert.match(page, /<code>unlink<\/code>/);
    const style = page.match(/<style>([\s\S]+?)<\/style>/)![1]!;
    const hash = createHash("sha256").update(style).digest("base64");
    assert.equal(success.headers.get("content-security-policy"),
      `default-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    assert.doesNotMatch(page, /<script|<iframe|<img|<link|\b(?:src|href)=/i);
    assert.equal((await fetch(`${base}?state=${state}&error=access_denied`)).status, 200);
    assert.deepEqual(calls, ["ok", null]);
    const domain = await fetch(`${base}?state=${state}&code=domain`);
    assert.equal(domain.status, 400);
    const expiredPage = await domain.text();
    assert.match(expiredPage, /<h1>Unable to continue<\/h1>/);
    assert.match(expiredPage, /Login expired\./);
    assert.doesNotMatch(expiredPage, /<ol/);
    const escaped = await fetch(`${base}?state=${state}&code=html`);
    assert.equal(escaped.status, 400);
    const escapedPage = await escaped.text();
    assert.match(escapedPage, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;unsafe&#39;/);
    assert.doesNotMatch(escapedPage, /<img/);
    const failure = await fetch(`${base}?state=${state}&code=secret`);
    assert.equal(failure.status, 400);
    assert.doesNotMatch(await failure.text(), /sensitive/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("serves a complete one-time callback, automatically saves matched characters, and reports bind failure", async () => {
  const path = await mkdtemp(join(tmpdir(), "guildhead-callback-"));
  const store = new CharacterLinkStore(path);
  const links = new CharacterLinks(store, {
    authorizationUrl: value => `https://oauth.battle.net/authorize?state=${value}`,
    ownedCharacters: async () => new Set(["1"]),
  }, async () => initialRosterState([{ id: "1", name: "Anvil", slug: "anvil", level: 20, className: "Warrior", rank: 2 }]), "us");
  const server = await startCharacterCallback(links, uri, 0);
  const port = (server.address() as AddressInfo).port;
  try {
    await assert.rejects(startCharacterCallback(links, uri, port), /EADDRINUSE/);
    const nonce = new URL(links.start("20", "30")).searchParams.get("state");
    const url = `http://127.0.0.1:${port}/oauth/battlenet/callback?state=${nonce}&code=code`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const page = await response.text();
    assert.match(page, /Characters linked/);
    assert.ok(!page.includes(nonce!));
    assert.doesNotMatch(page, /state=|code=code/);
    assert.equal((await store.get("20", "30"))?.characters[0]?.id, "1");
    assert.equal((await fetch(url)).status, 400);
    assert.equal((await store.get("20", "30"))?.characters[0]?.id, "1");
  } finally {
    server.close();
    await once(server, "close");
    await rm(path, { recursive: true });
  }
});
