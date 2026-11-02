/**
 * The guard that keeps a spec away from a tracker it did not create: every directory a spec hands a command must lie inside the scratch root, and
 * so must any tracker discovery resolves from it — the walk up, the git common directory and `AGENT_PROGRESS_ROOT` alike.
 */
import { realpathSync } from 'node:fs';
import { tmpdir }       from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
}                       from 'node:path';

import { findWorkspace } from '../services/tracker/Workspace.ts';

export type TrackerIsolationVerdict = 'isolated' | 'directory-outside-the-scratch-root' | 'resolves-a-tracker-outside-the-scratch-root';

/**
 * Only this repository's test runs use it. It is short because a Unix socket path under it must fit, and it is not `tmpdir()`, whose
 * crowded macOS folder slows every process started in it.
 */
export const SHARED_SCRATCH_ROOT = '/tmp/agent-progress-tests';

/**
 * Where `src/testing/ScratchWorkspace.ts` creates scratch directories, with their symlinks resolved: the shared root, and `tmpdir()` for the
 * specs that need a folder outside `/tmp`.
 */
export function scratchRootDirectories(): readonly string[] {
  return [canonicalPathOf(SHARED_SCRATCH_ROOT), canonicalPathOf(tmpdir())];
}

/** A path that does not exist yet is canonicalised through its nearest existing ancestor, since the scratch root itself sits behind a symlink on macOS. */
export function canonicalPathOf(path: string): string {
  const absolutePath = resolve(path);
  try {
    return realpathSync(absolutePath);
  } catch {
    const parentDirectory = dirname(absolutePath);
    return parentDirectory === absolutePath ? absolutePath : join(canonicalPathOf(parentDirectory), basename(absolutePath));
  }
}

export function pathLiesInside(candidatePath: string, containingDirectory: string): boolean {
  const pathFromContainer = relative(containingDirectory, candidatePath);
  return pathFromContainer !== '' && !pathFromContainer.startsWith('..') && !isAbsolute(pathFromContainer);
}

/** Without a `scratchRoot`, every root in `scratchRootDirectories`, a resolved tracker held to the one its directory lies in. */
export function trackerIsolationVerdictFor(startDirectory: string, scratchRoot?: string): TrackerIsolationVerdict {
  const scratchRoots = scratchRoot === undefined ? scratchRootDirectories() : [canonicalPathOf(scratchRoot)];
  const canonicalStartDirectory = canonicalPathOf(startDirectory);
  const containingScratchRoot = scratchRoots.find((root) => pathLiesInside(canonicalStartDirectory, root));
  if (containingScratchRoot === undefined) return 'directory-outside-the-scratch-root';
  const resolvedWorkspace = findWorkspace(startDirectory);
  if (resolvedWorkspace !== null && !pathLiesInside(canonicalPathOf(resolvedWorkspace.rootDirectory), containingScratchRoot)) {
    return 'resolves-a-tracker-outside-the-scratch-root';
  }
  return 'isolated';
}

/** Throws rather than returning, because its callers are the spec helpers, and a throw there fails the spec before any command can write. */
export function requireTrackerIsolation(startDirectory: string, scratchRoot?: string): void {
  const verdict = trackerIsolationVerdictFor(startDirectory, scratchRoot);
  if (verdict === 'isolated') return;
  throw new Error(
    `A spec pointed a command at ${startDirectory}, which is not isolated (${verdict}): a command run from there could write into a real tracker. `
    + 'Give it a directory from src/testing/ScratchWorkspace.ts instead.',
  );
}
