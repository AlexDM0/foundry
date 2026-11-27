/** The one selector of the `ExecutableResolver` port, and the real primitives its adapters run on. */
import {
  accessSync,
  constants,
  realpathSync,
  statSync
} from 'node:fs';
import { sep, win32 } from 'node:path';

import { type ExecutableResolverPrimitives, firstOnSearchPath, type ProgramFileKind } from './ExecutableLookup.ts';
import type { ExecutableResolver }                                                    from './ExecutableResolver.ts';
import { createPosixExecutableResolver }                                              from './PosixExecutableResolver.ts';
import { createWindowsExecutableResolver }                                            from './WindowsExecutableResolver.ts';

/** A path that does not resolve, such as a forbidden root not created yet, stands for itself. */
function realPathOrItself(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** A link is followed, so a link to a missing target is missing; Windows answers every existing file as executable. */
function programKindOf(path: string): ProgramFileKind {
  try {
    if (!statSync(path).isFile()) return 'not-executable';
  } catch {
    return 'missing';
  }
  try {
    accessSync(path, constants.X_OK);
    return 'program';
  } catch {
    return 'not-executable';
  }
}

export const REAL_EXECUTABLE_RESOLVER_PRIMITIVES: ExecutableResolverPrimitives = Object.freeze({
  lookUp:     firstOnSearchPath,
  realPathOf: realPathOrItself,
  programKindOf,
});

export function executableResolverFor(platform: string): ExecutableResolver {
  if (platform === 'darwin' || platform === 'linux') return createPosixExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
  if (platform === 'win32') return createWindowsExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
  const refusal = { verdict: 'refused', cause: 'no-adapter', platformName: platform } as const;
  return Object.freeze<ExecutableResolver>({ absolutePathOf: () => refusal, programAt: () => refusal });
}

/** For git's one static spawn, which has no context to take a port from: `node:path` already chose the host's rules, so no platform is read here. */
export function hostExecutableResolver(): ExecutableResolver {
  return sep === win32.sep ? createWindowsExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES) : createPosixExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
}
