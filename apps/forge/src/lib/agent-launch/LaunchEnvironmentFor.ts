/** The one selector of the `LaunchEnvironment` port; a platform with no adapter inherits nothing, so only the job's own variables reach a child. */
import type { LaunchEnvironment }     from './LaunchEnvironment.ts';
import { POSIX_LAUNCH_ENVIRONMENT }   from './PosixLaunchEnvironment.ts';
import { WINDOWS_LAUNCH_ENVIRONMENT } from './WindowsLaunchEnvironment.ts';

const INHERIT_NOTHING: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: [],
  launchEnvironmentOf:    (_inherited, jobVariables) => ({ ...jobVariables }),
  searchFoldersOf:        () => [],
});

export function launchEnvironmentFor(platform: string): LaunchEnvironment {
  if (platform === 'darwin' || platform === 'linux') return POSIX_LAUNCH_ENVIRONMENT;
  return platform === 'win32' ? WINDOWS_LAUNCH_ENVIRONMENT : INHERIT_NOTHING;
}
