import { dirname, join } from 'node:path';

/** The `bin` beside each of a cache path's ancestors, such as `~/.bun/bin`, nearest first; never a `bin` inside the cache path. */
export function ancestorBinFoldersOf(cachePath: string): string[] {
  const ancestorBinFolders: string[] = [];
  for (let folder = dirname(cachePath); !ancestorBinFolders.includes(join(folder, 'bin')); folder = dirname(folder)) {
    ancestorBinFolders.push(join(folder, 'bin'));
  }
  return ancestorBinFolders;
}
