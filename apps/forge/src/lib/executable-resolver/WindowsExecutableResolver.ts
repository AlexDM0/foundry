import { win32 } from 'node:path';

import {
  type ExecutableResolverPrimitives,
  programAtOf,
  resolutionOf,
  type ResolutionRules
} from './ExecutableLookup.ts';
import type { ExecutableResolver } from './ExecutableResolver.ts';

/** Bun throws on a batch target whose argument holds a double quote or a line feed, and cmd.exe is never the way round that. */
const WINDOWS_RESOLUTION_RULES: ResolutionRules = Object.freeze({ paths: win32, refusedTargetSuffixes: ['.cmd', '.bat'] });

export function createWindowsExecutableResolver(primitives: ExecutableResolverPrimitives): ExecutableResolver {
  return Object.freeze<ExecutableResolver>({
    absolutePathOf: (name, forbiddenRoots) => resolutionOf(name, primitives, forbiddenRoots, WINDOWS_RESOLUTION_RULES),
    programAt:      (path, forbiddenRoots) => programAtOf(path, primitives, forbiddenRoots, WINDOWS_RESOLUTION_RULES),
  });
}
