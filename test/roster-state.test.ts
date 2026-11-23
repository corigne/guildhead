import assert from "node:assert/strict";
import test from "node:test";

import {
  initialRosterState,
  reconcileRoster,
  type RosterMember,
} from "../src/roster-state.js";

const member: RosterMember = {
  id: "1",
  name: "Pepper Oni",
  slug: "pepper-oni",
  level: 32,
  className: "Mage",
  rank: 3,
};

test("requires two roster observations before announcing a join", () => {
  const baseline = initialRosterState([]);
  const first = reconcileRoster(baseline, [member]);
  assert.deepEqual(first.events, []);

  const second = reconcileRoster(first.state, [member]);
  assert.deepEqual(second.events, [{ type: "joins", member }]);
  assert.deepEqual(second.state.members[member.id], member);
});

test("confirms rank changes without losing member metadata", () => {
  const baseline = initialRosterState([member]);
  const promoted = { ...member, level: 33, rank: 2 };
  const first = reconcileRoster(baseline, [promoted]);
  const second = reconcileRoster(first.state, [promoted]);

  assert.deepEqual(second.events, [
    {
      type: "ranks",
      member: promoted,
      previousRank: 3,
    },
  ]);
  assert.deepEqual(second.state.members[member.id], promoted);
});
