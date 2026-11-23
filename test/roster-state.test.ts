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

test("cancels transient changes and confirms departures", () => {
  const member = {
    id: "1",
    name: "Anvil",
    slug: "anvil",
    level: 60,
    className: "Warrior",
    rank: 2,
  };
  const initial = initialRosterState([member]);
  const missingOnce = reconcileRoster(initial, []);
  assert.deepEqual(missingOnce.events, []);
  assert.equal(missingOnce.state.observations["leave:1"], 1);

  const returned = reconcileRoster(missingOnce.state, [member]);
  assert.deepEqual(returned.state.observations, {});
  const missingAgain = reconcileRoster(returned.state, []);
  const departed = reconcileRoster(missingAgain.state, []);
  assert.deepEqual(departed.events, [{ type: "leaves", member }]);
  assert.deepEqual(departed.state.members, {});
});
