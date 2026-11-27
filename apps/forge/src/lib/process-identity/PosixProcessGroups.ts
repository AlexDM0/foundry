/**
 * Stops a process tree as POSIX process groups, over an injected identity reader and signal call: `ask` is SIGTERM and `force` SIGKILL, and
 * a detached child leads a group of its own, so its pid is the group's id. A descendant may lead a group too, and a signal to the leader's
 * group misses it, so the tree is the leader's group and each group below it, walked through parent ids while a parent lives.
 */
import {
  type ProcessIdentity,
  type ProcessStartStamp,
  type ProcessTreeStopOutcome,
  childEndOf,
  errorSaysNoSuchProcess,
  sameProcess,
  startedBefore
} from './ProcessIdentity.ts';
import type {
  ProcessStopOutcome,
  ProcessStopStage,
  ProcessSupervision,
  ProcessTreeMember
} from './ProcessSupervision.ts';

export interface GroupMember {
  readonly processId:  number;
  readonly startStamp: ProcessStartStamp;
}

export interface ProcessTableEntry extends ProcessTreeMember {
  readonly parentProcessId: number;
}

export interface ProcessIdentityReader {
  readonly identityOf:                (processId: number) => ProcessIdentity | null;
  /** Where the process's start and boot are read from, for a report that they could not be. */
  readonly identitySourcesOf:         (processId: number) => readonly string[];
  readonly bootIdentity:              () => string | null;
  /** The epoch second the current boot started; `null` when it cannot be read. */
  readonly bootStartedAtEpochSeconds: () => number | null;
  /** Every process in the group; `null` when the table cannot be read or a member's start is not one. */
  readonly groupMembersOf:            (processGroupId: number) => readonly GroupMember[] | null;
  /** Every process that has not died, zombies left out; `null` when the table cannot be read or a start is not one. */
  readonly processTable:              () => readonly ProcessTableEntry[] | null;
  /** Whether the table holds the process in a dead state, such as a zombie a signal probe still reaches; `null` when the table cannot tell. */
  readonly processStateSaysGone?:     (processId: number) => boolean | null;
}

export interface ProcessSignalPrimitive {
  /** A negative target addresses a group, and signal 0 only probes it; throws what `process.kill` throws. */
  readonly sendSignal: (target: number, signal: NodeJS.Signals | 0) => void;
}

const STAGE_SIGNALS: Readonly<Record<ProcessStopStage, NodeJS.Signals>> = { ask: 'SIGTERM', force: 'SIGKILL' };

const GROUP_PROBE = 0;

/** The processes of the groups and of every group a child of theirs sits in, so a shell command in a group of its own is found. */
function membersWithDescendantGroups(table: readonly ProcessTableEntry[], startGroups: ReadonlySet<number>): readonly ProcessTableEntry[] {
  const groups = new Set(startGroups);
  let members: readonly ProcessTableEntry[];
  let groupCountBefore: number;
  do {
    groupCountBefore = groups.size;
    members = table.filter((entry) => groups.has(entry.processGroupId));
    const memberIds = new Set(members.map((member) => member.processId));
    for (const entry of table) if (memberIds.has(entry.parentProcessId)) groups.add(entry.processGroupId);
  } while (groups.size > groupCountBefore);
  return members;
}

/** A group with a member of the earlier listing still in it cannot have been recycled: an id stays taken while its group has a member. */
function groupsStillHoldingAMemberOf(table: readonly ProcessTableEntry[], earlierMembers: readonly ProcessTreeMember[]): readonly number[] {
  return table
    .filter((entry) => earlierMembers.some((member) => member.processId === entry.processId
      && member.startStamp === entry.startStamp
      && member.processGroupId === entry.processGroupId))
    .map((entry) => entry.processGroupId);
}

/** `signalled` when any group took the signal: a descendant that refused it, such as a `sudo` command, does not undo the stop of the rest. */
function strongestOutcomeOf(outcomes: readonly ProcessTreeStopOutcome[], leaderOutcome: ProcessTreeStopOutcome): ProcessTreeStopOutcome {
  return outcomes.find(({ verdict }) => verdict === 'signalled') ?? outcomes.find(({ verdict }) => verdict === 'refused') ?? leaderOutcome;
}

export function createPosixProcessGroups(reader: ProcessIdentityReader, primitive: ProcessSignalPrimitive): ProcessSupervision {
  function groupHasMembers(processGroupId: number): boolean {
    try {
      primitive.sendSignal(-processGroupId, GROUP_PROBE);
      return true;
    } catch (error) {
      return !errorSaysNoSuchProcess(error);
    }
  }

  /** As `processIsGone` in `ProcessIdentity.ts`: only `ESRCH` is gone, `EPERM` a live process of another user, a non-positive id never gone. */
  function processIsGone(processId: number): boolean {
    if (!Number.isSafeInteger(processId) || processId <= 0) return false;
    const tableAnswer = reader.processStateSaysGone?.(processId) ?? null;
    if (tableAnswer !== null) return tableAnswer;
    try {
      primitive.sendSignal(processId, GROUP_PROBE);
      return false;
    } catch (error) {
      return errorSaysNoSuchProcess(error);
    }
  }

  function signalGroup(processGroupId: number, stage: ProcessStopStage): ProcessTreeStopOutcome {
    try {
      primitive.sendSignal(-processGroupId, STAGE_SIGNALS[stage]);
      return { verdict: 'signalled' };
    } catch (error) {
      if (errorSaysNoSuchProcess(error)) return { verdict: 'group-gone' };
      return { verdict: 'refused', refusal: { cause: 'group-not-signalled', processGroupId, systemError: String(error) } };
    }
  }

  /**
   * A group outlives its leader while members remain. Its id is the recorded group only when this is the recorded boot and no member
   * started before the recorded leader: a member older than the leader belongs to a group that reused the id.
   */
  function stopLeaderlessGroup(leader: ProcessIdentity, stage: ProcessStopStage): ProcessTreeStopOutcome {
    if (!groupHasMembers(leader.processId)) return { verdict: 'group-gone' };
    if (reader.bootIdentity() !== leader.bootIdentity) return { verdict: 'group-recycled' };
    const members = reader.groupMembersOf(leader.processId);
    if (members === null) return { verdict: 'refused', refusal: { cause: 'group-members-unreadable', processGroupId: leader.processId } };
    if (members.length === 0) return { verdict: 'group-gone' };
    if (members.some((member) => startedBefore(member.startStamp, leader.startStamp))) return { verdict: 'group-recycled' };
    return signalGroup(leader.processId, stage);
  }

  function stopLeaderGroup(leader: ProcessIdentity, stage: ProcessStopStage): ProcessTreeStopOutcome {
    const currentIdentity = reader.identityOf(leader.processId);
    if (currentIdentity === null) return stopLeaderlessGroup(leader, stage);
    if (!sameProcess(currentIdentity, leader)) return { verdict: 'identity-mismatch', currentIdentity };
    return signalGroup(leader.processId, stage);
  }

  function stopTree(leader: ProcessIdentity, stage: ProcessStopStage, treeMembers: readonly ProcessTreeMember[] = []): ProcessTreeStopOutcome {
    const otherGroups = new Set(treeMembers.map((member) => member.processGroupId));
    otherGroups.delete(leader.processId);
    const otherOutcomes = [...otherGroups].map((processGroupId) => signalGroup(processGroupId, stage));
    const leaderOutcome = stopLeaderGroup(leader, stage);
    return strongestOutcomeOf([...otherOutcomes, leaderOutcome], leaderOutcome);
  }

  function stopProcess(processId: number, stage: ProcessStopStage): ProcessStopOutcome {
    try {
      primitive.sendSignal(processId, STAGE_SIGNALS[stage]);
      return { verdict: 'signalled' };
    } catch (error) {
      if (errorSaysNoSuchProcess(error)) return { verdict: 'gone' };
      return { verdict: 'refused', refusal: { cause: 'process-not-signalled', processId, systemError: String(error) } };
    }
  }

  /** The same checks as a stop of the leader's group, over one table: the leader as recorded, or no member older than it once it is gone. */
  function leaderGroupIsTheRecordedOne(leader: ProcessIdentity, table: readonly ProcessTableEntry[]): boolean {
    if (reader.bootIdentity() !== leader.bootIdentity) return false;
    const leaderEntry = table.find((entry) => entry.processId === leader.processId);
    if (leaderEntry !== undefined) return leaderEntry.startStamp === leader.startStamp;
    return !table.some((entry) => entry.processGroupId === leader.processId && startedBefore(entry.startStamp, leader.startStamp));
  }

  function treeMembersOf(leader: ProcessIdentity, earlierMembers: readonly ProcessTreeMember[] = []): readonly ProcessTreeMember[] | null {
    const table = reader.processTable();
    if (table === null) return null;
    const startGroups = new Set(groupsStillHoldingAMemberOf(table, earlierMembers));
    if (leaderGroupIsTheRecordedOne(leader, table)) startGroups.add(leader.processId);
    return membersWithDescendantGroups(table, startGroups);
  }

  return Object.freeze({
    identityOf:                reader.identityOf,
    identitySourcesOf:         reader.identitySourcesOf,
    sameProcess,
    startedBefore,
    processIsGone,
    treeMembersOf,
    stopTree,
    stopProcess,
    spawnOptionsFor:           () => ({ detached: true }),
    endOf:                     childEndOf,
    fallbackStopIsForced:      false,
    stopSignals:               ['SIGTERM', 'SIGINT', 'SIGHUP'] as const,
    bootStartedAtEpochSeconds: reader.bootStartedAtEpochSeconds,
  });
}
