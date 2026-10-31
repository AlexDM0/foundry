/**
 * One contract for the `FileReplace` port, run on fake primitives and on real files: a replace leaves only the new bytes, a remove removes, and an
 * exclusive create never replaces. The platform without an adapter refuses.
 */
import {
  existsSync,
  linkSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { type PortClause, runPortContract }               from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { FileReplace }                               from './FileReplace.ts';
import { fileReplaceFor }                                 from './FileReplaceFor.ts';
import { createPosixFileReplace }                         from './PosixFileReplace.ts';

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
      expect(fileReplace.createExclusively(temporaryPath, targetPath)).toBe('created');
      unlinkSync(temporaryPath);
      writeFileSync(temporaryPath, 'second');
      expect(fileReplace.createExclusively(temporaryPath, targetPath)).toBe('already-exists');
      expect(readFileSync(targetPath, 'utf8')).toBe('first');
    },
  },
];

runPortContract('FileReplace', [
  { name: 'PosixFileReplace on injected primitives', build: () => createPosixFileReplace({ rename: renameSync, unlink: unlinkSync, link: linkSync }) },
  { name: 'the native adapter', build: () => fileReplaceFor('darwin') },
], CLAUSES);

test('an exclusive create passes on any failure but an existing target', () => {
  const fileReplace = createPosixFileReplace({
    rename: () => undefined,
    unlink: () => undefined,
    link:   () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    },
  });
  expect(() => fileReplace.createExclusively('/from', '/to')).toThrow('disk full');
});

test('a platform with no adapter refuses each move', () => {
  const fileReplace = fileReplaceFor('win32');
  expect(() => fileReplace.replaceFile('/from', '/to')).toThrow('win32');
  expect(() => fileReplace.removeHeldFile('/from')).toThrow('win32');
  expect(() => fileReplace.createExclusively('/from', '/to')).toThrow('win32');
});
