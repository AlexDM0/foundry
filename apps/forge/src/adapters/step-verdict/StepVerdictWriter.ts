import { writeFileAtomically }                           from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                  from '../../shared/utils/JsonTextUtil.ts';
import { STEP_VERDICT_FORMAT_VERSION, type StepVerdict } from './StepVerdictIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so a later read of the run never meets half a verdict. */
export function createStepVerdictWriter(verdictFilePath: string): { write(stepVerdict: Readonly<StepVerdict>): void } {
  function write(stepVerdict: Readonly<StepVerdict>): void {
    writeFileAtomically(verdictFilePath, JsonTextUtil.storedFileTextOf({ version: STEP_VERDICT_FORMAT_VERSION, ...stepVerdict }));
  }

  return { write };
}
