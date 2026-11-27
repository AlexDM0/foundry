/**
 * The `ExecutableResolver` port: a named program's absolute path, from `PATH` only, or a configured program's path as given, never in a
 * forbidden root. It depends on no other lib package.
 */

/** Why a program is refused, as a cause and the name or path it is about; a caller words it. */
export type ExecutableRefusal =
  | { readonly cause: 'not-a-program-name' | 'not-on-search-path' | 'relative-search-folder'; readonly name: string }
  | { readonly cause: 'relative-path' | 'batch-target' | 'not-there' | 'not-executable'; readonly path: string }
  | { readonly cause: 'inside-forbidden-root'; readonly path: string; readonly forbiddenRoot: string }
  | { readonly cause: 'no-adapter'; readonly platformName: string };

export type ExecutableResolution =
  | { readonly verdict: 'found'; readonly path: string }
  | ({ readonly verdict: 'refused' } & ExecutableRefusal);

export type ExecutableRefusalCause = ExecutableRefusal['cause'];

export interface ExecutableResolver {
  absolutePathOf(name: string, forbiddenRoots: readonly string[]): ExecutableResolution;
  /** A configured program, kept as the path names it: refused when relative, inside a forbidden root, a batch target, missing or not executable. */
  programAt(path: string, forbiddenRoots: readonly string[]): ExecutableResolution;
}
