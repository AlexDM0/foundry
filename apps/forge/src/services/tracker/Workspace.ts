/**
 * Where one tracker's files are. `findWorkspace` walks up first — the nearest tracker above wins —
 * and asks `src/lib/git/RepositoryRoot.ts` only when the walk finds nothing, which is what makes a
 * sibling worktree, with nothing above it holding the tracker, resolve to the main checkout: the
 * start's place in its own checkout is applied to the main checkout, and the walk goes on up from there.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve }   from 'node:path';

import { discoverRepositoryRoot }    from '../../lib/git/RepositoryRoot.ts';
import { agentProgressRootOverride } from '../../shared/Environment.ts';
import { OperationRefusal }          from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }             from '../../shared/constants/ProductNames.ts';
import { boardIsStoredAt }           from './LocalStoreLayout.ts';
import { projectLocationOf }         from './ProjectLocation.ts';

/** The board's place, all absolute: a relative path would resolve against a subagent's working directory. Where each record is kept is the store's. */
export interface Workspace {
  rootDirectory:    string;
  trackerDirectory: string;
}

/** The place a tracker would have whether or not it exists; touches no filesystem, because `init` needs the place of one it is creating. */
export function workspacePathsFor(rootDirectory: string): Workspace {
  const absoluteRoot = resolve(rootDirectory);
  const trackerDirectory = join(absoluteRoot, PRODUCT_NAMES.DATA_FOLDER);
  return { rootDirectory: absoluteRoot, trackerDirectory };
}

/**
 * `AGENT_PROGRESS_ROOT` wins outright, with no walk in either direction, and a tracker must still
 * exist there, so a misspelled override reads as "no tracker" rather than finding a different one.
 */
export function findWorkspace(startDirectory: string): Workspace | null {
  const overrideRoot = agentProgressRootOverride();
  if (overrideRoot !== undefined) {
    const overriddenWorkspace = workspacePathsFor(overrideRoot);
    return boardIsStoredAt(overriddenWorkspace.rootDirectory) ? overriddenWorkspace : null;
  }

  let candidate = resolve(startDirectory);
  try {
    candidate = realpathSync(candidate);
  } catch {
    // A start directory that no longer exists cannot hold a tracker, and the walk still reaches its real ancestors.
  }

  const realStartDirectory = candidate;
  for (;;) {
    if (boardIsStoredAt(candidate)) return workspacePathsFor(candidate);
    const parentDirectory = dirname(candidate);
    if (parentDirectory === candidate) break;
    candidate = parentDirectory;
  }

  const discovery = discoverRepositoryRoot(startDirectory);
  if (discovery.source !== 'git') return null;
  return nearestTrackerInTheMainCheckout(discovery.rootDirectory, projectLocationOf(realStartDirectory).projectPrefix);
}

/** From the start's place in the main checkout up to its root and no further: with the prefix `''` only the root itself is asked. */
function nearestTrackerInTheMainCheckout(repositoryRoot: string, startPrefix: string): Workspace | null {
  let candidate = startPrefix === '' ? repositoryRoot : join(repositoryRoot, startPrefix);
  for (;;) {
    if (boardIsStoredAt(candidate)) return workspacePathsFor(candidate);
    const parentDirectory = dirname(candidate);
    if (candidate === repositoryRoot || parentDirectory === candidate) return null;
    candidate = parentDirectory;
  }
}

/**
 * The one place the "no tracker here" refusal is thrown, so every command exits 1: with the directory AGENT_PROGRESS_ROOT names when it is
 * set, otherwise with the directory the search started from, for the command line to word.
 */
export function requireWorkspace(startDirectory: string): Workspace {
  const workspace = findWorkspace(startDirectory);
  if (workspace !== null) return workspace;

  const overrideRoot = agentProgressRootOverride();
  if (overrideRoot !== undefined) {
    throw new OperationRefusal('refused', { kind: 'no-tracker-at-override', overrideDirectory: resolve(overrideRoot) });
  }

  const searchedFrom = existsSync(startDirectory) ? resolve(startDirectory) : startDirectory;
  throw new OperationRefusal('refused', { kind: 'no-tracker-found', searchedFrom });
}
