/**
 * One contract for the `FileReplace` port, run on fake primitives and on real files: a replace leaves only the new bytes, a remove removes, and an
 * exclusive create never replaces, with a failing hard link too. A file something else holds is retried on Windows alone and is a verdict everywhere.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { type PortClause, runPortContract }                                       from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory }                         from '../../testing/ScratchWorkspace.ts';
import { testWhenNotRunningAsRoot }                                               from '../../testing/ToolGuard.ts';
import type { FileReplace }                                                       from './FileReplace.ts';
import { REAL_FILE_REPLACE_PRIMITIVES, fileReplaceFor, fileReplaceOfThisProcess } from './FileReplaceFor.ts';
import { createPosixFileReplace }                                                 from './PosixFileReplace.ts';
import { HELD_FILE_RETRY_TRIES, createWindowsFileReplace }                        from './WindowsFileReplace.ts';


let scratch = '';

beforeEach(() => {
  scratch = createScratchDirectory('file-replace');
});

afterEach(() => {
  removeScratchDirectory(scratch);
});

const CLAUSES: readonly PortClause<FileReplace>[] = [
  {
    claim: 'replaces the target in one move, leaving no temporary file',
    check: (fileReplace) => {
      const temporaryPath = join(scratch, 'target.tmp');
      const targetPath    = join(scratch, 'target');
      writeFileSync(targetPath, 'old');
      writeFileSync(temporaryPath, 'new');
      fileReplace.replaceFile(temporaryPath, targetPath);
      expect(readFileSync(targetPath, 'utf8')).toBe('new');
      expect(existsSync(temporaryPath)).toBe(false);
    },
  },
  {
    claim: 'removes a held file',
    check: (fileReplace) => {
      const path = join(scratch, 'held');
      writeFileSync(path, 'held');
      fileReplace.removeHeldFile(path);
      expect(existsSync(path)).toBe(false);
    },
  },
  {
    claim: 'creates a target that is absent, and answers already-exists rather than replace one that is there',
    check: (fileReplace) => {
      const temporaryPath = join(scratch, 'target.tmp');
      const targetPath    = join(scratch, 'target');
      writeFileSync(temporaryPath, 'first');
      expect(fileReplace.createExclusively(temporaryPath, targetPath, 'first')).toBe('created');
      unlinkSync(temporaryPath);
      writeFileSync(temporaryPath, 'second');
      expect(fileReplace.createExclusively(temporaryPath, targetPath, 'second')).toBe('already-exists');
      expect(readFileSync(targetPath, 'utf8')).toBe('first');
    },
  },
  {
    claim: 'creates a whole target that is absent, and answers already-exists rather than replace one that is there',
    check: (fileReplace) => {
      const temporaryPath = join(scratch, 'target.tmp');
      const targetPath    = join(scratch, 'target');
      writeFileSync(temporaryPath, 'first');
      expect(fileReplace.createWholeExclusively(temporaryPath, targetPath)).toBe('created');
      unlinkSync(temporaryPath);
      writeFileSync(temporaryPath, 'second');
      expect(fileReplace.createWholeExclusively(temporaryPath, targetPath)).toBe('already-exists');
      expect(readFileSync(targetPath, 'utf8')).toBe('first');
    },
  },
];

function failingWith(code: string): () => never {
  return () => {
    throw Object.assign(new Error(code), { code });
  };
}

const NO_WAIT = (): void => {};

/** The same moves with the hard link failing, as on FAT, exFAT and some shares. */
const LINKLESS_CLAUSES: readonly PortClause<FileReplace>[] = [
  {
    claim: 'creates the target through the fallback when a link fails, and still never replaces one that is there',
    check: (fileReplace) => {
      const targetPath = join(scratch, 'target');
      expect(fileReplace.createExclusively('/never-read', targetPath, 'first')).toBe('created');
      expect(fileReplace.createExclusively('/never-read', targetPath, 'second')).toBe('already-exists');
      expect(readFileSync(targetPath, 'utf8')).toBe('first');
    },
  },
  {
    claim: 'refuses a create that must be whole, leaving no partial target',
    check: (fileReplace) => {
      const targetPath = join(scratch, 'target');
      expect(() => fileReplace.createWholeExclusively('/never-read', targetPath)).toThrow('EPERM');
      expect(existsSync(targetPath)).toBe(false);
    },
  },
];

runPortContract('FileReplace', [
  { name: 'PosixFileReplace on injected primitives', build: () => createPosixFileReplace(REAL_FILE_REPLACE_PRIMITIVES) },
  { name: 'WindowsFileReplace on injected primitives', build: () => createWindowsFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, wait: NO_WAIT }) },
  { name: 'the native adapter', build: () => fileReplaceFor('darwin') },
  { name: 'the win32 adapter', build: () => fileReplaceFor('win32') },
], CLAUSES);

runPortContract('FileReplace over a failing hard link', [
  { name: 'PosixFileReplace', build: () => createPosixFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, link: failingWith('EPERM') }) },
  { name: 'WindowsFileReplace', build: () => createWindowsFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, link: failingWith('EPERM'), wait: NO_WAIT }) },
], LINKLESS_CLAUSES);

test('an exclusive create passes on a failure of the fallback too', () => {
  const fileReplace = createPosixFileReplace({
    ...REAL_FILE_REPLACE_PRIMITIVES,
    link:      failingWith('ENOTSUP'),
    createNew: failingWith('ENOSPC'),
  });
  expect(() => fileReplace.createExclusively('/from', '/to', 'contents')).toThrow('ENOSPC');
});

describe('a file something else holds', () => {
  function renameFailingFirst(failedTries: number, code = 'EPERM'): { rename: () => void; triesMade: () => number } {
    let triesMade = 0;
    return {
      rename: () => {
        triesMade += 1;
        if (triesMade <= failedTries) failingWith(code)();
      },
      triesMade: () => triesMade,
    };
  }

  test('the Windows adapter moves it on the last try, its waits one step longer each time and under two seconds in all', () => {
    const waits: number[] = [];
    const fakeRename = renameFailingFirst(HELD_FILE_RETRY_TRIES - 1);
    const fileReplace = createWindowsFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, rename: fakeRename.rename, wait: (milliseconds) => waits.push(milliseconds) });

    expect(fileReplace.replaceFile('/from', '/to')).toEqual({ verdict: 'moved' });

    expect(fakeRename.triesMade()).toBe(12);
    expect(waits).toEqual([25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275]);
    expect(waits.reduce((a, b) => a + b)).toBeLessThan(2000);
  });

  test.each(['EPERM', 'EBUSY', 'EACCES'])('the Windows adapter answers a verdict once the last try fails with %s, never a throw', (code) => {
    const fakeRename = renameFailingFirst(HELD_FILE_RETRY_TRIES, code);
    const fileReplace = createWindowsFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, rename: fakeRename.rename, wait: NO_WAIT });

    expect(fileReplace.replaceFile('/from', '/to')).toEqual({ verdict: 'held', failure: expect.objectContaining({ code }) });
    expect(fakeRename.triesMade()).toBe(12);
  });

  test('the Windows adapter retries a removal the same way', () => {
    const waits: number[] = [];
    const fileReplace = createWindowsFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, unlink: failingWith('EBUSY'), wait: (milliseconds) => waits.push(milliseconds) });

    expect(fileReplace.removeHeldFile('/held')).toEqual({ verdict: 'held', failure: expect.objectContaining({ code: 'EBUSY' }) });
    expect(waits).toHaveLength(HELD_FILE_RETRY_TRIES - 1);
  });

  test('a failure that says nothing of a hold is thrown at once on Windows', () => {
    const fakeRename = renameFailingFirst(HELD_FILE_RETRY_TRIES, 'ENOENT');
    const fileReplace = createWindowsFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, rename: fakeRename.rename, wait: NO_WAIT });

    expect(() => fileReplace.replaceFile('/from', '/to')).toThrow('ENOENT');
    expect(fakeRename.triesMade()).toBe(1);
  });

  test('the Posix adapter tries once', () => {
    const fakeRename = renameFailingFirst(1);
    const fileReplace = createPosixFileReplace({ ...REAL_FILE_REPLACE_PRIMITIVES, rename: fakeRename.rename });

    expect(fileReplace.replaceFile('/from', '/to')).toEqual({ verdict: 'held', failure: expect.objectContaining({ code: 'EPERM' }) });
    expect(fakeRename.triesMade()).toBe(1);
  });
});

describe('the selector', () => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;

  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
  });

  testWhenNotRunningAsRoot('reads the platform at call time, so a write on Windows gets the retry: a rename into a read-only folder waits there and not here', () => {
    const readOnlyFolder = join(scratch, 'read-only');
    mkdirSync(readOnlyFolder);
    chmodSync(readOnlyFolder, 0o500);
    const temporaryPath = join(scratch, 'target.tmp');
    writeFileSync(temporaryPath, 'new');
    const sleep = spyOn(Bun, 'sleepSync').mockImplementation(() => {});

    try {
      expect(fileReplaceOfThisProcess().replaceFile(temporaryPath, join(readOnlyFolder, 'target')).verdict).toBe('held');
      expect(sleep).toHaveBeenCalledTimes(0);

      Object.defineProperty(process, 'platform', { ...realPlatform, value: 'win32' });
      expect(fileReplaceOfThisProcess().replaceFile(temporaryPath, join(readOnlyFolder, 'target')).verdict).toBe('held');
      expect(sleep).toHaveBeenCalledTimes(HELD_FILE_RETRY_TRIES - 1);
    } finally {
      sleep.mockRestore();
      chmodSync(readOnlyFolder, 0o700);
    }
  });
});
