/** The one selector of the `LaunchEnvironment` port; a platform with no adapter inherits nothing, so only the job's own variables reach a child. */
import type { LaunchEnvironment }         from './LaunchEnvironment.ts';
import { createPosixLaunchEnvironment }   from './PosixLaunchEnvironment.ts';
import { createWindowsLaunchEnvironment } from './WindowsLaunchEnvironment.ts';

const INHERIT_NOTHING: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: [],
  launchEnvironmentOf:    (_inherited, jobVariables) => ({ ...jobVariables }),
  searchFoldersOf:        () => [],
  withSearchFolders:      (environment) => ({ ...environment }),
});

/** `baseSearchFolders` end every search path the port makes: the system's own folders, as the `ProgramFolders` port names them. */
export function launchEnvironmentFor(platform: string, baseSearchFolders: () => readonly string[]): LaunchEnvironment {
  if (platform === 'darwin' || platform === 'linux') return createPosixLaunchEnvironment(baseSearchFolders);
  return platform === 'win32' ? createWindowsLaunchEnvironment(baseSearchFolders) : INHERIT_NOTHING;
}
