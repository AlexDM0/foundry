/**
 * One contract for the `OwnerOnlyFiles` port, on real modes because the mode is the guarantee: what is restricted reads back owner-only, what is
 * wider or unreadable does not. The platform without an adapter refuses and reads nothing as owner-only. Windows reads the ACL back, so its
 * adapter runs over fake icacls output: every grant beyond the owner, and every output it cannot read, fails closed.
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
  describe,
  expect,
  test
} from 'bun:test';

import { type PortClause, runPortContract }               from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { OwnerOnlyFiles }                            from './OwnerOnlyFiles.ts';
import { ownerOnlyFilesFor }                              from './OwnerOnlyFilesFor.ts';
import { createPosixOwnerOnlyFiles }                      from './PosixOwnerOnlyFiles.ts';
import { createWindowsOwnerOnlyFiles }                    from './WindowsOwnerOnlyFiles.ts';

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
      expect(ownerOnlyFiles.restrictFolder(folder)).toEqual({ verdict: 'restricted' });
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
      expect(ownerOnlyFiles.restrictFile(path)).toEqual({ verdict: 'restricted' });
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
  const ownerOnlyFiles = ownerOnlyFilesFor('example-os');
  expect(ownerOnlyFiles.restrictFolder(scratch)).toEqual({
    verdict: 'refused', cause: 'no-adapter', platformName: 'example-os', path: scratch
  });
  expect(ownerOnlyFiles.restrictFile(scratch)).toEqual({
    verdict: 'refused', cause: 'no-adapter', platformName: 'example-os', path: scratch
  });
  expect(ownerOnlyFiles.isOwnerOnly(scratch)).toBe(false);
});

describe('WindowsOwnerOnlyFiles over fake icacls output', () => {
  const PROFILE_PATH = 'C:\\Users\\alex.example\\.agent-progress-monitor\\private\\tracker-example';
  const SYSTEM_ENTRY = 'NT AUTHORITY\\SYSTEM:(I)(OI)(CI)(F)';
  const ADMINISTRATORS_ENTRY = 'BUILTIN\\Administrators:(I)(OI)(CI)(F)';
  const OWNER_ENTRY = 'EXAMPLE-PC\\alex.example:(I)(OI)(CI)(F)';
  const TRAILER = 'Successfully processed 1 files; Failed processing 0 files';

  /** `icacls`'s shape: the path and the first entry on one line, each later entry indented, a blank line, the summary. */
  function icaclsOutputOf(entries: readonly string[]): string {
    const [firstEntry = '', ...laterEntries] = entries;
    const indent = ' '.repeat(PROFILE_PATH.length + 1);
    return [`${PROFILE_PATH} ${firstEntry}`, ...laterEntries.map((entry) => `${indent}${entry}`), '', TRAILER, ''].join('\r\n');
  }

  function adapterOver(accessListOf: (path: string) => string | null): OwnerOnlyFiles & { createdFolders: string[] } {
    const createdFolders: string[] = [];
    const adapter = createWindowsOwnerOnlyFiles({
      createFolder:    (folder) => { createdFolders.push(folder); },
      accessListOf,
      currentUserName: () => 'alex.example',
    });
    return { ...adapter, createdFolders };
  }

  const INHERITED_PROFILE_ENTRIES = [SYSTEM_ENTRY, ADMINISTRATORS_ENTRY, OWNER_ENTRY];
  const NOT_PROVED_AT_PROFILE = { verdict: 'refused', cause: 'not-proved-owner-only', path: PROFILE_PATH } as const;

  test('the profile\'s inherited ACL reads owner-only, and a restriction creates the folder and passes', () => {
    const ownerOnlyFiles = adapterOver(() => icaclsOutputOf(INHERITED_PROFILE_ENTRIES));
    expect(ownerOnlyFiles.isOwnerOnly(PROFILE_PATH)).toBe(true);
    expect(ownerOnlyFiles.restrictFolder(PROFILE_PATH)).toEqual({ verdict: 'restricted' });
    expect(ownerOnlyFiles.restrictFile(PROFILE_PATH)).toEqual({ verdict: 'restricted' });
    expect(ownerOnlyFiles.createdFolders).toEqual([PROFILE_PATH]);
  });

  test.each([
    ['a planted Authenticated Users grant', 'NT AUTHORITY\\Authenticated Users:(I)(M)'],
    ['Everyone', 'Everyone:(R)'],
    ['the machine\'s Users group', 'BUILTIN\\Users:(I)(RX)'],
    ['another local user', 'EXAMPLE-PC\\other.example:(I)(F)'],
    ['a line of another shape', 'unparsed text'],
  ])('%s is not owner-only, and a restriction refuses', (_name, entry) => {
    const ownerOnlyFiles = adapterOver(() => icaclsOutputOf([...INHERITED_PROFILE_ENTRIES, entry]));
    expect(ownerOnlyFiles.isOwnerOnly(PROFILE_PATH)).toBe(false);
    expect(ownerOnlyFiles.restrictFile(PROFILE_PATH)).toEqual(NOT_PROVED_AT_PROFILE);
    expect(ownerOnlyFiles.restrictFolder(PROFILE_PATH)).toEqual(NOT_PROVED_AT_PROFILE);
  });

  test.each([
    ['icacls cannot run', null],
    ['icacls prints nothing', ''],
    ['icacls prints the path alone', `${PROFILE_PATH}\r\n\r\n${TRAILER}`],
    ['icacls prints another path', icaclsOutputOf(INHERITED_PROFILE_ENTRIES).replace(PROFILE_PATH, 'C:\\other')],
  ])('%s reads as not owner-only', (_name, output) => {
    const ownerOnlyFiles = adapterOver(() => output);
    expect(ownerOnlyFiles.isOwnerOnly(PROFILE_PATH)).toBe(false);
    expect(ownerOnlyFiles.restrictFile(PROFILE_PATH)).toEqual(NOT_PROVED_AT_PROFILE);
  });

  test('the real adapter fails closed on a path icacls cannot answer for', () => {
    const ownerOnlyFiles = ownerOnlyFilesFor('win32');
    const absentPath = join(scratch, 'absent');
    expect(ownerOnlyFiles.isOwnerOnly(absentPath)).toBe(false);
    expect(ownerOnlyFiles.restrictFile(absentPath)).toEqual({ verdict: 'refused', cause: 'not-proved-owner-only', path: absentPath });
  });
});
