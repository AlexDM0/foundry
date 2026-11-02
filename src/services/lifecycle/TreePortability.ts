/**
 * What a tracked tree cannot represent on every OS, read from git's index of the commit, never from the checkout, so the findings are the same
 * on every host: a path part Windows reserves or cannot store, paths that differ only in case, and symbolic links. Nothing is repaired.
 */
import { GitProcess }   from '../../lib/git/GitProcess.ts';
import { GitWorktrees } from '../../lib/git/GitWorktrees.ts';

export type TreeFindingKind = 'reserved-name' | 'unstorable-name' | 'case-collision' | 'symbolic-link';

export interface TreeFinding {
  kind:  TreeFindingKind;
  paths: string[];
}

export interface TreeEntry {
  mode: string;
  path: string;
}

const SYMBOLIC_LINK_MODE = '120000';

/** A device name Windows reserves whatever the extension, so `aux.c` is one too. */
const RESERVED_PATH_PART_PATTERN = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

/** A character NTFS forbids, a control character, or a trailing dot or space. */

const UNSTORABLE_PATH_PART_PATTERN = /[<>:"|?*\\\u0000-\u001f]|[. ]$/;

function pathPartsOf(path: string): string[] {
  return path.split('/');
}

/** One finding per offending path, and one per set of paths that fold to the same text; in the tree's order. */
function findingsOf(entries: readonly TreeEntry[]): TreeFinding[] {
  const findings: TreeFinding[] = [];
  const pathsByFoldedPath = new Map<string, string[]>();
  for (const { mode, path } of entries) {
    if (pathPartsOf(path).some((part) => RESERVED_PATH_PART_PATTERN.test(part))) findings.push({ kind: 'reserved-name', paths: [path] });
    if (pathPartsOf(path).some((part) => UNSTORABLE_PATH_PART_PATTERN.test(part))) findings.push({ kind: 'unstorable-name', paths: [path] });
    if (mode === SYMBOLIC_LINK_MODE) findings.push({ kind: 'symbolic-link', paths: [path] });
    const foldedPath = path.toLowerCase();
    pathsByFoldedPath.set(foldedPath, [...pathsByFoldedPath.get(foldedPath) ?? [], path]);
  }
  for (const paths of pathsByFoldedPath.values()) if (paths.length > 1) findings.push({ kind: 'case-collision', paths });
  return findings;
}

/** `null` when git could not list the tree, which reports nothing rather than a guess. */
function treeEntriesAt(directory: string, revision: string): TreeEntry[] | null {
  const run = GitProcess.run(directory, ['ls-tree', '-r', '-z', '--full-tree', revision], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\0').filter((line) => line !== '').map((line) => {
    const tabAt = line.indexOf('\t');
    return { mode: line.slice(0, line.indexOf(' ')), path: line.slice(tabAt + 1) };
  });
}

function treeFindingsAt(directory: string, revision: string): TreeFinding[] {
  const entries = treeEntriesAt(directory, revision);
  return entries === null ? [] : findingsOf(entries);
}

export const TreePortability = Object.freeze({ findingsOf, treeFindingsAt });
