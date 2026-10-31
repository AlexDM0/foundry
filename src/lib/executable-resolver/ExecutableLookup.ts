/** The platform-free lookup every adapter of the port starts from, which also serves git's one static spawn. */
import {
  basename,
  isAbsolute,
  normalize,
  relative,
  sep
} from 'node:path';

import type { ExecutableResolution } from './ExecutableResolver.ts';

export function firstOnSearchPath(name: string): string | null {
  return Bun.which(name);
}

function isInside(path: string, root: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

/**
 * Refused when the name is a path or nowhere, when a relative search folder found it (`Bun.which` joins `.` onto the working directory and answers
 * an absolute path, unnormalised), and when either the found path or what it links to sits in a forbidden root.
 */
export function resolutionOf(
  name: string,
  foundPath: string | null,
  realPathOf: (path: string) => string,
  forbiddenRoots: readonly string[],
): ExecutableResolution {
  if (basename(name) !== name) return { verdict: 'refused', reason: `${name} is a path, not a program name` };
  if (foundPath === null) return { verdict: 'refused', reason: `${name} is not on the search path` };
  if (!isAbsolute(foundPath) || normalize(foundPath) !== foundPath) return { verdict: 'refused', reason: `${name} was found relative to the working directory` };
  const forbiddenRoot = forbiddenRoots.find((root) => isInside(foundPath, root) || isInside(realPathOf(foundPath), root));
  return forbiddenRoot === undefined ? { verdict: 'found', path: foundPath } : { verdict: 'refused', reason: `${foundPath} sits inside ${forbiddenRoot}` };
}
