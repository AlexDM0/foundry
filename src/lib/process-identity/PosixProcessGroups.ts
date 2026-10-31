/**
 * Stops a process tree as a POSIX process group, over an injected identity reader and signal call: `ask` is SIGTERM and `force` SIGKILL, and
 * a detached child leads a group of its own, so its pid is the group's id.
 */
import {
  type ProcessIdentity,
  type ProcessStartStamp,
  type ProcessTreeStopOutcome,
  childEndOf,
  errorSaysNoSuchProcess,
  processIsGone,
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

export interface ProcessIdentityReader {
  readonly identityOf:        (processId: number) => ProcessIdentity | null;
  /** Where the process's start and boot are read from, for a report that they could not be. */
  readonly identitySourcesOf: (processId: number) => readonly string[];
  readonly bootIdentity:      () => string | null;
  /** Every process in the group; `null` when the table cannot be read or a member's start is not one. */
  readonly groupMembersOf:    (processGroupId: number) => readonly GroupMember[] | null;
}

export interface ProcessSignalPrimitive {
  /** A negative target addresses a group, and signal 0 only probes it; throws what `process.kill` throws. */
  readonly sendSignal: (target: number, signal: NodeJS.Signals | 0) => void;
}

const STAGE_SIGNALS: Readonly<Record<ProcessStopStage, NodeJS.Signals>> = { ask: 'SIGTERM', force: 'SIGKILL' };

const GROUP_PROBE = 0;

export function createPosixProcessGroups(reader: ProcessIdentityReader, primitive: ProcessSignalPrimitive): ProcessSupervision {
  function groupHasMembers(processGroupId: number): boolean {
    try {
      primitive.sendSignal(-processGroupId, GROUP_PROBE);
      return true;
    } catch (error) {
      return !errorSaysNoSuchProcess(error);
    }
  }

  function signalGroup(processGroupId: number, stage: ProcessStopStage): ProcessTreeStopOutcome {
    try {
      primitive.sendSignal(-processGroupId, STAGE_SIGNALS[stage]);
      return { verdict: 'signalled' };
    } catch (error) {
      if (errorSaysNoSuchProcess(error)) return { verdict: 'group-gone' };
      return { verdict: 'refused', reason: `the process group ${processGroupId} could not be signalled: ${String(error)}` };
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
    if (members === null) return { verdict: 'refused', reason: `the members of process group ${leader.processId} could not be read` };
    if (members.length === 0) return { verdict: 'group-gone' };
    if (members.some((member) => startedBefore(member.startStamp, leader.startStamp))) return { verdict: 'group-recycled' };
    return signalGroup(leader.processId, stage);
  }

  function stopTree(leader: ProcessIdentity, stage: ProcessStopStage): ProcessTreeStopOutcome {
    const currentIdentity = reader.identityOf(leader.processId);
    if (currentIdentity === null) return stopLeaderlessGroup(leader, stage);
    if (!sameProcess(currentIdentity, leader)) return { verdict: 'identity-mismatch', currentIdentity };
    return signalGroup(leader.processId, stage);
  }

  function stopProcess(processId: number, stage: ProcessStopStage): ProcessStopOutcome {
    try {
      primitive.sendSignal(processId, STAGE_SIGNALS[stage]);
      return { verdict: 'signalled' };
    } catch (error) {
      if (errorSaysNoSuchProcess(error)) return { verdict: 'gone' };
      return { verdict: 'refused', reason: `the process ${processId} could not be signalled: ${String(error)}` };
    }
  }

  function treeMembersOf(leader: ProcessIdentity): readonly ProcessTreeMember[] | null {
    return reader.groupMembersOf(leader.processId);
  }

  return Object.freeze({
    identityOf:           reader.identityOf,
    identitySourcesOf:    reader.identitySourcesOf,
    sameProcess,
    startedBefore,
    processIsGone,
    treeMembersOf,
    stopTree,
    stopProcess,
    spawnOptionsFor:      () => ({ detached: true }),
    endOf:                childEndOf,
    fallbackStopIsForced: false,
  });
}
