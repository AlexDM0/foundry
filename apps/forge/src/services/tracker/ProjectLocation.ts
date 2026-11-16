/**
 * Where a tracker's project lies in its repository, and in an agent's checkout of it. Git runs at `repositoryRoot` or `worktreeRoot`,
 * never in a project folder, and paths cross between the two through `ProjectPathsUtil` with `projectPrefix`. The prefix is read from
 * the `.git` entries on disk each time, never stored, so moving a project needs no migration, and finding it makes no git call.
 */
import { realpathSync }        from 'node:fs';
import { join, relative, sep } from 'node:path';

import { checkoutRootWithoutGit } from '../../lib/git/RepositoryRootWithoutGit.ts';

const GIT_SEPARATOR = '/';

/** For a tracker at its checkout's root, or outside any repository, all three name one folder and the prefix is `''`. */
export interface ProjectLocation {
  /** The root of the checkout that holds the tracker, the main checkout in every set-up forge makes. */
  repositoryRoot:   string;
  /** The folder that holds the tracker's data folder: `Workspace.rootDirectory`. */
  projectDirectory: string;
  /** The project folder relative to `repositoryRoot`, `/`-separated with no trailing `/`, as git spells a path. */
  projectPrefix:    string;
}

/** One agent checkout of the repository: its toplevel, where git runs, and the project folder inside it, where a session starts. */
export interface WorktreeProjectLocation {
  worktreeRoot:               string;
  projectDirectoryInWorktree: string;
}

function realPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function projectLocationOf(projectDirectory: string): ProjectLocation {
  const realProjectDirectory = realPathOf(projectDirectory);
  const checkoutRoot = checkoutRootWithoutGit(realProjectDirectory);
  if (checkoutRoot === null) return { repositoryRoot: projectDirectory, projectDirectory, projectPrefix: '' };
  const projectPrefix = relative(checkoutRoot, realProjectDirectory).split(sep).join(GIT_SEPARATOR);
  // With the prefix `''` the tracker's own spelling stays, so a tracker at its checkout's root hands git exactly the folder it does today.
  return { repositoryRoot: projectPrefix === '' ? projectDirectory : checkoutRoot, projectDirectory, projectPrefix };
}

export function worktreeProjectLocationOf(location: ProjectLocation, worktreeRoot: string): WorktreeProjectLocation {
  return {
    worktreeRoot,
    projectDirectoryInWorktree: location.projectPrefix === '' ? worktreeRoot : join(worktreeRoot, location.projectPrefix),
  };
}
