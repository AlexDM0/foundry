import { createWholeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation }    from '../../lib/atomic-file/FileReplace.ts';
import { JsonTextUtil }              from '../../shared/utils/JsonTextUtil.ts';
import type { CrashLogRecord }       from './@types/CrashLogRecord.ts';
import { CRASH_LOG_FORMAT_VERSION }  from './constants/CrashLogFileVersions.ts';

/** Created exclusively and whole, never rewritten: a racing second writer of the same number finds the first log whole and is told so. */
export function createCrashLogWriter(crashLogFilePath: string): { create(record: CrashLogRecord): ExclusiveCreation } {
  function create(record: CrashLogRecord): ExclusiveCreation {
    return createWholeFileAtomically(crashLogFilePath, JsonTextUtil.storedFileTextOf({ ...record, crashLogVersion: CRASH_LOG_FORMAT_VERSION }));
  }
  return { create };
}
