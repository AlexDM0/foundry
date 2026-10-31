/** The platform-free lookup every adapter of the port starts from, which also serves git's one static spawn. */
import { isAbsolute, relative } from 'node:path';

import type { ExecutableResolution } from './ExecutableResolver.ts';

export function firstOnSearchPath(name: string): string | null {
  return Bun.which(name);
}

function isInside(path: string, root: string): boolean {
  const fromRoot = relative(root, path);
  return !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
}

/** Refused when the name is nowhere, when the search path was relative, and when either the found path or what it links to sits in a forbidden root. */
export function resolutionOf(
  name: string,
  foundPath: string | null,
  realPathOf: (path: string) => string,
  forbiddenRoots: readonly string[],
): ExecutableResolution {
  if (foundPath === null) return { verdict: 'refused', reason: `${name} is not on the search path` };
  if (!isAbsolute(foundPath)) return { verdict: 'refused', reason: `${name} was found relative to the working directory` };
  const forbiddenRoot = forbiddenRoots.find((root) => isInside(foundPath, root) || isInside(realPathOf(foundPath), root));
  return forbiddenRoot === undefined ? { verdict: 'found', path: foundPath } : { verdict: 'refused', reason: `${foundPath} sits inside ${forbiddenRoot}` };
}
