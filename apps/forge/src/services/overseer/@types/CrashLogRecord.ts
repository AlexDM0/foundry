import type { ProcessIdentity }                 from '../../../lib/process-identity/ProcessIdentity.ts';
import type { StartOrigin }                     from '../../../lib/tracker-model/@types/Job.ts';
import type { CRASH_LOG_FORMAT_VERSION }        from '../constants/PresenceLimits.ts';
import type { HeartbeatRecord, PresenceRecord } from './PresenceRecord.ts';
import type { StartClassificationVerdict }      from './StartClassification.ts';

export type CrashedComponent = 'overseer' | 'talos';

/** Where the crash was seen: a pass that threw, the process's own listeners, or a Talos found lost while serving. */
export type CrashErrorOrigin = 'pass' | 'uncaught-exception' | 'unhandled-rejection' | 'talos-lost';

export interface CrashLogError {
  origin:  CrashErrorOrigin;
  name:    string;
  message: string;
  stack:   string | null;
}

/** A live job as the crash found it on the board. */
export interface CrashLogJob {
  jobId:         string;
  kind:          string;
  role:          string | null;
  ticketIds:     string[];
  state:         string;
  interruption:  string | null;
  instance:      number;
  airlockPhase:  string | null;
  eventSequence: number;
}

/** `crash-logs/crash-<generation>.json`, created exclusively and never rewritten. */
export interface CrashLogRecord {
  crashLogVersion:   typeof CRASH_LOG_FORMAT_VERSION;
  crashedGeneration: number;
  component:         CrashedComponent | 'unknown';
  /** True for a crash suspected before a reboot. */
  suspected:         boolean;
  /** `null` when the crash path wrote it. */
  classification:    StartClassificationVerdict | null;
  recordedAt:        string;
  recordedBy:        { generation: number | null; startOrigin: StartOrigin | null; crashPath: boolean };
  crashedProcess:    ProcessIdentity | null;
  codeVersion:       string | null;
  startedAt:         string | null;
  lastHeartbeat:     { sequence: number; at: string } | null;
  error:             CrashLogError | null;
  /** `null` when the board could not be read: an unread board is never shown as one with no jobs. */
  activeJobs:        CrashLogJob[] | null;
  /** Talos's persisted child records, copied as stored; `null` when they could not be read. */
  talosChildren:     unknown[] | null;
  /** The last lines of `overseer.log`; `null` when it could not be read. */
  logTail:           string[] | null;
}

/** The plain values a crash log is assembled from; reading them is the caller's, and one that could not be read is `null`. */
export interface CrashLogInputs {
  crashedGeneration: number;
  component:         CrashLogRecord['component'];
  suspected:         boolean;
  classification:    StartClassificationVerdict | null;
  recordedAt:        string;
  recordedBy:        CrashLogRecord['recordedBy'];
  error:             CrashLogError | null;
  presence:          PresenceRecord | null;
  heartbeat:         HeartbeatRecord | null;
  activeJobs:        CrashLogJob[] | null;
  talosChildren:     unknown[] | null;
  logTail:           string[] | null;
}
