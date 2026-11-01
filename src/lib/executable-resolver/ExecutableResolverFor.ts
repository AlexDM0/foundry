/** The one selector of the `ExecutableResolver` port, and the real primitives its adapters run on. */
import { realpathSync } from 'node:fs';
import { sep, win32 }   from 'node:path';

import { type ExecutableResolverPrimitives, firstOnSearchPath } from './ExecutableLookup.ts';
import type { ExecutableResolver }                              from './ExecutableResolver.ts';
import { createPosixExecutableResolver }                        from './PosixExecutableResolver.ts';
import { createWindowsExecutableResolver }                      from './WindowsExecutableResolver.ts';

/** A path that does not resolve, such as a forbidden root not created yet, stands for itself. */
function realPathOrItself(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export const REAL_EXECUTABLE_RESOLVER_PRIMITIVES: ExecutableResolverPrimitives = Object.freeze({ lookUp: firstOnSearchPath, realPathOf: realPathOrItself });

export function executableResolverFor(platform: string): ExecutableResolver {
  if (platform === 'darwin' || platform === 'linux') return createPosixExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
  if (platform === 'win32') return createWindowsExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
  const reason = `no executable resolver exists for the platform ${platform}`;
  return Object.freeze<ExecutableResolver>({ absolutePathOf: () => ({ verdict: 'refused', cause: 'no-adapter', reason }), });
}

/** For git's one static spawn, which has no context to take a port from: `node:path` already chose the host's rules, so no platform is read here. */
export function hostExecutableResolver(): ExecutableResolver {
  return sep === win32.sep ? createWindowsExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES) : createPosixExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
}
