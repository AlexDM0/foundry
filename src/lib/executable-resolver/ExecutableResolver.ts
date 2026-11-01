/** The `ExecutableResolver` port: a named program's absolute path, from `PATH` only, never in a forbidden root. It depends on no other lib package. */
export type ExecutableRefusalCause = 'not-a-program-name' | 'not-on-search-path' | 'relative-search-folder' | 'inside-forbidden-root' | 'batch-target' | 'no-adapter';

export type ExecutableResolution =
  | { readonly verdict: 'found'; readonly path: string }
  | { readonly verdict: 'refused'; readonly cause: ExecutableRefusalCause; readonly reason: string };

export interface ExecutableResolver {
  absolutePathOf(name: string, forbiddenRoots: readonly string[]): ExecutableResolution;
}
