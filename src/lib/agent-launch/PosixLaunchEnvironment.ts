import type { LaunchEnvironment } from './LaunchEnvironment.ts';

const INHERITED_VARIABLE_NAMES = ['HOME', 'PATH', 'USER', 'LANG', 'TMPDIR'] as const;
const SEARCH_PATH_VARIABLE = 'PATH';
const SEARCH_PATH_SEPARATOR = ':';

export const POSIX_LAUNCH_ENVIRONMENT: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: INHERITED_VARIABLE_NAMES,
  launchEnvironmentOf:    (inherited, jobVariables) => {
    const environment: Record<string, string> = {};
    for (const name of INHERITED_VARIABLE_NAMES) {
      const value = Object.hasOwn(inherited, name) ? inherited[name] : undefined;
      if (value !== undefined) environment[name] = value;
    }
    return { ...environment, ...jobVariables };
  },
  searchFoldersOf: (environment) => (environment[SEARCH_PATH_VARIABLE] ?? '').split(SEARCH_PATH_SEPARATOR).filter((folder) => folder !== ''),
});
