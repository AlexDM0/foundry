/** The `DataFolders` port: where this machine keeps what is not a tracked repository's. It depends on no other lib package. */
import type { posix } from 'node:path';

/** `no-adapter`: the platform has none; `no-drive-absolute-system-root`: Windows' `SystemRoot` is unset or names no drive-absolute folder. */
export type SystemFolderRefusalCause = 'no-adapter' | 'no-drive-absolute-system-root';

export type SystemFolderAnswer =
  | { readonly verdict: 'found'; readonly folder: string }
  | { readonly verdict: 'refused'; readonly cause: SystemFolderRefusalCause };

export interface DataFolders {
  /** A tracker under any of them is a scratch one, each compared after resolving symlinks. */
  temporaryRoots(): readonly string[];
  /** The folder a child launched with `environment` keeps its temporary files in; `null` when that environment names none. */
  temporaryFolderOf(environment: Readonly<Record<string, string>>): string | null;
  monitorFolderOf(home: string): string;
  /** The folder the platform's own programs sit in, outside any repository; refused when the machine names none. */
  systemFolder(): SystemFolderAnswer;
  readonly pathModule:               typeof posix;
  /** True when the file system compares names without case, as on Windows and macOS. */
  readonly foldsCase:                boolean;
  /** The folder names the platform's tools install executables into, such as `bin`. */
  readonly executableFolderNames:    readonly string[];
  /** The file extensions that make a file runnable by name; empty where a mode bit does. */
  readonly executableFileExtensions: readonly string[];
}
