/**
 * The app-install-programs recordings: the compiler, the joiner of its builds and the signer as they answered an install on a real Mac, one
 * answer set per situation of an install. Test-only.
 */
import { recordedProcessRun, recordedSituationRunsOf, type RecordedProcessRun } from '../../../testing/RecordedRuns.ts';

export const APP_INSTALL_PROGRAMS_RECORDING_NAME = 'app-install-programs';

/**
 * `installs`: the launcher compiles for each architecture, its builds join, and the bundle is signed. `compiler-refuses`: the compiler
 * rejects a launcher source that does not compile. `signer-refuses`: the signer cannot write its signature into the staged bundle.
 */
export const APP_INSTALL_SITUATIONS = ['installs', 'compiler-refuses', 'signer-refuses'] as const;

export type AppInstallSituation = typeof APP_INSTALL_SITUATIONS[number];

export function recordedAppInstallProgramsOf(situation: AppInstallSituation): RecordedProcessRun {
  return recordedProcessRun(recordedSituationRunsOf(APP_INSTALL_PROGRAMS_RECORDING_NAME, situation));
}
