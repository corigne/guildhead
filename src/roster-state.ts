import assert from "node:assert/strict";

export interface RosterMember {
  id: string;
  name: string;
  slug: string;
  level: number;
  className: string;
  rank: number;
}

export type RosterEvent =
  | { type: "joins"; member: RosterMember }
  | { type: "leaves"; member: RosterMember }
  | {
      type: "ranks";
      member: RosterMember;
      previousRank: number;
    };

export interface RosterState {
  version: 1;
  members: Record<string, RosterMember>;
  observations: Record<string, number>;
  checkedAt?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRosterState(value: unknown): RosterState {
  assert(isRecord(value), "Stored roster state must be an object");
  assert.equal(value.version, 1, "stored roster state has an unsupported shape");
  assert(isRecord(value.members), "Invalid stored roster members");
  assert(isRecord(value.observations), "Invalid stored roster observations");
  for (const [id, member] of Object.entries(value.members)) {
    assert(isRecord(member), "Invalid stored roster member");
    for (const field of ["id", "name", "slug", "className"]) {
      assert(
        typeof member[field] === "string" && member[field].trim().length > 0,
        `Invalid stored roster member ${field}`,
      );
    }
    assert.equal(member.id, id, "Stored roster member ID does not match its key");
    assert(Number.isSafeInteger(member.level), "Invalid stored roster level");
    assert(Number.isSafeInteger(member.rank), "Invalid stored roster rank");
  }
  for (const count of Object.values(value.observations)) {
    assert(
      typeof count === "number" && Number.isSafeInteger(count) && count > 0,
      "Invalid stored roster observation count",
    );
  }
  assert(
    value.checkedAt === undefined ||
      (typeof value.checkedAt === "number" &&
        Number.isSafeInteger(value.checkedAt) &&
        value.checkedAt > 0 &&
        value.checkedAt <= 8_640_000_000_000_000),
    "Invalid stored roster check time",
  );
  return value as unknown as RosterState;
}

export function initialRosterState(
  members: readonly RosterMember[],
): RosterState {
  return {
    version: 1,
    members: Object.fromEntries(
      members.map((member) => [member.id, { ...member }]),
    ),
    observations: {},
  };
}

export function reconcileRoster(
  state: RosterState,
  currentMembers: readonly RosterMember[],
  confirmationPolls = 2,
): { state: RosterState; events: RosterEvent[] } {
  const current = new Map(
    currentMembers.map((member) => [member.id, member]),
  );
  const members: Record<string, RosterMember> = { ...state.members };
  const observations: Record<string, number> = {};
  const events: RosterEvent[] = [];

  const confirm = (key: string): boolean => {
    const count = (state.observations[key] ?? 0) + 1;
    if (count >= confirmationPolls) {
      return true;
    }
    observations[key] = count;
    return false;
  };

  for (const member of currentMembers) {
    const previous = state.members[member.id];
    if (!previous) {
      if (confirm(`join:${member.id}`)) {
        members[member.id] = { ...member };
        events.push({ type: "joins", member });
      }
      continue;
    }

    if (previous.rank !== member.rank) {
      if (confirm(`rank:${member.id}:${member.rank}`)) {
        members[member.id] = { ...member };
        events.push({
          type: "ranks",
          member,
          previousRank: previous.rank,
        });
      }
      continue;
    }

    members[member.id] = { ...member };
  }

  for (const previous of Object.values(state.members)) {
    if (current.has(previous.id)) {
      continue;
    }
    if (confirm(`leave:${previous.id}`)) {
      delete members[previous.id];
      events.push({ type: "leaves", member: previous });
    }
  }

  return {
    state: { version: 1, members, observations },
    events,
  };
}
