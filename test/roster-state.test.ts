import assert from "node:assert/strict";
import test from "node:test";

import {
  initialRosterState,
  parseRosterState,
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

test("validates saved roster contracts while accepting old snapshots without check times", () => {
  const baseline = initialRosterState([member]);
  assert.deepEqual(parseRosterState(baseline), baseline);
  assert.deepEqual(
    parseRosterState({ ...baseline, observations: { "leave:1": 1 }, checkedAt: 1_000 }),
    { ...baseline, observations: { "leave:1": 1 }, checkedAt: 1_000 },
  );
  const invalid: unknown[] = [
    null, [], 42,
    { ...baseline, version: 2 },
    { ...baseline, members: null },
    { ...baseline, members: [] },
    { ...baseline, observations: [] },
    { ...baseline, members: { "1": null } },
    { ...baseline, members: { "2": member } },
    { ...baseline, members: { "1": { ...member, level: "32" } } },
    { ...baseline, members: { "1": { ...member, rank: 1.5 } } },
    ...["id", "name", "slug", "className"].flatMap((field) =>
      ["", 42].map((value) => ({
        ...baseline, members: { "1": { ...member, [field]: value } },
      })),
    ),
    ...["1", 1.5, 0].map((count) => ({
      ...baseline, observations: { "join:2": count },
    })),
    ...["1000", 1.5, 0, 8_640_000_000_000_001].map((checkedAt) => ({
      ...baseline, checkedAt,
    })),
  ];
  for (const state of invalid) {
    assert.throws(() => parseRosterState(state));
  }
});
