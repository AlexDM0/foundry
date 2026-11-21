import type { ProcessIdentity }                                   from '../../../lib/process-identity/ProcessIdentity.ts';
import type { StartOrigin }                                       from '../../../lib/tracker-model/@types/Job.ts';
import type { HEARTBEAT_FORMAT_VERSION, PRESENCE_FORMAT_VERSION } from '../constants/PresenceLimits.ts';
import type { StartClassificationVerdict }                        from './StartClassification.ts';

export type AbandonedPassReason = 'tracker-lock-held' | 'lock-taken-over';

/** A `crashed` ending names its crash log's number, `null` when the crash path could not write the log. */
export type PresenceEnding =
  | { kind: 'stopped' | 'handed-over'; at: string }
  | { kind: 'crashed'; component: 'hephaestus' | 'talos'; crashLogNumber: number | null; at: string };

/** An ending as its writer names it; the time is handed beside it. */
export type PresenceEndingToWrite =
  | { kind: 'stopped' | 'handed-over' }
  | { kind: 'crashed'; component: 'hephaestus' | 'talos'; crashLogNumber: number | null };

/** `presence.json`, written whole and atomically by the main thread only. */
export interface PresenceRecord {
  presenceVersion:     typeof PRESENCE_FORMAT_VERSION;
  /** The Baton generation this record describes. */
  generation:          number;
  process:             ProcessIdentity;
  codeVersion:         string;
  startOrigin:         StartOrigin;
  /** Local ISO time, shown only. */
  startedAt:           string;
  /** `null` until the start gate hands its classification in. */
  startClassification: StartClassificationVerdict | null;
  abandonedPasses:     {
    inARow: number;
    last:   { reason: AbandonedPassReason; detail: string; at: string } | null;
  };
  ending: PresenceEnding | null;
}

/** `heartbeat.json`, written whole and atomically at each renewal Talos confirmed. */
export interface HeartbeatRecord {
  heartbeatVersion: typeof HEARTBEAT_FORMAT_VERSION;
  generation:       number;
  /** From 1, one up on each beat of the generation. */
  sequence:         number;
  /** Local ISO time of the beat. */
  at:               string;
}

/** What a start writes; the abandoned passes start at none and the ending is still to come. */
export type PresenceStart = Omit<PresenceRecord, 'presenceVersion' | 'abandonedPasses' | 'ending'>;

export type PresenceFileReading<StoredRecord> =
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string }
  | { verdict: 'read'; record: StoredRecord };

/** A change of a generation's record: a newer generation's record, or one that cannot be read, is never touched. */
export type PresenceUpdate =
  | { verdict: 'written'; record: PresenceRecord }
  | { verdict: 'unchanged' }
  | { verdict: 'not-this-generation'; storedGeneration: number }
  | { verdict: 'no-record'; reading: Exclude<PresenceFileReading<PresenceRecord>, { verdict: 'read' }> };

export type HeartbeatWrite =
  | { verdict: 'written'; record: HeartbeatRecord }
  | { verdict: 'newer-generation-beats'; storedGeneration: number };
