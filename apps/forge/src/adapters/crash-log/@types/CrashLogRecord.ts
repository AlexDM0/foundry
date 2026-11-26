import type { ProcessIdentity }            from '../../../lib/process-identity/ProcessIdentity.ts';
import type { StartOrigin }                from '../../../lib/tracker-model/@types/Job.ts';
import type { StartClassificationVerdict } from '../../presence/@types/StartClassificationVerdict.ts';
import type { CRASH_LOG_FORMAT_VERSION }   from '../constants/CrashLogFileVersions.ts';

export type CrashedComponent = 'hephaestus' | 'talos';

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

/** `crash-logs/crash-<number>.json`, created exclusively and never rewritten; its number is the file's, never the Hephaestus lock generation. */
export interface CrashLogRecord {
  crashLogVersion:   typeof CRASH_LOG_FORMAT_VERSION;
  /** The Hephaestus lock generation that crashed; `null` when neither a presence record nor a Hephaestus lock names it. */
  crashedGeneration: number | null;
  component:         CrashedComponent | 'unknown';
  /** True for a crash suspected before a reboot. */
  suspected:         boolean;
  /** `null` when the crash path wrote it. */
  classification:    StartClassificationVerdict | null;
  recordedAt:        string;
  recordedBy:        { generation: number | null; startOrigin: StartOrigin | null; crashPath: boolean };
  /** The process of the crashed generation, from its presence record or else its dead lock; with the generation, it tells one crash from another. */
  crashedProcess:    ProcessIdentity | null;
  codeVersion:       string | null;
  startedAt:         string | null;
  lastHeartbeat:     { sequence: number; at: string } | null;
  error:             CrashLogError | null;
  /** `null` when the board could not be read: an unread board is never shown as one with no jobs. */
  activeJobs:        CrashLogJob[] | null;
  /** Talos's persisted child records, copied as stored; `null` when they could not be read. */
  talosChildren:     unknown[] | null;
  /** The last lines of `hephaestus.log`; `null` when it could not be read. */
  logTail:           string[] | null;
}
