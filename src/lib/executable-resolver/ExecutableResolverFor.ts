/** The one selector of the `ExecutableResolver` port, and the real primitives its adapters run on. */
import { realpathSync } from 'node:fs';

import { firstOnSearchPath }                                                from './ExecutableLookup.ts';
import type { ExecutableResolver }                                          from './ExecutableResolver.ts';
import { createPosixExecutableResolver, type ExecutableResolverPrimitives } from './PosixExecutableResolver.ts';

export const REAL_EXECUTABLE_RESOLVER_PRIMITIVES: ExecutableResolverPrimitives = Object.freeze({ lookUp: firstOnSearchPath, realPathOf: (path: string) => realpathSync(path) });

export function executableResolverFor(platform: string): ExecutableResolver {
  if (platform === 'darwin' || platform === 'linux') return createPosixExecutableResolver(REAL_EXECUTABLE_RESOLVER_PRIMITIVES);
  return Object.freeze<ExecutableResolver>({ absolutePathOf: () => ({ verdict: 'refused', reason: `no executable resolver exists for the platform ${platform}` }), });
}
