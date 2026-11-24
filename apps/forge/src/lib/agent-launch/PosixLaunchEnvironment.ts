import { readdirSync } from 'node:fs';
import { join }        from 'node:path';

import type { LaunchEnvironment } from './LaunchEnvironment.ts';

const INHERITED_VARIABLE_NAMES = ['HOME', 'PATH', 'USER', 'LANG', 'TMPDIR'] as const;

const SEARCH_PATH_VARIABLE = 'PATH';
const SEARCH_PATH_SEPARATOR = ':';

/** What every session searches after the forge's own tools: the folders of the system's programs. */
const SYSTEM_SEARCH_FOLDERS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'] as const;

const HOME_TOOL_FOLDERS = [['.bun', 'bin'], ['.local', 'bin']] as const;
const SYSTEM_TOOL_FOLDERS = ['/opt/homebrew/bin', '/usr/local/bin'] as const;
const NODE_VERSIONS_FOLDER = ['.nvm', 'versions', 'node'] as const;
const NODE_VERSION_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;

function versionPartsOf(folderName: string): number[] | null {
  const match = NODE_VERSION_PATTERN.exec(folderName);
  return match === null ? null : match.slice(1).map(Number);
}

function newerVersionFirst(a: readonly number[], b: readonly number[]): number {
  const differingIndex = a.findIndex((part, i) => part !== b[i]);
  return differingIndex === -1 ? 0 : (b[differingIndex] ?? 0) - (a[differingIndex] ?? 0);
}

/** nvm's newest installed node stands for its current one, which only a shell that sourced nvm knows. */
function newestNodeFolderOf(homeDirectory: string): string[] {
  const versionsFolder = join(homeDirectory, ...NODE_VERSIONS_FOLDER);
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
  return newest === undefined ? [] : [join(versionsFolder, newest.folderName, 'bin')];
}

export const POSIX_LAUNCH_ENVIRONMENT: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: INHERITED_VARIABLE_NAMES,
  launchEnvironmentOf:    (inherited, jobVariables, vendorVariableNames = []) => {
    const environment: Record<string, string> = {};
    for (const name of [...INHERITED_VARIABLE_NAMES, ...vendorVariableNames]) {
      const value = Object.hasOwn(inherited, name) ? inherited[name] : undefined;
      if (value !== undefined) environment[name] = value;
    }
    return { ...environment, ...jobVariables };
  },
  searchFoldersOf:   (environment) => (environment[SEARCH_PATH_VARIABLE] ?? '').split(SEARCH_PATH_SEPARATOR).filter((folder) => folder !== ''),
  withSearchFolders: (environment, folders) => ({
    ...environment,
    [SEARCH_PATH_VARIABLE]: [...new Set([...folders, ...SYSTEM_SEARCH_FOLDERS])].join(SEARCH_PATH_SEPARATOR),
  }),
  toolFoldersOf: (homeDirectory) => [
    join(homeDirectory, ...HOME_TOOL_FOLDERS[0]),
    ...SYSTEM_TOOL_FOLDERS,
    join(homeDirectory, ...HOME_TOOL_FOLDERS[1]),
    ...newestNodeFolderOf(homeDirectory),
    ...SYSTEM_SEARCH_FOLDERS,
  ],
});
