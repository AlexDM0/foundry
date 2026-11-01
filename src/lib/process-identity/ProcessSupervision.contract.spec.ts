/**
 * One contract for the `ProcessSupervision` port, run over a fake process table on injected primitives and over real processes: what matters is
 * that an identity is never guessed, that a stop answers a verdict, that `force` ends a whole tree a member of which declined `ask`, and that a
 * recorded leader whose pid was reused is never stopped. The platform without an adapter refuses instead, its answers held here too.
 */
import {
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { type PortClause, type PortSubject, runPortContract } from '../../testing/PortContract.ts';
import {
  childIgnoringStop,
  parentOfDetachedChild,
  parentOfSleepingChild,
  sleepingProcess
} from '../../testing/ProcessDoubles.ts';
import { waitUntil }                                            from '../../testing/WaitUntil.ts';
import { createDarwinProcessIdentity }                          from './DarwinProcessIdentity.ts';
import { createLinuxProcessIdentity }                           from './LinuxProcessIdentity.ts';
import { createPosixProcessGroups, type ProcessIdentityReader } from './PosixProcessGroups.ts';
import { type ProcessIdentity, processIsGone }                  from './ProcessIdentity.ts';
import type { ProcessSupervision }                              from './ProcessSupervision.ts';
import { processSupervisionFor }                                from './ProcessSupervisionFor.ts';
import { createUnsupportedProcessSupervision }                  from './UnsupportedProcessSupervision.ts';

interface StartedTree {
  readonly leader:   ProcessIdentity;
  readonly memberId: number;
  readonly goneOf:   (processId: number) => boolean;
}

interface SupervisionSubject {
  readonly supervision:       ProcessSupervision;
  readonly startTree:         () => Promise<StartedTree>;
  /** A lone leader that takes no `ask`. */
  readonly startStopIgnorer:  () => Promise<StartedTree>;
  /** A leader whose child leads a group of its own, the shape probe P7 measured. */
  readonly startBranchedTree: () => Promise<StartedTree>;
}

const CONTRACT_CASE_TIMEOUT_MILLISECONDS = 30_000;
const EARLIER_STAMP = '9';
const LATER_STAMP   = '10';

function required(identity: ProcessIdentity | null): ProcessIdentity {
  if (identity === null) throw new Error('the process has no readable identity');
  return identity;
}

interface FakeProcess {
  readonly parentId:   number;
  readonly groupId:    number;
  readonly startStamp: string;
  readonly takesStop:  boolean;
}

type FakeProcessTable = Map<number, FakeProcess>;

interface FakePlatform {
  readonly readerOver:  (table: FakeProcessTable) => ProcessIdentityReader;
  readonly leaderStamp: string;
  readonly memberStamp: string;
}

const FAKE_BOOT = 'EXAMPLE-BOOT-A';
const FAKE_INIT_PROCESS_ID = 1;
const FAKE_PROCESS_ID_ARGUMENT_INDEX = 4;
const FAKE_STAT_PATTERN = /^\/proc\/(\d+)\/stat$/;
const FAKE_BOOT_IDENTITY_PATH = '/proc/sys/kernel/random/boot_id';

function noSuchProcess(): Error {
  return Object.assign(new Error('example ESRCH'), { code: 'ESRCH' });
}

const FAKE_DARWIN: FakePlatform = {
  leaderStamp: 'Wed Oct 28 01:51:25 2026',
  memberStamp: 'Wed Oct 28 01:51:26 2026',
  readerOver:  (table) => createDarwinProcessIdentity({
    outputOfProgram: (argv) => {
      if (argv[0] === '/usr/sbin/sysctl') return FAKE_BOOT;
      if (argv.includes('ppid=')) {
        return [...table].map(([processId, { parentId, groupId, startStamp }]) => ` ${processId} ${parentId} ${groupId} Ss ${startStamp}`).join('\n');
      }
      if (argv[1] === '-A') return [...table].map(([processId, { groupId, startStamp }]) => ` ${processId} ${groupId} ${startStamp}`).join('\n');
      return table.get(Number(argv[FAKE_PROCESS_ID_ARGUMENT_INDEX]))?.startStamp ?? null;
    },
  }),
};

function fakeStatTextOf(processId: number, { parentId, groupId, startStamp }: FakeProcess): string {
  return `${processId} (example ) worker) S ${parentId} ${groupId} 5 0 -1 4194304 100 0 0 0 1 1 0 0 20 0 1 0 ${startStamp} 1024 10\n`;
}

const FAKE_LINUX: FakePlatform = {
  leaderStamp: '987654',
  memberStamp: '987655',
  readerOver:  (table) => createLinuxProcessIdentity({
    fileText: (path) => {
      if (path === FAKE_BOOT_IDENTITY_PATH) return `${FAKE_BOOT}\n`;
      const processId = Number(FAKE_STAT_PATTERN.exec(path)?.[1]);
      const fakeProcess = table.get(processId);
      return fakeProcess === undefined ? null : fakeStatTextOf(processId, fakeProcess);
    },
    directoryEntries: () => ['self', ...[...table.keys()].map(String)],
  }),
};

function fakeSubject({ readerOver, leaderStamp, memberStamp }: FakePlatform): SupervisionSubject {
  const table: FakeProcessTable = new Map();
  let nextProcessId = 5000;
  const reader = readerOver(table);
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
  const plantUnder = (parentId: number, groupId: number, startStamp: string, takesStop: boolean): number => {
    nextProcessId += 1;
    table.set(nextProcessId, {
      parentId, groupId: groupId === 0 ? nextProcessId : groupId, startStamp, takesStop
    });
    return nextProcessId;
  };
  const plant = (groupId: number, startStamp: string, takesStop: boolean): number => plantUnder(FAKE_INIT_PROCESS_ID, groupId, startStamp, takesStop);
  const goneOf = (processId: number): boolean => !table.has(processId);
  return {
    supervision,
    startTree: () => {
      const leaderId = plant(0, leaderStamp, true);
      const memberId = plant(leaderId, memberStamp, true);
      return Promise.resolve({ leader: required(supervision.identityOf(leaderId)), memberId, goneOf });
    },
    startStopIgnorer: () => {
      const leaderId = plant(0, leaderStamp, false);
      return Promise.resolve({ leader: required(supervision.identityOf(leaderId)), memberId: leaderId, goneOf });
    },
    startBranchedTree: () => {
      const leaderId = plant(0, leaderStamp, true);
      const memberId = plantUnder(leaderId, 0, memberStamp, true);
      return Promise.resolve({ leader: required(supervision.identityOf(leaderId)), memberId, goneOf });
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
    startBranchedTree: async () => {
      const parent = await parentOfDetachedChild();
      return { leader: required(supervision.identityOf(parent.processId)), memberId: parent.reportedProcessId, goneOf: processIsGone };
    },
  };
}

async function untilGone(tree: StartedTree, processId: number): Promise<void> {
  await waitUntil(() => tree.goneOf(processId), `process ${processId} going`);
}

const SUBJECTS: readonly PortSubject<SupervisionSubject>[] = [
  { name: 'the macOS adapter on injected primitives', build: () => fakeSubject(FAKE_DARWIN) },
  { name: 'the Linux adapter over fake /proc text and a fake boot_id', build: () => fakeSubject(FAKE_LINUX) },
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
      expect(supervision.startedBefore(EARLIER_STAMP, LATER_STAMP)).toBe(true);
      expect(supervision.startedBefore(LATER_STAMP, EARLIER_STAMP)).toBe(false);
      expect(supervision.startedBefore(EARLIER_STAMP, EARLIER_STAMP)).toBe(false);
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
    claim: 'a child leading a group of its own is in the tree, a plain stop misses it, and a stop given the listing ends it',
    check: async ({ supervision, startBranchedTree }) => {
      const tree = await startBranchedTree();
      const members = supervision.treeMembersOf(tree.leader) ?? [];
      expect(members.map((member) => member.processId).sort()).toEqual([tree.leader.processId, tree.memberId].sort());
      expect(members.find((member) => member.processId === tree.memberId)?.processGroupId).toBe(tree.memberId);
      expect(supervision.stopTree(tree.leader, 'force')).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.leader.processId);
      expect(tree.goneOf(tree.memberId)).toBe(false);
      expect(supervision.stopTree(tree.leader, 'force', members)).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.memberId);
    },
  },
  {
    claim: 'once the leader died the walk finds nothing, and only the earlier listing still reaches the group below it',
    check: async ({ supervision, startBranchedTree }) => {
      const tree = await startBranchedTree();
      const members = supervision.treeMembersOf(tree.leader) ?? [];
      supervision.stopProcess(tree.leader.processId, 'force');
      await untilGone(tree, tree.leader.processId);
      await waitUntil(() => supervision.treeMembersOf(tree.leader)?.length === 0, 'the walk finding nothing');
      expect(supervision.treeMembersOf(tree.leader, members)?.map((member) => member.processId)).toEqual([tree.memberId]);
      expect(supervision.stopTree(tree.leader, 'force', supervision.treeMembersOf(tree.leader, members) ?? [])).toEqual({ verdict: 'signalled' });
      await untilGone(tree, tree.memberId);
      await waitUntil(() => supervision.treeMembersOf(tree.leader, members)?.length === 0, 'the listing emptying');
    },
  },
  {
    claim: 'a listed group with no listed member left is recycled, and never reached',
    check: async ({ supervision, startBranchedTree }) => {
      const tree = await startBranchedTree();
      const members = supervision.treeMembersOf(tree.leader) ?? [];
      supervision.stopProcess(tree.leader.processId, 'force');
      await untilGone(tree, tree.leader.processId);
      const recycled = members.map((member) => ({ ...member, startStamp: '1' }));
      await waitUntil(() => supervision.treeMembersOf(tree.leader, recycled)?.length === 0, 'the recycled group staying out');
      expect(supervision.stopTree(tree.leader, 'force', supervision.treeMembersOf(tree.leader, recycled) ?? [])).toEqual({ verdict: 'group-gone' });
      expect(tree.goneOf(tree.memberId)).toBe(false);
      supervision.stopProcess(tree.memberId, 'force');
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
      const reused = { ...tree.leader, startStamp: '1' };
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

describe('a stop over several groups', () => {
  const LEADER_PROCESS_ID = 10;
  const REFUSING_GROUP_ID = 6000;
  const refusingMember = { processId: REFUSING_GROUP_ID, startStamp: FAKE_LINUX.memberStamp, processGroupId: REFUSING_GROUP_ID };
  const table: FakeProcessTable = new Map([[LEADER_PROCESS_ID, {
    parentId: FAKE_INIT_PROCESS_ID, groupId: LEADER_PROCESS_ID, startStamp: FAKE_LINUX.leaderStamp, takesStop: true
  }]]);
  const supervision = createPosixProcessGroups(FAKE_LINUX.readerOver(table), {
    sendSignal: (target) => {
      if (target === -REFUSING_GROUP_ID) throw new Error('operation not permitted');
      if (!table.has(-target)) throw noSuchProcess();
    },
  });

  test('a group that refuses the signal leaves `signalled` while another took it, so a lost Watcher\'s cause stays true', () => {
    expect(supervision.stopTree(required(supervision.identityOf(LEADER_PROCESS_ID)), 'force', [refusingMember]).verdict).toBe('signalled');
  });

  test('a refusal is the answer when no group took the signal', () => {
    const goneLeader = { ...required(supervision.identityOf(LEADER_PROCESS_ID)), processId: LEADER_PROCESS_ID + 1 };
    expect(supervision.stopTree(goneLeader, 'force', [refusingMember]).verdict).toBe('refused');
  });
});

describe('a platform with no adapter', () => {
  const unsupported = createUnsupportedProcessSupervision('example-os');
  const leader: ProcessIdentity = { processId: 4242, startStamp: '1', bootIdentity: FAKE_BOOT };
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

  test('the selector answers linux with the adapter that reads /proc, and darwin with the one that runs ps', () => {
    expect(processSupervisionFor('linux').identitySourcesOf(4242)).toEqual(['/proc/4242/stat', FAKE_BOOT_IDENTITY_PATH]);
    expect(processSupervisionFor('darwin').identitySourcesOf(4242)).toEqual(['/bin/ps -o lstart= -p 4242', '/usr/sbin/sysctl -n kern.bootsessionuuid']);
    expect(processSupervisionFor('win32').identitySourcesOf(4242)).toEqual([]);
  });

  test('the linux adapter starts no subprocess, whatever it reads', () => {
    const spawnSynchronously = spyOn(Bun, 'spawnSync');
    const spawn              = spyOn(Bun, 'spawn');
    try {
      for (const supervision of [processSupervisionFor('linux'), fakeSubject(FAKE_LINUX).supervision]) {
        supervision.identityOf(process.pid);
        const treeMembers = supervision.treeMembersOf({ ...leader, processId: process.pid }) ?? [];
        supervision.stopTree({ ...leader, processId: 2 ** 22 }, 'ask', treeMembers);
      }
      expect(spawnSynchronously).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      spawnSynchronously.mockRestore();
      spawn.mockRestore();
    }
  });

  test('a macOS zombie is out of the table even with no start printed, and any other line without one fails the reading', () => {
    const readerOver = (listing: string): ProcessIdentityReader => createDarwinProcessIdentity({ outputOfProgram: () => listing });
    expect(readerOver(' 10 1 10 Z+ \n 11 1 11 Ss Wed Oct 28 01:51:25 2026').processTable()?.map(({ processId }) => processId)).toEqual([11]);
    expect(readerOver(' 11 1 11 Ss not a stamp').processTable()).toBeNull();
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
