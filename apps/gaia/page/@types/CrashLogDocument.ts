/**
 * The page contract of `GET /api/v1/forges/<trackerId>/crash-logs/<number>`: one crash log of a forge that serves again, read through its
 * API when User opens it. Its active jobs and the tail of its log are `null` where the forge could not read them, never empty.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../src/shared/constants/PageContractVersions.ts';

export interface CrashLogDocumentJob {
  jobId:        string;
  kind:         string;
  ticketIds:    string[];
  state:        string;
  interruption: string | null;
  airlockPhase: string | null;
}

export interface CrashLogDocumentError {
  origin:  string;
  name:    string;
  message: string;
  stack:   string | null;
}

export interface CrashLogDocument {
  crashLogVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaCrashLog;
  number:          number;
  generation:      number | null;
  component:       'hephaestus' | 'talos' | 'unknown';
  /** A crash suspected before a reboot. */
  suspected:       boolean;
  /** Shown only. */
  recordedAt:      string;
  error:           CrashLogDocumentError | null;
  activeJobs:      CrashLogDocumentJob[] | null;
  logTail:         string[] | null;
}
