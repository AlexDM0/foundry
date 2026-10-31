/**
 * One contract for the `OwnerOnlyFiles` port, on real modes because the mode is the guarantee: what is restricted reads back owner-only, what is
 * wider or unreadable does not. The platform without an adapter refuses and reads nothing as owner-only.
 */
import {
  chmodSync,
  mkdirSync,
  statSync,
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
import type { OwnerOnlyFiles }                            from './OwnerOnlyFiles.ts';
import { ownerOnlyFilesFor }                              from './OwnerOnlyFilesFor.ts';
import { createPosixOwnerOnlyFiles }                      from './PosixOwnerOnlyFiles.ts';

const PERMISSION_BITS = 0o777;
const WIDE_FILE_MODE  = 0o644;

let scratch = '';

beforeEach(() => {
  scratch = createScratchDirectory('owner-only');
});

afterEach(() => {
  removeScratchDirectory(scratch);
});

const CLAUSES: readonly PortClause<OwnerOnlyFiles>[] = [
  {
    claim: 'creates an absent folder owner-only',
    check: (ownerOnlyFiles) => {
      const folder = join(scratch, 'secrets');
      ownerOnlyFiles.restrictFolder(folder);
      expect(statSync(folder).mode & PERMISSION_BITS).toBe(0o700);
      expect(ownerOnlyFiles.isOwnerOnly(folder)).toBe(true);
    },
  },
  {
    claim: 'narrows a wide file, and reads the difference',
    check: (ownerOnlyFiles) => {
      const path = join(scratch, 'token');
      writeFileSync(path, 'example');
      chmodSync(path, WIDE_FILE_MODE);
      expect(ownerOnlyFiles.isOwnerOnly(path)).toBe(false);
      ownerOnlyFiles.restrictFile(path);
      expect(statSync(path).mode & PERMISSION_BITS).toBe(0o600);
      expect(ownerOnlyFiles.isOwnerOnly(path)).toBe(true);
    },
  },
  {
    claim: 'fails closed on a path that cannot be read',
    check: (ownerOnlyFiles) => {
      expect(ownerOnlyFiles.isOwnerOnly(join(scratch, 'absent'))).toBe(false);
    },
  },
];

runPortContract('OwnerOnlyFiles', [
  {
    name:  'PosixOwnerOnlyFiles on injected primitives',
    build: () => createPosixOwnerOnlyFiles({
      createFolder: (folder, mode) => {
        mkdirSync(folder, { recursive: true, mode });
      },
      changeMode: chmodSync,
      modeOf:     (path) => statSync(path).mode,
    }),
  },
  { name: 'the native adapter', build: () => ownerOnlyFilesFor('darwin') },
], CLAUSES);

test('a platform with no adapter refuses a restriction and reads nothing as owner-only', () => {
  const ownerOnlyFiles = ownerOnlyFilesFor('win32');
  expect(() => ownerOnlyFiles.restrictFolder(scratch)).toThrow('win32');
  expect(() => ownerOnlyFiles.restrictFile(scratch)).toThrow('win32');
  expect(ownerOnlyFiles.isOwnerOnly(scratch)).toBe(false);
});
