import { writeFileAtomically }                     from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                            from '../../shared/utils/JsonTextUtil.ts';
import { JOB_START_FORMAT_VERSION, type JobStart } from './JobStartIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so a reader never meets half a start. */
export function createJobStartWriter(startFilePath: string): { write(start: Readonly<JobStart>): void } {
  function write(start: Readonly<JobStart>): void {
    writeFileAtomically(startFilePath, JsonTextUtil.storedFileTextOf({ version: JOB_START_FORMAT_VERSION, ...start }));
  }

  return { write };
}
