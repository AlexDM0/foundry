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

test.each([
  ['windows', WINDOWS, 'C:/Repo/.git/worktrees/ticket-1', 'c:/repo/.git/worktrees/ticket-1'],
  ['windows', WINDOWS, 'C:\\Repo\\.git\\worktrees\\ticket-1', 'c:/repo/.git/worktrees/ticket-1'],
  ['windows', WINDOWS, 'C:\\Repo\\wt\\..\\other', 'c:/repo/other'],
  ['macos', MACOS, '/Example/Repo/../Other', '/example/other'],
  ['linux', LINUX, '/Example/Repo', '/Example/Repo'],
] as const)('on %s, %s is canonically %s', (_host, style, path, canonical) => {
  expect(GitPaths.canonicalOf(style, path)).toBe(canonical);
});

test.each([
  ['windows', WINDOWS, 'C:/repo/wt', 'C:\\repo\\wt\\tools\\hooks', 'tools/hooks'],
  ['windows', WINDOWS, 'C:\\repo\\wt', 'c:/REPO/wt/Tools', 'tools'],
  ['windows', WINDOWS, 'C:/repo/wt', 'C:/repo/wt', null],
  ['windows', WINDOWS, 'C:/repo/wt', 'C:/repo/other/hooks', null],
  ['windows', WINDOWS, 'C:/repo/wt', 'D:/repo/wt/hooks', null],
  ['linux', LINUX, '/repo/wt', '/repo/wt/tools/hooks', 'tools/hooks'],
  ['linux', LINUX, '/repo/wt', '/repo/wt-other/hooks', null],
] as const)('on %s, %s holds %s at %p', (_host, style, folder, path, relativePath) => {
  expect(GitPaths.relativeInsideOf(style, folder, path)).toBe(relativePath);
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
