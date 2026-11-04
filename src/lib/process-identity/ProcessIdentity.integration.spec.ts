/**
 * Process identity against real processes. What matters is that an identity read under one timezone equals one read under another (the
 * stamp is read in UTC whatever the caller's TZ), that equality catches a reused pid and a changed boot, that a gone process has no
 * identity, and that a process group is signalled only while its leader is still the recorded process or, once the leader is gone, while
 * it has members none of which predates the recorded leader: the group kill stops a child that a kill of the leader alone leaves running,
 * and an empty or recycled group is never signalled.
 */
import { describe, expect, test } from 'bun:test';

import { nativePlatformPorts }                          from '../../testing/NativePlatformPorts.ts';
import { recordAnswer }                                 from '../../testing/RecordedAnswers.ts';
import { asRecordedProcessAnswer, PROCESS_CALL_SHAPES } from '../../testing/RecordedProcessTable.ts';
import { testWhenNotRunningAsRoot, testWhenOnMacOs }    from '../../testing/ToolGuard.ts';
import { OUTLIVES_EVERY_WAIT_SECONDS, waitUntil }       from '../../testing/WaitUntil.ts';
import { startEpochSecondsOf }                          from './DarwinProcessIdentity.ts';
import {
  processIsGone,
  sameProcess,
  startedBefore,
  storedIdentityOf,
  type ProcessIdentity
} from './ProcessIdentity.ts';

const MILLISECONDS_PER_SECOND = 1000;

const SELECTOR_MODULE_PATH = new URL('./ProcessSupervisionFor.ts', import.meta.url).pathname;

const supervision = nativePlatformPorts().processSupervision;
const { identityOf, stopTree } = supervision;

function identityOrThrow(processId: number): ProcessIdentity {
  const identity = identityOf(processId);
  if (identity === null) throw new Error(`process ${processId} has no readable identity`);
  return identity;
}

/** Read in a child process whose own TZ is the one named, so the caller's timezone is the variable under test. */
function identityReadUnderTimezone(processId: number, timezone: string): unknown {
  const script = `import { processSupervisionFor } from ${JSON.stringify(SELECTOR_MODULE_PATH)};`
    + `console.log(JSON.stringify(processSupervisionFor(process.platform).identityOf(${processId})));`;
  const finished = Bun.spawnSync([process.execPath, '-e', script], { env: { TZ: timezone, LC_ALL: 'nl_NL.UTF-8' }, stdout: 'pipe', stderr: 'pipe' });
  return JSON.parse(finished.stdout.toString());
}

async function untilGone(processId: number): Promise<void> {
  await waitUntil(() => processIsGone(processId), `process ${processId} going`);
}

/** A group leader (a detached shell) whose `sleep` child would outlive it; answers both pids. */
async function spawnGroupWithLingeringChild(): Promise<{ leader: Bun.Subprocess<'ignore', 'pipe', 'ignore'>; childProcessId: number }> {
  const leader = Bun.spawn(['/bin/sh', '-c', `sleep ${OUTLIVES_EVERY_WAIT_SECONDS} & echo $!; wait`], {
    detached: true, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore'
  });
  const { value } = await leader.stdout.getReader().read();
  return { leader, childProcessId: Number(new TextDecoder().decode(value).trim()) };
}

describe('reading an identity', () => {
  test('a ps start stamp printed in UTC reads as its epoch seconds, and anything else as null', () => {
    expect(startEpochSecondsOf('Wed Oct 28 01:51:25 2026')).toBe(1793152285);
    expect(startEpochSecondsOf('Wed Oct  8 01:51:25 2026    ')).toBe(1791424285);
    expect(startEpochSecondsOf('woe 28 okt 01:51:25 2026')).toBeNull();
    expect(startEpochSecondsOf('')).toBeNull();
  });

  test('this process has an identity: its pid, a whole start second and a boot identity', () => {
    const identity = identityOrThrow(process.pid);
    expect(identity.processId).toBe(process.pid);
    expect(identity.startStamp).toMatch(/^\d+$/);
    expect(identity.bootIdentity).not.toBe('');
  });

  test('an identity read under one timezone and locale equals one read under another', () => {
    const ownIdentity = identityOrThrow(process.pid);
    expect(identityReadUnderTimezone(process.pid, 'Pacific/Kiritimati')).toEqual(ownIdentity);
    expect(identityReadUnderTimezone(process.pid, 'America/Los_Angeles')).toEqual(ownIdentity);
  });

  // Without TZ=UTC, ps prints the machine's local time, which read as UTC is off by the zone's offset.
  testWhenOnMacOs('a process started now reads a start between the wall clock around its spawn, whatever the machine\'s own timezone', async () => {
    const secondsBeforeTheSpawn = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
    const sleeper               = Bun.spawn(['/bin/sleep', '30']);
    const secondsAfterTheSpawn  = Math.ceil(Date.now() / MILLISECONDS_PER_SECOND);
    try {
      const { startStamp } = identityOrThrow(sleeper.pid);
      expect(Number(startStamp)).toBeGreaterThanOrEqual(secondsBeforeTheSpawn);
      expect(Number(startStamp)).toBeLessThanOrEqual(secondsAfterTheSpawn);
    } finally {
      sleeper.kill();
      await sleeper.exited;
    }
  });

  test('a process that has exited has no identity and reads as gone; a pid that addresses a group never does', async () => {
    const exited = Bun.spawn(['/bin/sh', '-c', 'exit 0']);
    await exited.exited;
    expect(identityOf(exited.pid)).toBeNull();
    expect(processIsGone(exited.pid)).toBe(true);
    expect(identityOf(0)).toBeNull();
    expect(processIsGone(0)).toBe(false);
    expect(processIsGone(-1)).toBe(false);
    expect(processIsGone(process.pid)).toBe(false);
  });
});

describe('comparing identities', () => {
  const recorded: ProcessIdentity = { processId: 4242, startStamp: '1793152285', bootIdentity: 'EXAMPLE-BOOT-A' };

  test('the same triple is the same process', () => {
    expect(sameProcess(recorded, { ...recorded })).toBe(true);
  });

  test('a reused pid, started later, is another process', () => {
    expect(sameProcess(recorded, { ...recorded, startStamp: '1793152286' })).toBe(false);
  });

  test('a stored record of the older field reads as the same process, and its stamp is the decimal text of the number', () => {
    const older = { processId: 4242, startEpochSeconds: 1793152285, bootIdentity: 'EXAMPLE-BOOT-A' };
    expect(storedIdentityOf(older)).toEqual(recorded);
    expect(storedIdentityOf(recorded)).toEqual(recorded);
    expect(sameProcess(recorded, storedIdentityOf(older) ?? { ...recorded, startStamp: '0' })).toBe(true);
  });

  test.each([
    ['no object', null],
    ['no start', { processId: 4242, bootIdentity: 'EXAMPLE-BOOT-A' }],
    ['a start that is no count', { processId: 4242, startStamp: 'yesterday', bootIdentity: 'EXAMPLE-BOOT-A' }],
    ['a start that is a fraction', { processId: 4242, startEpochSeconds: 1.5, bootIdentity: 'EXAMPLE-BOOT-A' }],
    ['no boot', { processId: 4242, startStamp: '1' }],
  ])('a stored identity with %s reads as none', (_case, stored) => {
    expect(storedIdentityOf(stored)).toBeNull();
  });

  test('stamps order as the counts they are, never as text', () => {
    expect(startedBefore('9', '10')).toBe(true);
    expect(startedBefore('10', '9')).toBe(false);
    expect(startedBefore('1793152284', '1793152285')).toBe(true);
    expect(startedBefore('1793152285', '1793152285')).toBe(false);
  });

  test('the same pid and start after a reboot is another process', () => {
    expect(sameProcess(recorded, { ...recorded, bootIdentity: 'EXAMPLE-BOOT-B' })).toBe(false);
  });

  test('another pid is another process', () => {
    expect(sameProcess(recorded, { ...recorded, processId: recorded.processId + 1 })).toBe(false);
  });
});

describe('signalling a process group', () => {
  test('killing the leader alone leaves its child running, and the group kill still reaches what is left of it', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const leaderIdentity = identityOrThrow(leader.pid);
    try {
      process.kill(leader.pid, 'SIGKILL');
      await leader.exited;
      expect(processIsGone(childProcessId)).toBe(false);
      expect(stopTree(leaderIdentity, 'force')).toEqual({ verdict: 'signalled' });
      await untilGone(childProcessId);
    } finally {
      if (!processIsGone(childProcessId)) process.kill(childProcessId, 'SIGKILL');
    }
  });

  test('a group whose leader is gone and which has no members left is not signalled', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const leaderIdentity = identityOrThrow(leader.pid);
    process.kill(-leader.pid, 'SIGKILL');
    await leader.exited;
    await untilGone(childProcessId);
    expect(stopTree(leaderIdentity, 'force')).toEqual({ verdict: 'group-gone' });
  });

  test.each([
    ['a member started before the recorded leader', (identity: ProcessIdentity) => ({ ...identity, startStamp: '99999999999999' })],
    ['the recorded leader started in another boot', (identity: ProcessIdentity) => ({ ...identity, bootIdentity: 'EXAMPLE-BOOT-OTHER' })],
  ])('a leaderless group is read as recycled and not signalled when %s', async (_case, recordOf) => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const recordedLeader = recordOf(identityOrThrow(leader.pid));
    try {
      process.kill(leader.pid, 'SIGKILL');
      await leader.exited;
      expect(stopTree(recordedLeader, 'force')).toEqual({ verdict: 'group-recycled' });
      expect(processIsGone(childProcessId)).toBe(false);
    } finally {
      process.kill(childProcessId, 'SIGKILL');
    }
  });

  test('the group kill, after the leader\'s identity is checked, stops both the leader and its child', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    expect(stopTree(identityOrThrow(leader.pid), 'force')).toEqual({ verdict: 'signalled' });
    await leader.exited;
    expect(processIsGone(leader.pid)).toBe(true);
    await untilGone(childProcessId);
  });

  test('a leader whose identity no longer matches the record is not signalled', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const currentIdentity = identityOrThrow(leader.pid);
    try {
      const reusedPidRecord = { ...currentIdentity, startStamp: '1' };
      expect(stopTree(reusedPidRecord, 'force')).toEqual({ verdict: 'identity-mismatch', currentIdentity });
      expect(processIsGone(leader.pid)).toBe(false);
      expect(processIsGone(childProcessId)).toBe(false);
    } finally {
      process.kill(-leader.pid, 'SIGKILL');
      await leader.exited;
    }
  });
});

// The answers `src/testing/RecordedProcessTable.ts` replays: one process in each stage of its life, each answer recorded under its call shape.
describe('the stages of one process', () => {
  const SLEEPER = ['/bin/sleep', String(OUTLIVES_EVERY_WAIT_SECONDS)];

  function recordOf(callShape: string, answer: unknown, processId: number): unknown {
    recordAnswer(callShape, asRecordedProcessAnswer(answer, processId));
    return answer;
  }

  test('a process born as the leader of its own group is live, is its own tree, refuses a stop of another start stamp and is gone after a forced stop', async () => {
    const born = Bun.spawn(SLEEPER, {
      detached: true, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore'
    });
    try {
      const identity = recordOf(PROCESS_CALL_SHAPES.IDENTITY_OF_A_BORN_LEADER, identityOrThrow(born.pid), born.pid) as ProcessIdentity;
      expect(recordOf(PROCESS_CALL_SHAPES.GONE_OF_A_BORN_LEADER, supervision.processIsGone(born.pid), born.pid)).toBe(false);
      expect(recordOf(PROCESS_CALL_SHAPES.SAME_PROCESS_OF_ONE_IDENTITY, supervision.sameProcess(identity, { ...identity }), born.pid)).toBe(true);
      const anotherStartStamp = { ...identity, startStamp: '1' };
      expect(recordOf(PROCESS_CALL_SHAPES.SAME_PROCESS_OF_ANOTHER_START_STAMP, supervision.sameProcess(identity, anotherStartStamp), born.pid)).toBe(false);
      const treeMembers = recordOf(PROCESS_CALL_SHAPES.TREE_OF_A_BORN_LEADER, supervision.treeMembersOf(identity), born.pid);
      expect(treeMembers).toMatchObject([{ processId: born.pid, startStamp: identity.startStamp, processGroupId: born.pid }]);
      expect(recordOf(PROCESS_CALL_SHAPES.FORCED_STOP_OF_ANOTHER_START_STAMP, stopTree(anotherStartStamp, 'force'), born.pid))
        .toEqual({ verdict: 'identity-mismatch', currentIdentity: identity });
      expect(recordOf(PROCESS_CALL_SHAPES.FORCED_STOP_OF_A_BORN_LEADER, stopTree(identity, 'force', treeMembers as never), born.pid)).toEqual({ verdict: 'signalled' });
      await born.exited;
      expect(recordOf(PROCESS_CALL_SHAPES.IDENTITY_AFTER_A_FORCED_STOP, identityOf(born.pid), born.pid)).toBeNull();
      expect(recordOf(PROCESS_CALL_SHAPES.GONE_AFTER_A_FORCED_STOP, supervision.processIsGone(born.pid), born.pid)).toBe(true);
    } finally {
      born.kill('SIGKILL');
      await born.exited;
    }
  });

  test('a process that ended by itself has no identity and is gone', async () => {
    const ended = Bun.spawn(['/bin/sh', '-c', 'exit 0'], {
      detached: true, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore'
    });
    await ended.exited;
    expect(recordOf(PROCESS_CALL_SHAPES.IDENTITY_AFTER_ITS_OWN_END, identityOf(ended.pid), ended.pid)).toBeNull();
    expect(recordOf(PROCESS_CALL_SHAPES.GONE_AFTER_ITS_OWN_END, supervision.processIsGone(ended.pid), ended.pid)).toBe(true);
  });

  // Only as no root: as root the signal would land on a system process.
  testWhenNotRunningAsRoot('a process of another user leading its own group refuses a forced stop and lives on', () => {
    const ownUserId = process.getuid?.();
    const leaderProcessId = Bun.spawnSync(['ps', '-axo', 'pid=,pgid=,uid=']).stdout.toString().split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number))
      .find(([processId = 0, processGroupId, userId]) => processId > 1 && processId === processGroupId && userId !== ownUserId)?.[0];
    if (leaderProcessId === undefined) throw new Error('ps lists no group leader of another user');
    const identity = identityOrThrow(leaderProcessId);
    const treeMembers = supervision.treeMembersOf(identity) ?? [];
    expect(recordOf(PROCESS_CALL_SHAPES.FORCED_STOP_OF_ANOTHER_USERS_LEADER, stopTree(identity, 'force', treeMembers), leaderProcessId))
      .toMatchObject({ verdict: 'refused' });
    expect(supervision.processIsGone(leaderProcessId)).toBe(false);
  });

  test('a member of the caller\'s group outlives a forced stop of its own tree', async () => {
    const member = Bun.spawn(SLEEPER, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    try {
      const identity = recordOf(PROCESS_CALL_SHAPES.IDENTITY_IN_THE_CALLERS_GROUP, identityOrThrow(member.pid), member.pid) as ProcessIdentity;
      expect(recordOf(PROCESS_CALL_SHAPES.GONE_IN_THE_CALLERS_GROUP, supervision.processIsGone(member.pid), member.pid)).toBe(false);
      const treeMembers = recordOf(PROCESS_CALL_SHAPES.TREE_IN_THE_CALLERS_GROUP, supervision.treeMembersOf(identity), member.pid);
      expect(treeMembers).toEqual([]);
      expect(recordOf(PROCESS_CALL_SHAPES.FORCED_STOP_IN_THE_CALLERS_GROUP, stopTree(identity, 'force', treeMembers as never), member.pid)).toEqual({ verdict: 'group-gone' });
      expect(recordOf(PROCESS_CALL_SHAPES.IDENTITY_AFTER_OUTLIVING_A_STOP, identityOf(member.pid), member.pid)).toEqual(identity);
      expect(recordOf(PROCESS_CALL_SHAPES.GONE_AFTER_OUTLIVING_A_STOP, supervision.processIsGone(member.pid), member.pid)).toBe(false);
    } finally {
      member.kill('SIGKILL');
      await member.exited;
    }
  });
});
