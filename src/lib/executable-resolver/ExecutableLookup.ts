/** The platform-free lookup every adapter of the port starts from. */
import { parse } from 'node:path';

import type { ExecutableResolution } from './ExecutableResolver.ts';

export interface ExecutableResolverPrimitives {
  readonly lookUp:     (name: string) => string | null;
  readonly realPathOf: (path: string) => string;
}

/** What `node:path` answers for one platform, whichever host runs it. */
interface PlatformPaths {
  readonly sep: string;
  basename(path: string): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
}

export interface ResolutionRules {
  readonly paths:                 PlatformPaths;
  readonly refusedTargetSuffixes: readonly string[];
}

/** `Bun.which` joins a relative search folder onto `cwd`, the process's own unless named, so it is named as a folder no repository is. */
export function firstOnSearchPath(name: string): string | null {
  return Bun.which(name, { cwd: parse(import.meta.dir).root });
}

function isInside(paths: ResolutionRules['paths'], path: string, root: string): boolean {
  const fromRoot = paths.relative(root, path);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${paths.sep}`) && !paths.isAbsolute(fromRoot);
}

/**
 * Refused when the name is a path or nowhere, when the answer is relative, when the found path or what it links to sits in a forbidden root or what
 * it links from does, and when the found path has a refused suffix. An absolute answer is spawned as PATH spells it: normalising `link/..` would
 * name another file.
 */
export function resolutionOf(
  name: string,
  { lookUp, realPathOf }: ExecutableResolverPrimitives,
  forbiddenRoots: readonly string[],
  { paths, refusedTargetSuffixes }: ResolutionRules,
): ExecutableResolution {
  if (paths.basename(name) !== name) return { verdict: 'refused', cause: 'not-a-program-name', reason: `${name} is a path, not a program name` };
  const foundPath = lookUp(name);
  if (foundPath === null) return { verdict: 'refused', cause: 'not-on-search-path', reason: `${name} is not on the search path` };
  if (!paths.isAbsolute(foundPath)) return { verdict: 'refused', cause: 'relative-search-folder', reason: `${name} was found relative to the working directory` };
  const realFoundPath = realPathOf(foundPath);
  const liesInside = (root: string): boolean => isInside(paths, foundPath, root) || isInside(paths, realFoundPath, root);
  const forbiddenRoot = forbiddenRoots.find((root) => liesInside(root) || liesInside(realPathOf(root)));
  if (forbiddenRoot !== undefined) return { verdict: 'refused', cause: 'inside-forbidden-root', reason: `${foundPath} sits inside ${forbiddenRoot}` };
  const foldedPath = foundPath.toLowerCase();
  if (refusedTargetSuffixes.some((suffix) => foldedPath.endsWith(suffix))) {
    return { verdict: 'refused', cause: 'batch-target', reason: `${foundPath} is a batch file, which takes no quoted or multi-line argument` };
  }
  return { verdict: 'found', path: foundPath };
}
