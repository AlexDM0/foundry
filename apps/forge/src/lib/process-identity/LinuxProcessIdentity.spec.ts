/**
 * The pure reading of `/proc/<pid>/stat`: what matters is that a comm cannot shift the fields, that a zombie reads as gone so a child dead in
 * a container reads lost, that a process exiting mid-scan is no failure, and that an identity is never guessed from text that is no stat line.
 * The Linux supervision reads a zombie as gone for the tracker lock and the gate slots, and an unreadable stat leaves the signal probe to decide.
 */
import { describe, expect, test } from 'bun:test';

import {
  bootTimeEpochSecondsOfKernelStatistics,
  createLinuxProcessIdentity,
  processStatOf,
  statReadsAsGone
} from './LinuxProcessIdentity.ts';
import { createPosixProcessGroups } from './PosixProcessGroups.ts';

const BOOT_IDENTITY_PATH = '/proc/sys/kernel/random/boot_id';
const KERNEL_STATISTICS_PATH = '/proc/stat';
const KERNEL_STATISTICS_TEXT = 'cpu  10 0 20 300 0 0 0 0 0 0\nintr 12345 0 0\nctxt 67890\nbtime 1793150000\nprocesses 4242\nprocs_running 1\n';

function statLine(comm: string, state: string, processGroupId: number, startTicks: string): string {
  const fieldsFourToTwentyOne = `1 ${processGroupId} 5 0 -1 4194304 100 0 0 0 1 1 0 0 20 0 1 0`;
  return `4242 (${comm}) ${state} ${fieldsFourToTwentyOne} ${startTicks} 1024 10 18446744073709551615 0 0 0 0 0 0 0 0 0 17 3 0 0 0 0 0\n`;
}

function readerOver(filesByPath: Readonly<Record<string, string>>, entries: readonly string[] | null = []) {
  return createLinuxProcessIdentity({
    fileText:         (path) => filesByPath[path] ?? null,
    directoryEntries: () => entries,
  });
}

describe('a stat line', () => {
  test('a comm holding spaces and `)` does not shift the fields', () => {
    expect(processStatOf(statLine('tricky) R 1 (name', 'S', 777, '123456'))).toEqual({
      state: 'S', parentProcessId: 1, processGroupId: 777, startTicks: '123456'
    });
  });

  test('a comm holding a line break does not shift the fields', () => {
    expect(processStatOf(statLine('two\nlines', 'R', 7, '9'))).toEqual({
      state: 'R', parentProcessId: 1, processGroupId: 7, startTicks: '9'
    });
  });

  test('the start stays the exact digits, however large', () => {
    expect(processStatOf(statLine('sleep', 'S', 7, '123456789012345678901234'))?.startTicks).toBe('123456789012345678901234');
  });

  test.each([
    ['no comm', '4242 sleep S'],
    ['too few fields', '4242 (sleep) S 1 7'],
    ['a start that is no count', statLine('sleep', 'S', 7, 'soon')],
    ['nothing', ''],
  ])('%s is no stat line', (_case, text) => {
    expect(processStatOf(text)).toBeNull();
  });
});

describe('a dead state', () => {
  test.each(['Z', 'X', 'x'])('state %s reads as gone', (state) => {
    expect(statReadsAsGone({
      state, parentProcessId: 1, processGroupId: 7, startTicks: '1'
    })).toBe(true);
  });

  test.each(['R', 'S', 'D', 'T', 't', 'I'])('state %s does not', (state) => {
    expect(statReadsAsGone({
      state, parentProcessId: 1, processGroupId: 7, startTicks: '1'
    })).toBe(false);
  });

  test('a zombie has no identity, and is no member of its group', () => {
    const reader = readerOver({
      '/proc/4242/stat':    statLine('talos', 'Z', 4242, '500'),
      '/proc/4243/stat':    statLine('child', 'S', 4242, '501'),
      [BOOT_IDENTITY_PATH]: 'example-boot\n',
    }, ['4242', '4243']);
    expect(reader.identityOf(4242)).toBeNull();
    expect(reader.groupMembersOf(4242)).toEqual([{ processId: 4243, startStamp: '501' }]);
  });
});

describe('a process gone or not, through the Linux supervision', () => {
  function supervisionOver(filesByPath: Readonly<Record<string, string>>, probeErrorCode: string | null) {
    const probes: number[] = [];
    const supervision = createPosixProcessGroups(readerOver(filesByPath), {
      sendSignal: (target) => {
        probes.push(target);
        if (probeErrorCode !== null) throw Object.assign(new Error(probeErrorCode), { code: probeErrorCode });
      },
    });
    return { supervision, probes };
  }

  test.each(['Z', 'X', 'x'])('a process in state %s is gone, though a signal probe still reaches it', (state) => {
    const { supervision, probes } = supervisionOver({ '/proc/4242/stat': statLine('worker', state, 4242, '500') }, null);
    expect(supervision.processIsGone(4242)).toBe(true);
    expect(probes).toEqual([]);
  });

  test.each(['R', 'S', 'D'])('a process in state %s is not gone', (state) => {
    expect(supervisionOver({ '/proc/4242/stat': statLine('worker', state, 4242, '500') }, null).supervision.processIsGone(4242)).toBe(false);
  });

  test('an unreadable stat falls back to the probe: EPERM is a live process of another user, ESRCH a gone one', () => {
    expect(supervisionOver({}, 'EPERM').supervision.processIsGone(4242)).toBe(false);
    expect(supervisionOver({ '/proc/4242/stat': 'garbage' }, 'EPERM').supervision.processIsGone(4242)).toBe(false);
    expect(supervisionOver({}, 'ESRCH').supervision.processIsGone(4242)).toBe(true);
  });

  test('a non-positive id is never gone, and is never probed', () => {
    const { supervision, probes } = supervisionOver({}, 'ESRCH');
    expect(supervision.processIsGone(0)).toBe(false);
    expect(supervision.processIsGone(-1)).toBe(false);
    expect(probes).toEqual([]);
  });
});

describe('an identity', () => {
  test('it is the start ticks as text and the trimmed boot id', () => {
    const reader = readerOver({ '/proc/4242/stat': statLine('sleep', 'S', 4242, '500'), [BOOT_IDENTITY_PATH]: 'example-boot\n' });
    expect(reader.identityOf(4242)).toEqual({ processId: 4242, startStamp: '500', bootIdentity: 'example-boot' });
  });

  test('an unreadable boot id leaves no identity', () => {
    expect(readerOver({ '/proc/4242/stat': statLine('sleep', 'S', 4242, '500') }).identityOf(4242)).toBeNull();
    expect(readerOver({ '/proc/4242/stat': statLine('sleep', 'S', 4242, '500'), [BOOT_IDENTITY_PATH]: '\n' }).identityOf(4242)).toBeNull();
  });

  test('its sources name the two files it reads', () => {
    expect(readerOver({}).identitySourcesOf(4242)).toEqual(['/proc/4242/stat', BOOT_IDENTITY_PATH]);
  });
});

describe('a group listing', () => {
  test('it skips what is no process and a process gone mid-scan, and keeps only its own group', () => {
    const reader = readerOver({
      '/proc/10/stat': statLine('member', 'S', 10, '500'),
      '/proc/11/stat': statLine('other', 'S', 99, '501'),
    }, ['self', 'sys', '10', '11', '12']);
    expect(reader.groupMembersOf(10)).toEqual([{ processId: 10, startStamp: '500' }]);
  });

  test('an unreadable table or a malformed stat is no listing, never an empty group', () => {
    expect(readerOver({}, null).groupMembersOf(10)).toBeNull();
    expect(readerOver({ '/proc/10/stat': 'garbage' }, ['10']).groupMembersOf(10)).toBeNull();
  });
});

describe('the boot\'s start', () => {
  test('it is the `btime` line of /proc/stat, read through the Linux supervision', () => {
    expect(bootTimeEpochSecondsOfKernelStatistics(KERNEL_STATISTICS_TEXT)).toBe(1793150000);
    const supervision = createPosixProcessGroups(readerOver({ [KERNEL_STATISTICS_PATH]: KERNEL_STATISTICS_TEXT }), { sendSignal: () => undefined });
    expect(supervision.bootStartedAtEpochSeconds()).toBe(1793150000);
  });

  test('an unreadable /proc/stat, one without `btime`, or a `btime` that is no safe whole number answers null', () => {
    expect(readerOver({}).bootStartedAtEpochSeconds()).toBeNull();
    expect(bootTimeEpochSecondsOfKernelStatistics('cpu  10 0 20 300\nctxt 67890\n')).toBeNull();
    expect(bootTimeEpochSecondsOfKernelStatistics('btime soon\n')).toBeNull();
    expect(bootTimeEpochSecondsOfKernelStatistics('btime 99999999999999999999\n')).toBeNull();
    expect(bootTimeEpochSecondsOfKernelStatistics('xbtime 1793150000\n')).toBeNull();
  });
});
