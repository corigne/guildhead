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
