/** The platform-free lookup every adapter of the port starts from. */
import { parse } from 'node:path';

import type { ExecutableResolution } from './ExecutableResolver.ts';

/** What a path holds: a program this user may run, a file or folder that is not one, or nothing. */
export type ProgramFileKind = 'program' | 'not-executable' | 'missing';

export interface ExecutableResolverPrimitives {
  readonly lookUp:        (name: string) => string | null;
  readonly realPathOf:    (path: string) => string;
  readonly programKindOf: (path: string) => ProgramFileKind;
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

function forbiddenRootHolding(
  path: string,
  { paths }: ResolutionRules,
  realPathOf: ExecutableResolverPrimitives['realPathOf'],
  forbiddenRoots: readonly string[],
): string | undefined {
  const realPath = realPathOf(path);
  const liesInside = (root: string): boolean => isInside(paths, path, root) || isInside(paths, realPath, root);
  return forbiddenRoots.find((root) => liesInside(root) || liesInside(realPathOf(root)));
}

function hasRefusedSuffix(path: string, { refusedTargetSuffixes }: ResolutionRules): boolean {
  const foldedPath = path.toLowerCase();
  return refusedTargetSuffixes.some((suffix) => foldedPath.endsWith(suffix));
}

const BATCH_TARGET_REASON = 'is a batch file, which takes no quoted or multi-line argument';

/**
 * Refused when the name is a path or nowhere, when the answer is relative, when the found path or what it links to sits in a forbidden root or what
 * it links from does, and when the found path has a refused suffix. An absolute answer is spawned as PATH spells it: normalising `link/..` would
 * name another file.
 */
export function resolutionOf(
  name: string,
  { lookUp, realPathOf }: ExecutableResolverPrimitives,
  forbiddenRoots: readonly string[],
  rules: ResolutionRules,
): ExecutableResolution {
  const { paths } = rules;
  if (paths.basename(name) !== name) return { verdict: 'refused', cause: 'not-a-program-name', reason: `${name} is a path, not a program name` };
  const foundPath = lookUp(name);
  if (foundPath === null) return { verdict: 'refused', cause: 'not-on-search-path', reason: `${name} is not on the search path` };
  if (!paths.isAbsolute(foundPath)) return { verdict: 'refused', cause: 'relative-search-folder', reason: `${name} was found relative to the working directory` };
  const forbiddenRoot = forbiddenRootHolding(foundPath, rules, realPathOf, forbiddenRoots);
  if (forbiddenRoot !== undefined) return { verdict: 'refused', cause: 'inside-forbidden-root', reason: `${foundPath} sits inside ${forbiddenRoot}` };
  if (hasRefusedSuffix(foundPath, rules)) return { verdict: 'refused', cause: 'batch-target', reason: `${foundPath} ${BATCH_TARGET_REASON}` };
  return { verdict: 'found', path: foundPath };
}

/** A configured program is spawned as its path spells it, a link included, so an update behind the link keeps working. */
export function programAtOf(
  path: string,
  { realPathOf, programKindOf }: ExecutableResolverPrimitives,
  forbiddenRoots: readonly string[],
  rules: ResolutionRules,
): ExecutableResolution {
  if (!rules.paths.isAbsolute(path)) return { verdict: 'refused', cause: 'relative-path', reason: `${path} is not an absolute path` };
  const forbiddenRoot = forbiddenRootHolding(path, rules, realPathOf, forbiddenRoots);
  if (forbiddenRoot !== undefined) return { verdict: 'refused', cause: 'inside-forbidden-root', reason: `${path} sits inside ${forbiddenRoot}` };
  if (hasRefusedSuffix(path, rules)) return { verdict: 'refused', cause: 'batch-target', reason: `${path} ${BATCH_TARGET_REASON}` };
  const kind = programKindOf(path);
  if (kind === 'missing') return { verdict: 'refused', cause: 'not-there', reason: `${path} is not there` };
  if (kind === 'not-executable') return { verdict: 'refused', cause: 'not-executable', reason: `${path} is not a program this user may run` };
  return { verdict: 'found', path };
}
