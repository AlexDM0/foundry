/** The path-chooser recording as a process-run mock: the folder chooser answered with a folder, the file chooser cancelled. Test-only. */
import { recordedProcessRun, recordedRunsOf, type RecordedProcessRun } from '../../../testing/RecordedRuns.ts';

export const RECORDING_NAME_OF_PATH_CHOOSER = 'path-chooser';

/** The folder the recording holds as chosen, as PathChooser answers it. */
export const RECORDED_CHOSEN_FOLDER = '/Users/example/Development/example-storefront';

export function recordedPathChooserRun(): RecordedProcessRun {
  return recordedProcessRun(recordedRunsOf(RECORDING_NAME_OF_PATH_CHOOSER));
}
