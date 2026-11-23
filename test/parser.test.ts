import assert from "node:assert/strict";
import test from "node:test";

import { extractReferences } from "../src/parser.js";

test("extracts unique bracketed references", () => {
  assert.deepEqual(
    extractReferences(
      "Guild: check [Hearthstone], [The Lost Tools], and [hearthstone]",
    ),
    ["Hearthstone", "The Lost Tools"],
  );
});

test("caps references per message", () => {
  assert.deepEqual(extractReferences("[One] [Two] [Three] [Four]"), [
    "One",
    "Two",
    "Three",
  ]);
});

test("ignores malformed and one-character brackets", () => {
  assert.deepEqual(extractReferences("[x] [] [Valid Name] [nested [bad]]"), [
    "Valid Name",
  ]);
});
