/**
 * Stops a process tree on Windows, which has no process groups and no graceful stage for a console-less child: `ask` sends nothing, because the
 * closed stdin was the ask, and `force` runs the absolute `taskkill` for each listed member, deepest first and the leader last, so its `/T` takes
 * what started meanwhile. No verdict rests on an error of `process.kill`: every one comes from a read of the process table.
 */
import type { ProcessIdentityPrimitives } from './DarwinProcessIdentity.ts';
import {
  type ProcessIdentity,
  type ProcessTreeStopOutcome,
  childEndOf,
  sameProcess,
  startedBefore
} from './ProcessIdentity.ts';
import type {
  ProcessStopOutcome,
  ProcessStopStage,
  ProcessSupervision,
  ProcessTreeMember
} from './ProcessSupervision.ts';
import type { WindowsKernelProcessApi, WindowsProcessRow } from './WindowsKernelProcessApi.ts';
import type { WindowsSystemTools }                         from './WindowsProcessIdentity.ts';

const TASK_KILL_FILE = 'taskkill.exe';

const NO_SYSTEM_ROOT_REASON = 'SystemRoot is not an absolute folder, so taskkill.exe cannot be run by absolute path';

type MemberStop = 'stopped' | 'gone' | 'failed';

/** `unreadable-children` names each listed child of a member whose start could not be read, so its tree is unknown. */
type TreeReading =
  | { verdict: 'read'; members: readonly ProcessTreeMember[] }
  | { verdict: 'unreadable-snapshot' }
  | { verdict: 'unreadable-children'; processIds: readonly number[] };

interface DescendantWalk {
  readonly members:            readonly ProcessTreeMember[];
  readonly unreadableChildIds: readonly number[];
}

function stopArgvOf(systemTools: WindowsSystemTools, processId: number, wholeTree: boolean): readonly string[] {
  return [systemTools.pathOf(TASK_KILL_FILE), '/PID', String(processId), ...(wholeTree ? ['/T'] : []), '/F'];
}

/** A parent id outlives its process on Windows, so a child older than the member its parent id names belongs to an earlier holder of that id. */
function descendantsWithin(rows: readonly WindowsProcessRow[], roots: readonly ProcessTreeMember[], stampOf: (processId: number) => string | null): DescendantWalk {
  const members = [...roots];
  const unreadableChildIds: number[] = [];
  const seen = new Set(roots.map((root) => root.processId));
  for (const member of members) {
    for (const row of rows) {
      if (row.parentProcessId !== member.processId || seen.has(row.processId)) continue;
      seen.add(row.processId);
      const startStamp = stampOf(row.processId);
      if (startStamp === null) unreadableChildIds.push(row.processId);
      else if (!startedBefore(startStamp, member.startStamp)) members.push({ processId: row.processId, startStamp, processGroupId: row.processId });
    }
  }
  return { members, unreadableChildIds };
}

export function createWindowsProcessTree(
  kernel: WindowsKernelProcessApi,
  identityOf: ProcessSupervision['identityOf'],
  primitives: ProcessIdentityPrimitives,
  systemTools: WindowsSystemTools | null,
): Pick<ProcessSupervision, 'treeMembersOf' | 'stopTree' | 'stopProcess' | 'endOf'> {
  function leaderIsTheRecordedOne(leader: ProcessIdentity): boolean {
    const currentIdentity = identityOf(leader.processId);
    return currentIdentity !== null && sameProcess(currentIdentity, leader);
  }

  /**
   * A child whose start reads `null` may have exited after the snapshot: only one a fresh snapshot still lists is unreadable. A start it reads
   * now does not clear it, since the walk already left it out of the members.
   */
  function childrenStillListed(processIds: readonly number[]): readonly number[] | null {
    const freshRows = kernel.processSnapshot();
    if (freshRows === null) return null;
    return processIds.filter((processId) => freshRows.some((row) => row.processId === processId));
  }

  function treeReadingOf(leader: ProcessIdentity, earlierMembers: readonly ProcessTreeMember[]): TreeReading {
    const rows = kernel.processSnapshot();
    if (rows === null) return { verdict: 'unreadable-snapshot' };
    const leaderMembers = leaderIsTheRecordedOne(leader) ? [{ processId: leader.processId, startStamp: leader.startStamp, processGroupId: leader.processId }] : [];
    const stillListed = earlierMembers.filter((member) => member.processId !== leader.processId
      && rows.some((row) => row.processId === member.processId)
      && kernel.creationTimeOf(member.processId) === member.startStamp);
    const walk = descendantsWithin(rows, [...leaderMembers, ...stillListed], kernel.creationTimeOf);
    if (walk.unreadableChildIds.length === 0) return { verdict: 'read', members: walk.members };
    const unreadableIds = childrenStillListed(walk.unreadableChildIds);
    if (unreadableIds === null) return { verdict: 'unreadable-snapshot' };
    return unreadableIds.length === 0 ? { verdict: 'read', members: walk.members } : { verdict: 'unreadable-children', processIds: unreadableIds };
  }

  function treeMembersOf(leader: ProcessIdentity, earlierMembers: readonly ProcessTreeMember[] = []): readonly ProcessTreeMember[] | null {
    const reading = treeReadingOf(leader, earlierMembers);
    return reading.verdict === 'read' ? reading.members : null;
  }

  /**
   * The identity is read again at once before the call, and a failed call is believed only while that process still runs: with `/T`, taskkill
   * fails when any descendant could not be ended, though the member itself was.
   */
  function stopMember(tools: WindowsSystemTools, member: ProcessTreeMember): MemberStop {
    if (kernel.creationTimeOf(member.processId) !== member.startStamp) return 'gone';
    if (primitives.outputOfProgram(stopArgvOf(tools, member.processId, true), tools.environment) !== null) return 'stopped';
    return kernel.creationTimeOf(member.processId) === member.startStamp ? 'failed' : 'stopped';
  }

  function forceMembers(members: readonly ProcessTreeMember[]): ProcessTreeStopOutcome {
    if (systemTools === null) return { verdict: 'refused', reason: NO_SYSTEM_ROOT_REASON };
    const tools = systemTools;
    const results = [...members].reverse().map((member) => ({ processId: member.processId, result: stopMember(tools, member) }));
    const failedIds = results.filter(({ result }) => result === 'failed').map(({ processId }) => processId);
    if (failedIds.length > 0) return { verdict: 'refused', reason: `the processes ${failedIds.join(', ')} could not be ended` };
    return results.some(({ result }) => result === 'stopped') ? { verdict: 'signalled' } : { verdict: 'group-gone' };
  }

  function emptyTreeOutcome(leader: ProcessIdentity): ProcessTreeStopOutcome {
    const currentIdentity = identityOf(leader.processId);
    return currentIdentity === null ? { verdict: 'group-gone' } : { verdict: 'identity-mismatch', currentIdentity };
  }

  function stopTree(leader: ProcessIdentity, stage: ProcessStopStage, treeMembers: readonly ProcessTreeMember[] = []): ProcessTreeStopOutcome {
    const reading = treeReadingOf(leader, treeMembers);
    if (reading.verdict === 'unreadable-snapshot') return { verdict: 'refused', reason: `the process tree of ${leader.processId} could not be read` };
    if (reading.verdict === 'unreadable-children') {
      if (stage === 'ask') return { verdict: 'no-ask-stage' };
      return { verdict: 'refused', reason: `the start of the listed processes ${reading.processIds.join(', ')} in the tree of ${leader.processId} could not be read` };
    }
    if (reading.members.length === 0) return emptyTreeOutcome(leader);
    return stage === 'ask' ? { verdict: 'no-ask-stage' } : forceMembers(reading.members);
  }

  function stopProcess(processId: number, stage: ProcessStopStage): ProcessStopOutcome {
    if (stage === 'ask') return { verdict: 'refused', reason: `the process ${processId} cannot be asked to stop from outside on Windows` };
    if (kernel.creationTimeOf(processId) === null) return { verdict: 'gone' };
    if (systemTools === null) return { verdict: 'refused', reason: NO_SYSTEM_ROOT_REASON };
    if (primitives.outputOfProgram(stopArgvOf(systemTools, processId, false), systemTools.environment) !== null) return { verdict: 'signalled' };
    return kernel.creationTimeOf(processId) === null ? { verdict: 'gone' } : { verdict: 'refused', reason: `the process ${processId} could not be ended` };
  }

  /** A kill from outside this handle reads as exit 1, so a stop that was forced says so itself. */
  const endOf: ProcessSupervision['endOf'] = (child) => (child.forcedStopRan === true ? { reason: 'signalled', exitCode: null, signal: 'SIGKILL' } : childEndOf(child));

  return Object.freeze({
    treeMembersOf, stopTree, stopProcess, endOf
  });
}
