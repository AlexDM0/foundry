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
import { WINDOWS_SYSTEM_ROOT, WINDOWS_TOOL_ENVIRONMENT }   from './WindowsProcessIdentity.ts';

export const WINDOWS_TREE_STOP_ROUTE = `${WINDOWS_SYSTEM_ROOT}\\System32\\taskkill.exe /PID <pid> /T /F`;

const TREE_FLAG = ' /T';
const PROCESS_ID_PLACEHOLDER = '<pid>';
const ARGUMENT_SEPARATOR = ' ';

type MemberStop = 'stopped' | 'gone' | 'failed';

function stopArgvOf(processId: number, wholeTree: boolean): readonly string[] {
  const route = wholeTree ? WINDOWS_TREE_STOP_ROUTE : WINDOWS_TREE_STOP_ROUTE.replace(TREE_FLAG, '');
  return route.replace(PROCESS_ID_PLACEHOLDER, String(processId)).split(ARGUMENT_SEPARATOR);
}

/** A parent id outlives its process on Windows, so a child older than the member its parent id names belongs to an earlier holder of that id. */
function descendantsWithin(rows: readonly WindowsProcessRow[], roots: readonly ProcessTreeMember[], stampOf: (processId: number) => string | null): readonly ProcessTreeMember[] {
  const members = [...roots];
  const seen = new Set(roots.map((root) => root.processId));
  for (const member of members) {
    for (const row of rows) {
      if (row.parentProcessId !== member.processId || seen.has(row.processId)) continue;
      const startStamp = stampOf(row.processId);
      if (startStamp === null || startedBefore(startStamp, member.startStamp)) continue;
      seen.add(row.processId);
      members.push({ processId: row.processId, startStamp, processGroupId: row.processId });
    }
  }
  return members;
}

export function createWindowsProcessTree(
  kernel: WindowsKernelProcessApi,
  identityOf: ProcessSupervision['identityOf'],
  primitives: ProcessIdentityPrimitives,
): Pick<ProcessSupervision, 'treeMembersOf' | 'stopTree' | 'stopProcess' | 'endOf'> {
  function leaderIsTheRecordedOne(leader: ProcessIdentity): boolean {
    const currentIdentity = identityOf(leader.processId);
    return currentIdentity !== null && sameProcess(currentIdentity, leader);
  }

  function treeMembersOf(leader: ProcessIdentity, earlierMembers: readonly ProcessTreeMember[] = []): readonly ProcessTreeMember[] | null {
    const rows = kernel.processSnapshot();
    if (rows === null) return null;
    const leaderMembers = leaderIsTheRecordedOne(leader) ? [{ processId: leader.processId, startStamp: leader.startStamp, processGroupId: leader.processId }] : [];
    const stillListed = earlierMembers.filter((member) => member.processId !== leader.processId
      && rows.some((row) => row.processId === member.processId)
      && kernel.creationTimeOf(member.processId) === member.startStamp);
    return descendantsWithin(rows, [...leaderMembers, ...stillListed], kernel.creationTimeOf);
  }

  /** The identity is read again at once before the call, and a failed call is believed only while that process still runs. */
  function stopMember(member: ProcessTreeMember): MemberStop {
    if (kernel.creationTimeOf(member.processId) !== member.startStamp) return 'gone';
    if (primitives.outputOfProgram(stopArgvOf(member.processId, true), WINDOWS_TOOL_ENVIRONMENT) !== null) return 'stopped';
    return kernel.creationTimeOf(member.processId) === member.startStamp ? 'failed' : 'gone';
  }

  function forceMembers(members: readonly ProcessTreeMember[]): ProcessTreeStopOutcome {
    const results = [...members].reverse().map((member) => ({ processId: member.processId, result: stopMember(member) }));
    const failedIds = results.filter(({ result }) => result === 'failed').map(({ processId }) => processId);
    if (failedIds.length > 0) return { verdict: 'refused', reason: `the processes ${failedIds.join(', ')} could not be ended` };
    return results.some(({ result }) => result === 'stopped') ? { verdict: 'signalled' } : { verdict: 'group-gone' };
  }

  function emptyTreeOutcome(leader: ProcessIdentity): ProcessTreeStopOutcome {
    const currentIdentity = identityOf(leader.processId);
    return currentIdentity === null ? { verdict: 'group-gone' } : { verdict: 'identity-mismatch', currentIdentity };
  }

  function stopTree(leader: ProcessIdentity, stage: ProcessStopStage, treeMembers: readonly ProcessTreeMember[] = []): ProcessTreeStopOutcome {
    const members = treeMembersOf(leader, treeMembers);
    if (members === null) return { verdict: 'refused', reason: `the process tree of ${leader.processId} could not be read` };
    if (members.length === 0) return emptyTreeOutcome(leader);
    return stage === 'ask' ? { verdict: 'no-ask-stage' } : forceMembers(members);
  }

  function stopProcess(processId: number, stage: ProcessStopStage): ProcessStopOutcome {
    if (stage === 'ask') return { verdict: 'refused', reason: `the process ${processId} cannot be asked to stop from outside on Windows` };
    if (kernel.creationTimeOf(processId) === null) return { verdict: 'gone' };
    if (primitives.outputOfProgram(stopArgvOf(processId, false), WINDOWS_TOOL_ENVIRONMENT) !== null) return { verdict: 'signalled' };
    return kernel.creationTimeOf(processId) === null ? { verdict: 'gone' } : { verdict: 'refused', reason: `the process ${processId} could not be ended` };
  }

  /** A kill from outside this handle reads as exit 1, so a stop that was forced says so itself. */
  const endOf: ProcessSupervision['endOf'] = (child) => (child.forcedStopRan === true ? { reason: 'signalled', exitCode: null, signal: 'SIGKILL' } : childEndOf(child));

  return Object.freeze({
    treeMembersOf, stopTree, stopProcess, endOf
  });
}
