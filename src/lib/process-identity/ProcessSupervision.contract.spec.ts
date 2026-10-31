/**
 * One contract for the `ProcessSupervision` port, run over a fake process table on injected primitives and over real processes: what matters is
 * that an identity is never guessed, that a stop answers a verdict, that `force` ends a whole tree a member of which declined `ask`, and that a
 * recorded leader whose pid was reused is never stopped. The platform without an adapter refuses instead, its answers held here too.
 */
import { describe, expect, test } from 'bun:test';

import { type PortClause, type PortSubject, runPortContract }        from '../../testing/PortContract.ts';
import { childIgnoringStop, parentOfSleepingChild, sleepingProcess } from '../../testing/ProcessDoubles.ts';
import { waitUntil }                                                 from '../../testing/WaitUntil.ts';
import { createDarwinProcessIdentity }                               from './DarwinProcessIdentity.ts';
import { createPosixProcessGroups }                                  from './PosixProcessGroups.ts';
import { type ProcessIdentity, processIsGone }                       from './ProcessIdentity.ts';
import type { ProcessSupervision }                                   from './ProcessSupervision.ts';
import { processSupervisionFor }                                     from './ProcessSupervisionFor.ts';
import { createUnsupportedProcessSupervision }                       from './UnsupportedProcessSupervision.ts';

interface StartedTree {
  readonly leader:   ProcessIdentity;
  readonly memberId: number;
  readonly goneOf:   (processId: number) => boolean;
}

interface SupervisionSubject {
  readonly supervision:      ProcessSupervision;
  readonly startTree:        () => Promise<StartedTree>;
  /** A lone leader that takes no `ask`. */
  readonly startStopIgnorer: () => Promise<StartedTree>;
}

const CONTRACT_CASE_TIMEOUT_MILLISECONDS = 30_000;
const NEVER_STARTED_STAMP = 1;

function required(identity: ProcessIdentity | null): ProcessIdentity {
  if (identity === null) throw new Error('the process has no readable identity');
  return identity;
}

interface FakeProcess {
  readonly groupId:    number;
  readonly startStamp: string;
  readonly takesStop:  boolean;
}

const FAKE_BOOT = 'EXAMPLE-BOOT-A';
const FAKE_LEADER_STAMP = 'Wed Oct 28 01:51:25 2026';
const FAKE_MEMBER_STAMP = 'Wed Oct 28 01:51:26 2026';
const FAKE_PROCESS_ID_ARGUMENT_INDEX = 4;

function noSuchProcess(): Error {
  return Object.assign(new Error('example ESRCH'), { code: 'ESRCH' });
}

function fakeSubject(): SupervisionSubject {
  const table = new Map<number, FakeProcess>();
  let nextProcessId = 5000;
  const reader = createDarwinProcessIdentity({
    outputOfProgram: (argv) => {
      if (argv[0] === '/usr/sbin/sysctl') return FAKE_BOOT;
      if (argv[1] === '-A') return [...table].map(([processId, { groupId, startStamp }]) => ` ${processId} ${groupId} ${startStamp}`).join('\n');
      return table.get(Number(argv[FAKE_PROCESS_ID_ARGUMENT_INDEX]))?.startStamp ?? null;
    },
    fileExists: () => false,
    fileText:   () => null,
  });
  const members = (target: number): number[] => (target < 0
    ? [...table].filter(([, { groupId }]) => groupId === -target).map(([processId]) => processId)
    : [target].filter((processId) => table.has(processId)));
  const supervision = createPosixProcessGroups(reader, {
    sendSignal: (target, signal) => {
      const reached = members(target);
      if (reached.length === 0) throw noSuchProcess();
      if (signal === 0) return;
      for (const processId of reached) {
        if (signal === 'SIGKILL' || table.get(processId)?.takesStop === true) table.delete(processId);
      }
    },
  });
  const plant = (groupId: number, startStamp: string, takesStop: boolean): number => {
    nextProcessId += 1;
    table.set(nextProcessId, { groupId: groupId === 0 ? nextProcessId : groupId, startStamp, takesStop });
    return nextProcessId;
  };
  const goneOf = (processId: number): boolean => !table.has(processId);
  return {
    supervision,
    startTree: () => {
      const leaderId = plant(0, FAKE_LEADER_STAMP, true);
      const memberId = plant(leaderId, FAKE_MEMBER_STAMP, true);
      return Promise.resolve({ leader: required(supervision.identityOf(leaderId)), memberId, goneOf });
    },
    startStopIgnorer: () => {
      const leaderId = plant(0, FAKE_LEADER_STAMP, false);
      return Promise.resolve({ leader: required(supervision.identityOf(leaderId)), memberId: leaderId, goneOf });
    },
  };
}

function nativeSubject(): SupervisionSubject {
  const supervision = processSupervisionFor(process.platform);
  return {
    supervision,
    startTree: async () => {
      const parent = await parentOfSleepingChild();
      return { leader: required(supervision.identityOf(parent.processId)), memberId: parent.reportedProcessId, goneOf: processIsGone };
    },
    startStopIgnorer: async () => {
      const ignorer = await childIgnoringStop();
      return { leader: required(supervision.identityOf(ignorer.processId)), memberId: ignorer.processId, goneOf: processIsGone };
    },
  };
}

async function untilGone(tree: StartedTree, processId: number): Promise<void> {
  await waitUntil(() => tree.goneOf(processId), `process ${processId} going`);
}

const SUBJECTS: readonly PortSubject<SupervisionSubject>[] = [
  { name: 'the POSIX adapter on injected primitives', build: fakeSubject },
  { name: 'the native adapter on real primitives', build: nativeSubject },
];

const CLAUSES: readonly PortClause<SupervisionSubject>[] = [
  {
    claim: 'a live process reads as itself every time, and its member stamps sort after no later one',
    check: async ({ supervision, startTree }) => {
      const tree = await startTree();
      expect(supervision.sameProcess(required(supervision.identityOf(tree.leader.processId)), tree.leader)).toBe(true);
      expect(supervision.stopTree(tree.leader, 'force')).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.memberId);
    },
  },
  {
    claim: 'an impossible or gone process has no identity',
    check: async ({ supervision, startTree }) => {
      expect(supervision.identityOf(0)).toBeNull();
      expect(supervision.identityOf(-1)).toBeNull();
      const tree = await startTree();
      supervision.stopTree(tree.leader, 'force');
      await untilGone(tree, tree.leader.processId);
      await waitUntil(() => supervision.identityOf(tree.leader.processId) === null, 'the identity going');
    },
  },
  {
    claim: 'start stamps order strictly',
    check: ({ supervision }) => {
      expect(supervision.startedBefore(NEVER_STARTED_STAMP, NEVER_STARTED_STAMP + 1)).toBe(true);
      expect(supervision.startedBefore(NEVER_STARTED_STAMP + 1, NEVER_STARTED_STAMP)).toBe(false);
      expect(supervision.startedBefore(NEVER_STARTED_STAMP, NEVER_STARTED_STAMP)).toBe(false);
    },
  },
  {
    claim: 'a tree lists its leader and its member',
    check: async ({ supervision, startTree }) => {
      const tree = await startTree();
      const memberIds = supervision.treeMembersOf(tree.leader)?.map((member) => member.processId);
      expect(memberIds).toContain(tree.leader.processId);
      expect(memberIds).toContain(tree.memberId);
      supervision.stopTree(tree.leader, 'force');
      await untilGone(tree, tree.memberId);
    },
  },
  {
    claim: '`ask` ends a tree that takes it, and a stopped tree answers that it is gone',
    check: async ({ supervision, startTree }) => {
      const tree = await startTree();
      expect(supervision.stopTree(tree.leader, 'ask')).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.leader.processId);
      await untilGone(tree, tree.memberId);
      await waitUntil(() => supervision.stopTree(tree.leader, 'force').verdict === 'group-gone', 'the tree reading gone');
    },
  },
  {
    claim: '`ask` leaves a process that declines it, and `force` ends it',
    check: async ({ supervision, startStopIgnorer }) => {
      const tree = await startStopIgnorer();
      expect(supervision.stopTree(tree.leader, 'ask')).toEqual({ verdict: 'signalled' });
      expect(tree.goneOf(tree.leader.processId)).toBe(false);
      expect(supervision.stopTree(tree.leader, 'force')).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.leader.processId);
    },
  },
  {
    claim: 'a recorded leader whose pid was reused is never stopped',
    check: async ({ supervision, startTree }) => {
      const tree = await startTree();
      const reused = { ...tree.leader, startEpochSeconds: tree.leader.startEpochSeconds - 1 };
      expect(supervision.stopTree(reused, 'force')).toEqual({ verdict: 'identity-mismatch', currentIdentity: tree.leader });
      expect(tree.goneOf(tree.leader.processId)).toBe(false);
      expect(tree.goneOf(tree.memberId)).toBe(false);
      supervision.stopTree(tree.leader, 'force');
      await untilGone(tree, tree.memberId);
    },
  },
  {
    claim: 'one process stops alone, and a gone one answers so',
    check: async ({ supervision, startTree }) => {
      const tree = await startTree();
      expect(supervision.stopProcess(tree.leader.processId, 'force')).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.leader.processId);
      expect(tree.goneOf(tree.memberId)).toBe(false);
      expect(supervision.stopProcess(tree.leader.processId, 'force')).toEqual({ verdict: 'gone' });
      expect(supervision.stopTree(tree.leader, 'force')).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.memberId);
    },
  },
  {
    claim: 'every child starts detached, a child\'s end reads from its exit, and a fallback stop can ask',
    check: ({ supervision }) => {
      for (const childKind of ['supervised-child', 'watcher', 'overseer'] as const) expect(supervision.spawnOptionsFor(childKind)).toEqual({ detached: true });
      expect(supervision.endOf({ exitCode: 3, signalCode: null })).toEqual({ reason: 'exited', exitCode: 3, signal: null });
      expect(supervision.endOf({ exitCode: null, signalCode: 'SIGKILL' })).toEqual({ reason: 'signalled', exitCode: null, signal: 'SIGKILL' });
      expect(supervision.fallbackStopIsForced).toBe(false);
    },
  },
];

runPortContract('ProcessSupervision', SUBJECTS, CLAUSES, CONTRACT_CASE_TIMEOUT_MILLISECONDS);

describe('a platform with no adapter', () => {
  const unsupported = createUnsupportedProcessSupervision('example-os');
  const leader: ProcessIdentity = { processId: 4242, startEpochSeconds: 1, bootIdentity: FAKE_BOOT };
  const refusal = { verdict: 'refused', reason: 'no process supervision exists for the platform example-os' } as const;

  test('guesses nothing: no identity, no members and a refused stop', () => {
    expect(unsupported.identityOf(process.pid)).toBeNull();
    expect(unsupported.treeMembersOf(leader)).toBeNull();
    expect(unsupported.stopTree(leader, 'force')).toEqual(refusal);
    expect(unsupported.stopProcess(leader.processId, 'ask')).toEqual(refusal);
  });

  test('the selector answers win32 with that refusal and each POSIX platform with an identity', () => {
    expect(processSupervisionFor('win32').identityOf(process.pid)).toBeNull();
    expect(processSupervisionFor('win32').stopTree(leader, 'ask').verdict).toBe('refused');
    expect(processSupervisionFor(process.platform).identityOf(process.pid)?.processId).toBe(process.pid);
  });

  test('a sleeper double stands alone in its tree', async () => {
    const supervision = processSupervisionFor(process.platform);
    const sleeper = await sleepingProcess();
    expect(sleeper.reportedProcessId).toBe(sleeper.processId);
    const identity = required(supervision.identityOf(sleeper.processId));
    expect(supervision.treeMembersOf(identity)?.map((member) => member.processId)).toEqual([sleeper.processId]);
    supervision.stopTree(identity, 'force');
    await waitUntil(() => processIsGone(sleeper.processId), 'the sleeper going');
  });
});
