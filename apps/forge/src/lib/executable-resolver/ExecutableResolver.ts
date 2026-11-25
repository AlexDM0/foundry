/**
 * The `ExecutableResolver` port: a named program's absolute path, from `PATH` only, or a configured program's path as given, never in a
 * forbidden root. It depends on no other lib package.
 */
export type ExecutableRefusalCause =
  | 'not-a-program-name'
  | 'not-on-search-path'
  | 'relative-search-folder'
  | 'relative-path'
  | 'inside-forbidden-root'
  | 'batch-target'
  | 'not-there'
  | 'not-executable'
  | 'no-adapter';

export type ExecutableResolution =
  | { readonly verdict: 'found'; readonly path: string }
  | { readonly verdict: 'refused'; readonly cause: ExecutableRefusalCause; readonly reason: string };

export interface ExecutableResolver {
  absolutePathOf(name: string, forbiddenRoots: readonly string[]): ExecutableResolution;
  /** A configured program, kept as the path names it: refused when relative, inside a forbidden root, a batch target, missing or not executable. */
  programAt(path: string, forbiddenRoots: readonly string[]): ExecutableResolution;
}
