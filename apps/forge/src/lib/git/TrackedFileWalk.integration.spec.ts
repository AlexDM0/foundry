/**
 * `architecture/ComponentNames.spec.ts` and the carriage return scan of `architecture/LineEndingPolicy.spec.ts` read the files of a folder
 * walk that runs no git. This spec holds the walk to git's own list: every file `git ls-files` names is walked, so no tracked file escapes
 * those scans. Its subject is the index of this checkout, which no recorded answer can stand in for, so it is a git boundary spec.
 */
import { expect } from 'bun:test';

import { repositoryRootOfThisCheckout } from '../../testing/ImportGraph.ts';
import { repositoryFilePaths }          from '../../testing/RepositorySources.ts';
import { testWhenGitIsPresent }         from '../../testing/ToolGuard.ts';

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

function trackedFilePaths(): string[] {
  const listing = Bun.spawnSync(['git', 'ls-files'], { cwd: REPOSITORY_ROOT });
  if (listing.exitCode !== 0) throw new Error(`git ls-files failed: ${listing.stderr.toString()}`);
  return listing.stdout.toString().split('\n').filter((filePath) => filePath !== '');
}

testWhenGitIsPresent('the folder walk reaches every file git tracks', () => {
  const trackedPaths = trackedFilePaths();
  const walkedPaths = new Set(repositoryFilePaths(REPOSITORY_ROOT));
  expect(trackedPaths).toContain('CLAUDE.md');
  expect(trackedPaths.filter((filePath) => !walkedPaths.has(filePath))).toEqual([]);
});
