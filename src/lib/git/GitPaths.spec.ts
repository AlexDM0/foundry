/**
 * The canonical form under injected path styles, so this machine proves the Windows answers too: git's `C:/` spelling and a joined
 * backslash path must meet, case folds only where the style says, and a path outside its folder has no relative form.
 */
import { mkdirSync, symlinkSync } from 'node:fs';
import { join, posix, win32 }     from 'node:path';

import { expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { type GitPathStyle, GitPaths }                    from './GitPaths.ts';

const LINUX: GitPathStyle   = { pathModule: posix, foldsCase: false };
const MACOS: GitPathStyle   = { pathModule: posix, foldsCase: true };
const WINDOWS: GitPathStyle = { pathModule: win32, foldsCase: true };

const STYLE_OF_HOST = { windows: WINDOWS, macos: MACOS, linux: LINUX } as const;

test.each([
  ['windows', 'C:/Repo/.git/worktrees/ticket-1', 'c:/repo/.git/worktrees/ticket-1'],
  ['windows', 'C:\\Repo\\.git\\worktrees\\ticket-1', 'c:/repo/.git/worktrees/ticket-1'],
  ['windows', 'C:\\Repo\\wt\\..\\other', 'c:/repo/other'],
  ['macos', '/Example/Repo/../Other', '/example/other'],
  ['linux', '/Example/Repo', '/Example/Repo'],
] as const)('on %s, %s is canonically %s', (host, path, canonical) => {
  expect(GitPaths.canonicalOf(STYLE_OF_HOST[host], path)).toBe(canonical);
});

test.each([
  ['windows', 'C:/repo/wt', 'C:\\repo\\wt\\tools\\hooks', 'tools/hooks'],
  ['windows', 'C:\\repo\\wt', 'c:/REPO/wt/Tools', 'tools'],
  ['windows', 'C:/repo/wt', 'C:/repo/wt', null],
  ['windows', 'C:/repo/wt', 'C:/repo/other/hooks', null],
  ['windows', 'C:/repo/wt', 'D:/repo/wt/hooks', null],
  ['linux', '/repo/wt', '/repo/wt/tools/hooks', 'tools/hooks'],
  ['linux', '/repo/wt', '/repo/wt-other/hooks', null],
] as const)('on %s, %s holds %s at %p', (host, folder, path, relativePath) => {
  expect(GitPaths.relativeInsideOf(STYLE_OF_HOST[host], folder, path)).toBe(relativePath);
});

test('a path reached through a symlink and its real spelling meet, a removed child under it included', () => {
  const scratch = createScratchDirectory('git-paths');
  try {
    mkdirSync(join(scratch, 'real'));
    symlinkSync(join(scratch, 'real'), join(scratch, 'linked'));
    expect(GitPaths.canonicalOf(LINUX, join(scratch, 'linked', 'removed'))).toBe(GitPaths.canonicalOf(LINUX, join(scratch, 'real', 'removed')));
  } finally {
    removeScratchDirectory(scratch);
  }
});
