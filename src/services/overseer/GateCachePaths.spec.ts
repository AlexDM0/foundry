/**
 * The cache-folder judge under each OS's `DataFolders`, on real scratch folders: a folder of executables must be refused by its name, by a
 * folder it holds, or, on Windows, by a runnable file it holds, with names compared without case where the OS folds case. A wire path absolute
 * only on another OS must never reach a sandbox on this one.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { dataFoldersFor }                                 from '../../lib/data-folders/DataFoldersFor.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GateCachePaths }                                 from './GateCachePaths.ts';

const WINDOWS = dataFoldersFor('win32', '');
const LINUX   = dataFoldersFor('linux', '');
const MACOS   = dataFoldersFor('darwin', '');

let scratch = '';

beforeEach(() => {
  scratch = realpathSync(createScratchDirectory('cache-paths'));
});

afterEach(() => {
  removeScratchDirectory(scratch);
});

function folderHolding(name: string, entry: { file: string } | { folder: string } | null): string {
  const folder = join(scratch, name);
  mkdirSync(folder, { recursive: true });
  if (entry !== null && 'file' in entry) writeFileSync(join(folder, entry.file), '');
  if (entry !== null && 'folder' in entry) mkdirSync(join(folder, entry.folder));
  return folder;
}

describe('under the Windows tables', () => {
  test.each([
    ['a folder holding a planted tool.exe', 'tools', { file: 'tool.exe' }],
    ['a folder holding a planted TOOL.CMD', 'tools', { file: 'TOOL.CMD' }],
    ['a folder holding a planted run.ps1', 'tools', { file: 'run.ps1' }],
    ['a Scripts folder', join('venv', 'Scripts'), null],
    ['a folder holding a scripts folder', 'venv', { folder: 'scripts' }],
    ['a Bin folder', join('tool', 'Bin'), null],
    ['a folder holding a Bin folder', 'tool', { folder: 'Bin' }],
  ] as const)('refuses %s', (_case, name, entry) => {
    expect(GateCachePaths.refusalOf(folderHolding(name, entry), scratch, [], WINDOWS)).toBe('executables-folder');
  });

  test('accepts a folder of plain files, and a folder nested in one on PATH is refused under another case', () => {
    expect(GateCachePaths.refusalOf(folderHolding('cache', { file: 'index.json' }), scratch, [], WINDOWS)).toBeNull();
    expect(GateCachePaths.refusalOf('C:\\Tools\\Example\\cache', scratch, ['c:\\tools\\example'], WINDOWS)).toBe('search-path-folder');
  });

  test('a drive folder and a ~\\ folder resolve under the Windows module', () => {
    expect(GateCachePaths.writableCachePathsOf(['C:\\cache', '~\\AppData\\cache'], 'C:\\Users\\example', [], WINDOWS))
      .toEqual(['C:\\cache', 'C:\\Users\\example\\AppData\\cache']);
  });
});

describe('under the POSIX tables', () => {
  test('a planted tool.exe or a Scripts folder means nothing, a bin folder still refuses', () => {
    expect(GateCachePaths.refusalOf(folderHolding('tools', { file: 'tool.exe' }), scratch, [], LINUX)).toBeNull();
    expect(GateCachePaths.refusalOf(folderHolding(join('venv', 'Scripts'), null), scratch, [], LINUX)).toBeNull();
    expect(GateCachePaths.refusalOf(folderHolding('tool', { folder: 'bin' }), scratch, [], LINUX)).toBe('executables-folder');
  });

  test('a Bin segment refuses on macOS, which folds case, and not on Linux, which does not', () => {
    expect(GateCachePaths.refusalOf(join(scratch, 'tool', 'Bin', 'cache'), scratch, [], MACOS)).toBe('executables-folder');
    expect(GateCachePaths.refusalOf(join(scratch, 'tool', 'Bin', 'cache'), scratch, [], LINUX)).toBeNull();
  });

  test('a ~/ folder is judged after joining the home folder, and a drive folder never becomes a write', () => {
    folderHolding(join('.bun', 'bin'), null);
    expect(GateCachePaths.refusalOf('~/.bun', scratch, [], LINUX)).toBe('executables-folder');
    expect(GateCachePaths.writableCachePathsOf(['C:\\cache', '~/.cache/example'], scratch, [], LINUX)).toEqual([join(scratch, '.cache', 'example')]);
  });
});
