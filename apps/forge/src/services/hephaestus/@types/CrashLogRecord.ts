import type { CrashLogError, CrashLogJob, CrashLogRecord } from '../../../adapters/crash-log/@types/CrashLogRecord.ts';
import type { HeartbeatRecord }                            from '../../../adapters/heartbeat/@types/HeartbeatRecord.ts';
import type { PresenceRecord }                             from '../../../adapters/presence/@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                 from '../../../adapters/presence/@types/StartClassificationVerdict.ts';
import type { ProcessIdentity }                            from '../../../lib/process-identity/ProcessIdentity.ts';

/** The plain values a crash log is assembled from; reading them is the caller's, and one that could not be read is `null`. */
export interface CrashLogInputs {
  crashedGeneration:    number | null;
  component:            CrashLogRecord['component'];
  suspected:            boolean;
  classification:       StartClassificationVerdict | null;
  recordedAt:           string;
  recordedBy:           CrashLogRecord['recordedBy'];
  error:                CrashLogError | null;
  presence:             PresenceRecord | null;
  /** The holder named by the crashed generation's dead Hephaestus lock: the crashed process when no presence record names it. */
  hephaestusLockHolder: ProcessIdentity | null;
  heartbeat:            HeartbeatRecord | null;
  activeJobs:           CrashLogJob[] | null;
  talosChildren:        unknown[] | null;
  logTail:              string[] | null;
}

/** Where a crash's log stands: written now under a new number, or already written, by the crash path or an earlier start, under that number. */
export type CrashLogWrite = { verdict: 'written' | 'already-written'; crashLogNumber: number };
