import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** The fields a crash log's check finds wrong; `codeVersion` and `startedAt` are checked as one. */
export type CrashLogMalformedField =
  | 'crashedGeneration' | 'component' | 'suspected' | 'classification' | 'recordedAt' | 'recordedBy' | 'crashedProcess' | 'codeVersion'
  | 'startedAt' | 'lastHeartbeat' | 'error' | 'activeJobs' | 'talosChildren' | 'logTail';

/** Why `crash-logs/crash-<number>.json` could not be read. */
export type CrashLogProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'crash-log-field-malformed'> & { readonly field: CrashLogMalformedField };
