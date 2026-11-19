/**
 * One of the forge's crash logs, from `GET /api/v1/crash-log?number=<n>`, the newest without the query (from forge 1.20). A number with no
 * log answers 404 `{refusal: 'no-crash-log', fields: {number}, text}`, a `ForgeRefusalDocument`'s code, fields and sentence (from forge
 * 1.21). It carries no version key: the path carries it.
 */
import type { ForgeCrashedComponent, ForgeStartKind } from './ForgePresenceDocument.ts';

export interface ForgeCrashLogJob {
  readonly jobId:        string;
  readonly kind:         string;
  readonly ticketIds:    readonly string[];
  readonly state:        string;
  readonly interruption: string | null;
  readonly airlockPhase: string | null;
}

export interface ForgeCrashLogDocument {
  /** The crash log's own number, the key of `?number=<n>`. */
  readonly number:     number;
  /** The Baton generation that crashed, `null` when nothing names it. */
  readonly generation: number | null;
  readonly component:  ForgeCrashedComponent;
  readonly suspected:  boolean;
  readonly recordedAt: string;
  /** `null` when the crash path wrote the log, before any start classified the crash. */
  readonly startKind:  ForgeStartKind | null;
  readonly error:      { readonly origin: string; readonly name: string; readonly message: string; readonly stack: string | null } | null;
  /** `null` when the board could not be read at the crash: an unread board is never shown as one with no jobs. */
  readonly activeJobs: readonly ForgeCrashLogJob[] | null;
  /** The last lines of the forge's log; `null` when it could not be read. */
  readonly logTail:    readonly string[] | null;
}
