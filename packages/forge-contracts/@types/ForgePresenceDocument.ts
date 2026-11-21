/**
 * The forge's presence, from `GET /api/v1/presence` (from forge 1.20): its last start, whether Talos still supervises its agents, the work
 * that waits by cause, the merges an `interrupted:` hold keeps, its crash logs, and from 1.23 the running Talos. It carries no version key:
 * the path carries it.
 */
import type { MonitorInterruptionCause } from './MonitorSnapshotDocument.ts';

export type ForgeStartKind = 'first-start' | 'handover' | 'stopped-on-purpose' | 'machine-went-down' | 'crashed';

export type ForgeStartOrigin = 'user' | 'successor';

/** Talos's lease standing in presence's words: `no-talos` when no live Talos has a readable record. */
export type ForgeSupervision = 'supervising' | 'stopped' | 'checking-after-a-gap' | 'not-yet-renewed' | 'no-talos';

/** `nothing` is a job that resumes by itself at the next pass; `never` one no resume restarts. */
export type ForgeInterruptedWorkWait = 'instruction' | 'answer' | 'decision' | 'nothing' | 'never';

/** `hephaestus` is the forge's own process, the one that serves this document. */
export type ForgeCrashedComponent = 'hephaestus' | 'talos' | 'unknown';

export interface ForgeLastStart {
  readonly kind:               ForgeStartKind;
  readonly previousGeneration: number | null;
  readonly crashSuspected:     boolean;
  /** The crash log this start wrote or found, `null` when the start followed no crash. */
  readonly crashLogNumber:     number | null;
}

export interface ForgeInterruptedWork {
  readonly jobId:                 string;
  readonly kind:                  string;
  readonly ticketIds:             readonly string[];
  readonly cause:                 MonitorInterruptionCause;
  readonly waitsFor:              ForgeInterruptedWorkWait;
  readonly crashResumes:          number;
  /** `null` for a cause that is never counted. */
  readonly automaticRestartsLeft: number | null;
}

export interface ForgeCrashLogEntry {
  readonly number:     number;
  /** The Baton generation that crashed, `null` when nothing names it. */
  readonly generation: number | null;
  readonly component:  ForgeCrashedComponent;
  readonly recordedAt: string;
  readonly suspected:  boolean;
}

/** The Talos that runs: its protocol version, the code version of the program it started from, and its start number. */
export interface ForgeRunningTalos {
  readonly protocolVersion: number;
  readonly codeVersion:     string;
  readonly startNumber:     number;
}

export interface ForgePresenceDocument {
  readonly generation:      number;
  readonly processId:       number;
  readonly codeVersion:     string;
  readonly startedAt:       string;
  readonly startOrigin:     ForgeStartOrigin;
  readonly lastStart:       ForgeLastStart;
  readonly heartbeat:       { readonly sequence: number; readonly at: string } | null;
  readonly supervision:     ForgeSupervision;
  readonly abandonedPasses: { readonly inARow: number; readonly lastReason: string | null; readonly lastAt: string | null };
  readonly interruptedWork: readonly ForgeInterruptedWork[];
  readonly heldMerges:      readonly { readonly ticketId: string; readonly hold: string }[];
  /** Oldest first, by number. */
  readonly crashLogs:       readonly ForgeCrashLogEntry[];
  /** `null` when no live Talos has a readable record that has not quit. From forge 1.23. */
  readonly talos:           ForgeRunningTalos | null;
}
