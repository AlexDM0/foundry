/** The `DataFolders` port: where this machine keeps what is not a tracked repository's. It depends on no other lib package. */
import type { posix } from 'node:path';

export interface DataFolders {
  /** A tracker under any of them is a scratch one, each compared after resolving symlinks. */
  temporaryRoots(): readonly string[];
  /** The folder a child launched with `environment` keeps its temporary files in; `null` when that environment names none. */
  temporaryFolderOf(environment: Readonly<Record<string, string>>): string | null;
  monitorFolderOf(home: string): string;
  /** The folder the platform's own programs sit in, outside any repository; throws when the machine names none. */
  systemFolder(): string;
  readonly pathModule:               typeof posix;
  /** True when the file system compares names without case, as on Windows and macOS. */
  readonly foldsCase:                boolean;
  /** The folder names the platform's tools install executables into, such as `bin`. */
  readonly executableFolderNames:    readonly string[];
  /** The file extensions that make a file runnable by name; empty where a mode bit does. */
  readonly executableFileExtensions: readonly string[];
}
