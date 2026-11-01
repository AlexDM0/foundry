import { posix } from 'node:path';

import { type ExecutableResolverPrimitives, resolutionOf, type ResolutionRules } from './ExecutableLookup.ts';
import type { ExecutableResolver }                                               from './ExecutableResolver.ts';

const POSIX_RESOLUTION_RULES: ResolutionRules = Object.freeze({ paths: posix, refusedTargetSuffixes: [] });

export function createPosixExecutableResolver(primitives: ExecutableResolverPrimitives): ExecutableResolver {
  return Object.freeze<ExecutableResolver>({ absolutePathOf: (name, forbiddenRoots) => resolutionOf(name, primitives, forbiddenRoots, POSIX_RESOLUTION_RULES), });
}
