/** The `DataFolders` port: where this machine keeps what is not a tracked repository's. It depends on no other lib package. */
import type { posix } from 'node:path';

export interface DataFolders {
  /** A tracker under any of them is a scratch one, each compared after resolving symlinks. */
  temporaryRoots(): readonly string[];
  monitorFolderOf(home: string): string;
  /** The folder the platform's own programs sit in, outside any repository. */
  systemFolder(): string;
  readonly pathModule: typeof posix;
}
