/** The one selector of the `LaunchEnvironment` port; a platform with no adapter inherits nothing, so only the job's own variables reach a child. */
import type { LaunchEnvironment }   from './LaunchEnvironment.ts';
import { POSIX_LAUNCH_ENVIRONMENT } from './PosixLaunchEnvironment.ts';

const INHERIT_NOTHING: LaunchEnvironment = Object.freeze<LaunchEnvironment>({
  inheritedVariableNames: [],
  launchEnvironmentOf:    (_inherited, jobVariables) => ({ ...jobVariables }),
  searchFoldersOf:        () => [],
});

export function launchEnvironmentFor(platform: string): LaunchEnvironment {
  return platform === 'darwin' || platform === 'linux' ? POSIX_LAUNCH_ENVIRONMENT : INHERIT_NOTHING;
}
