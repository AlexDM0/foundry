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

/** Windows compares variable names without case, so a name is only ever compared folded. */
function foldedNameOf(name: string): string {
  return name.toUpperCase();
}

const FOLDED_INHERITED_NAMES: ReadonlySet<string> = new Set(INHERITED_VARIABLE_NAMES.map(foldedNameOf));

export const WINDOWS_LAUNCH_ENVIRONMENT: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: INHERITED_VARIABLE_NAMES,
  launchEnvironmentOf:    (inherited, jobVariables) => {
    const variableByFoldedName = new Map<string, readonly [string, string]>();
    for (const [name, value] of Object.entries(inherited)) {
      if (value !== undefined && FOLDED_INHERITED_NAMES.has(foldedNameOf(name))) variableByFoldedName.set(foldedNameOf(name), [name, value]);
    }
    for (const variable of Object.entries(jobVariables)) variableByFoldedName.set(foldedNameOf(variable[0]), variable);
    return Object.fromEntries(variableByFoldedName.values());
  },
  searchFoldersOf: (environment) => {
    const searchPath = Object.entries(environment).find(([name]) => foldedNameOf(name) === SEARCH_PATH_VARIABLE)?.[1] ?? '';
    return searchPath.split(SEARCH_PATH_DELIMITER).filter((folder) => folder !== '');
  },
});
