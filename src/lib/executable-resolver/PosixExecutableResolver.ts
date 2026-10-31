import { resolutionOf }            from './ExecutableLookup.ts';
import type { ExecutableResolver } from './ExecutableResolver.ts';

export interface ExecutableResolverPrimitives {
  readonly lookUp:     (name: string) => string | null;
  readonly realPathOf: (path: string) => string;
}

export function createPosixExecutableResolver({ lookUp, realPathOf }: ExecutableResolverPrimitives): ExecutableResolver {
  return Object.freeze<ExecutableResolver>({ absolutePathOf: (name, forbiddenRoots) => resolutionOf(name, lookUp(name), realPathOf, forbiddenRoots), });
}
