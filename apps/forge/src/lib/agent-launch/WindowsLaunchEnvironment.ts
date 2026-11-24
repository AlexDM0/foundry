import { win32 } from 'node:path';

import type { LaunchEnvironment } from './LaunchEnvironment.ts';

const INHERITED_VARIABLE_NAMES = [
  'Path',
  'SystemRoot',
  'windir',
  'ComSpec',
  'PATHEXT',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'TEMP',
  'TMP',
  'USERNAME',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
] as const;
const SEARCH_PATH_VARIABLE = 'PATH';
const SEARCH_PATH_DELIMITER = ';';
const SYSTEM_ROOT_VARIABLE = 'SYSTEMROOT';
/** The folders of Windows's own programs under its system root, which every session searches after the forge's tools. */
const SYSTEM_FOLDERS_UNDER_ROOT = [['System32'], [], ['System32', 'Wbem'], ['System32', 'WindowsPowerShell', 'v1.0']] as const;

/** Windows compares variable names without case, so a name is only ever compared folded. */
function foldedNameOf(name: string): string {
  return name.toUpperCase();
}

const FOLDED_INHERITED_NAMES: ReadonlySet<string> = new Set(INHERITED_VARIABLE_NAMES.map(foldedNameOf));

export const WINDOWS_LAUNCH_ENVIRONMENT: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: INHERITED_VARIABLE_NAMES,
  launchEnvironmentOf:    (inherited, jobVariables, vendorVariableNames = []) => {
    const foldedVendorNames = new Set(vendorVariableNames.map(foldedNameOf));
    const passes = (name: string): boolean => FOLDED_INHERITED_NAMES.has(foldedNameOf(name)) || foldedVendorNames.has(foldedNameOf(name));
    const variableByFoldedName = new Map<string, readonly [string, string]>();
    for (const [name, value] of Object.entries(inherited)) {
      if (value !== undefined && passes(name)) variableByFoldedName.set(foldedNameOf(name), [name, value]);
    }
    for (const variable of Object.entries(jobVariables)) variableByFoldedName.set(foldedNameOf(variable[0]), variable);
    return Object.fromEntries(variableByFoldedName.values());
  },
  searchFoldersOf: (environment) => {
    const searchPath = Object.entries(environment).find(([name]) => foldedNameOf(name) === SEARCH_PATH_VARIABLE)?.[1] ?? '';
    return searchPath.split(SEARCH_PATH_DELIMITER).filter((folder) => folder !== '');
  },
  withSearchFolders: (environment, folders) => {
    const systemRoot = Object.entries(environment).find(([name]) => foldedNameOf(name) === SYSTEM_ROOT_VARIABLE)?.[1];
    const systemFolders = systemRoot === undefined ? [] : SYSTEM_FOLDERS_UNDER_ROOT.map((parts) => win32.join(systemRoot, ...parts));
    const kept = Object.entries(environment).filter(([name]) => foldedNameOf(name) !== SEARCH_PATH_VARIABLE);
    const searchPathName = Object.keys(environment).find((name) => foldedNameOf(name) === SEARCH_PATH_VARIABLE) ?? 'Path';
    return { ...Object.fromEntries(kept), [searchPathName]: [...new Set([...folders, ...systemFolders])].join(SEARCH_PATH_DELIMITER) };
  },
  // No folder is known where Windows installers put tools, so a tool is found there only by a path User gives.
  toolFoldersOf: () => [],
});
