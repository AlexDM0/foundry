/**
 * The pure reading of `/proc/<pid>/stat`: what matters is that a comm cannot shift the fields, that a zombie reads as gone so a Watcher dead in
 * a container reads lost, that a process exiting mid-scan is no failure, and that an identity is never guessed from text that is no stat line.
 */
import { describe, expect, test } from 'bun:test';

import { createLinuxProcessIdentity, processStatOf, statReadsAsGone } from './LinuxProcessIdentity.ts';

const BOOT_IDENTITY_PATH = '/proc/sys/kernel/random/boot_id';

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
      '/proc/4242/stat':    statLine('watcher', 'Z', 4242, '500'),
      '/proc/4243/stat':    statLine('child', 'S', 4242, '501'),
      [BOOT_IDENTITY_PATH]: 'example-boot\n',
    }, ['4242', '4243']);
    expect(reader.identityOf(4242)).toBeNull();
    expect(reader.groupMembersOf(4242)).toEqual([{ processId: 4243, startStamp: '501' }]);
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
