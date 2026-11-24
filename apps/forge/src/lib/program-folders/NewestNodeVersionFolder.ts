/** nvm's newest installed node, which stands for its current one: only a shell that sourced nvm knows that one. */
import { readdirSync } from 'node:fs';
import { posix }       from 'node:path';

const NODE_VERSIONS_FOLDER = ['.nvm', 'versions', 'node'] as const;
const NODE_VERSION_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const EXECUTABLE_FOLDER_NAME = 'bin';

function versionPartsOf(folderName: string): number[] | null {
  const match = NODE_VERSION_PATTERN.exec(folderName);
  return match === null ? null : match.slice(1).map(Number);
}

function newerVersionFirst(a: readonly number[], b: readonly number[]): number {
  const differingIndex = a.findIndex((part, i) => part !== b[i]);
  return differingIndex === -1 ? 0 : (b[differingIndex] ?? 0) - (a[differingIndex] ?? 0);
}

export function newestNodeVersionFoldersOf(homeDirectory: string): string[] {
  const versionsFolder = posix.join(homeDirectory, ...NODE_VERSIONS_FOLDER);
  let folderNames: string[];
  try {
    folderNames = readdirSync(versionsFolder);
  } catch {
    return [];
  }
  const versions = folderNames.flatMap((folderName) => {
    const parts = versionPartsOf(folderName);
    return parts === null ? [] : [{ folderName, parts }];
  });
  const [newest] = versions.sort((a, b) => newerVersionFirst(a.parts, b.parts));
  return newest === undefined ? [] : [posix.join(versionsFolder, newest.folderName, EXECUTABLE_FOLDER_NAME)];
}
