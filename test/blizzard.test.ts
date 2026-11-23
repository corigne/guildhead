import assert from "node:assert/strict";
import test from "node:test";

import { slugifyGuildName } from "../src/blizzard.js";

test("converts Forever guild names to API slugs", () => {
  assert.equal(
    slugifyGuildName("Pizzahut Smoking Section"),
    "pizzahut-smoking-section",
  );
});
