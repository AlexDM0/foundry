/**
 * Paths compared with what git prints: git writes `/` on every host, `C:/repo` on Windows, while a joined path uses the host's separator.
 * The canonical form is resolved, real where it exists, `/`-separated and case-folded where the passed style folds case.
 */
import { existsSync, realpathSync } from 'node:fs';
import type { posix }               from 'node:path';

/** The `DataFolders` port satisfies it: its path module and whether its file system folds case. */
export interface GitPathStyle {
  readonly pathModule: typeof posix;
  readonly foldsCase:  boolean;
}

const GIT_SEPARATOR = '/';
const PARENT_SEGMENT = '..';
const BACKSLASHES = /\\/g;

/** The nearest existing folder is made real, so a removed worktree and its listed spelling still meet. */
function realPathOf(pathModule: typeof posix, resolvedPath: string): string {
  if (existsSync(resolvedPath)) {
    try {
      return realpathSync(resolvedPath);
    } catch {
      return resolvedPath;
    }
  }
  const parent = pathModule.dirname(resolvedPath);
  return parent === resolvedPath ? resolvedPath : pathModule.join(realPathOf(pathModule, parent), pathModule.basename(resolvedPath));
}

function gitSpellingOf(path: string): string {
  return path.replace(BACKSLASHES, GIT_SEPARATOR);
}

function foldedOf(style: GitPathStyle, path: string): string {
  return style.foldsCase ? path.toLowerCase() : path;
}

function canonicalOf(style: GitPathStyle, path: string): string {
  return foldedOf(style, gitSpellingOf(realPathOf(style.pathModule, style.pathModule.resolve(path))));
}

/** `path` relative to `folder`, `/`-separated as git prints it; `null` when it is the folder itself or lies outside it. */
function relativeInsideOf(style: GitPathStyle, folder: string, path: string): string | null {
  const relativePath = gitSpellingOf(style.pathModule.relative(canonicalOf(style, folder), canonicalOf(style, path)));
  if (relativePath === '' || style.pathModule.isAbsolute(relativePath)) return null;
  return relativePath.split(GIT_SEPARATOR)[0] === PARENT_SEGMENT ? null : relativePath;
}

export const GitPaths = Object.freeze({
  canonicalOf,
  relativeInsideOf,
});
