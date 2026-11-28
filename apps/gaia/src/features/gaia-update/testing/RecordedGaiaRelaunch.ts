/** The gaia-relaunch recording: the detached start of Gaia's relaunch, as macOS's shell answered it. Test-only. */
import { recordedProcessRun, recordedRunsOf, type RecordedProcessRun } from '../../../testing/RecordedRuns.ts';
import type { GaiaRelaunchTarget }                                     from '../GaiaUpdate.ts';

export const GAIA_RELAUNCH_RECORDING_NAME = 'gaia-relaunch';

export const EXAMPLE_RELAUNCH_TARGET: GaiaRelaunchTarget = { appBundlePath: '/Users/example/Applications/Gaia.app', launcherProcessId: 4242 };

export function recordedGaiaRelaunchRun(): RecordedProcessRun {
  return recordedProcessRun(recordedRunsOf(GAIA_RELAUNCH_RECORDING_NAME));
}
