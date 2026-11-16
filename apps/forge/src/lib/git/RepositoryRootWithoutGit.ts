/**
 * The repository root a directory belongs to, and the checkout it lies in, found from the `.git` entries on disk alone, so `GitProcess`
 * can ask it before any git is resolved and a tracker's place in its checkout costs no git call. A worktree's `.git` file leads to the main
 * checkout through its `gitdir` line.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve }       from 'node:path';

import { GIT_ENTRY_NAME } from './constants/GitConventions.ts';

const WORKTREE_GIT_DIRECTORY_SEGMENT = '/.git/worktrees/';

/** A `.git` file pointing at `/abs/.git/worktrees/<name>` names `/abs`; anything else, a submodule, means the containing directory. */
function repositoryRootFromGitFile(gitFilePath: string, containingDirectory: string): string {
  const pointer = readFileSync(gitFilePath, 'utf8').trim();
  const gitDirectory = pointer.startsWith('gitdir:') ? pointer.slice('gitdir:'.length).trim() : '';
  const worktreeSegmentIndex = gitDirectory.indexOf(WORKTREE_GIT_DIRECTORY_SEGMENT);
  if (worktreeSegmentIndex > 0) {
    const mainCheckout = gitDirectory.slice(0, worktreeSegmentIndex);
    if (isAbsolute(mainCheckout)) return mainCheckout;
    return resolve(containingDirectory, mainCheckout);
  }
  return containingDirectory;
}

export function repositoryRootWithoutGit(directory: string): string | null {
  let candidate = resolve(directory);
  for (;;) {
    const gitEntryPath = resolve(candidate, GIT_ENTRY_NAME);
    if (existsSync(gitEntryPath)) {
      try {
        if (statSync(gitEntryPath).isDirectory()) return candidate;
        return repositoryRootFromGitFile(gitEntryPath, candidate);
      } catch {
        // An unreadable `.git` tells us nothing to act on; keep walking rather than claim this directory.
      }
    }
    const parentDirectory = dirname(candidate);
    if (parentDirectory === candidate) return null;
    candidate = parentDirectory;
  }
}

/** The nearest directory holding a `.git` entry: the toplevel of the checkout, main or linked, that `directory` lies in. */
export function checkoutRootWithoutGit(directory: string): string | null {
  let candidate = resolve(directory);
  for (;;) {
    if (existsSync(resolve(candidate, GIT_ENTRY_NAME))) return candidate;
    const parentDirectory = dirname(candidate);
    if (parentDirectory === candidate) return null;
    candidate = parentDirectory;
  }
}
