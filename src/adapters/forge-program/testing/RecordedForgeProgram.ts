/**
 * The forge-program recordings: the example program path every call shape is keyed by, in place of the path of the forge that was run,
 * and the answer set of each stage. Test-only.
 */
import { recordedProcessRun, recordedRunsOf, type RecordedProcessRun } from '../../../testing/RecordedRuns.ts';

export const EXAMPLE_FORGE_PROGRAM_PATH = '/Users/example/.bun/bin/forge';
export const MISSING_FORGE_PROGRAM_PATH = '/Users/example/.bun/bin/missing-forge';

/**
 * `forge-before-versioned-answers`: recorded from a forge checkout that does not answer F8 yet. `every-verb-done` and `every-verb-refused`:
 * authored from F8 until the forge serves it.
 */
export type ForgeProgramStage = 'forge-before-versioned-answers' | 'every-verb-done' | 'every-verb-refused';

export const RECORDING_NAME_OF_FORGE_PROGRAM_STAGE: Readonly<Record<ForgeProgramStage, string>> = {
  'forge-before-versioned-answers': 'forge-program',
  'every-verb-done':                'forge-program-done',
  'every-verb-refused':             'forge-program-refused',
};

export function recordedForgeProgramRunOf(stage: ForgeProgramStage): RecordedProcessRun {
  return recordedProcessRun(recordedRunsOf(RECORDING_NAME_OF_FORGE_PROGRAM_STAGE[stage]));
}
