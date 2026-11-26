import type { PresenceRecord }           from '../../../adapters/presence/@types/PresenceRecord.ts';
import type { HEARTBEAT_FORMAT_VERSION } from '../constants/PresenceLimits.ts';

/** An ending as its writer names it; the time is handed beside it. */
export type PresenceEndingToWrite =
  | { kind: 'stopped' | 'handed-over' }
  | { kind: 'crashed'; component: 'hephaestus' | 'talos'; crashLogNumber: number | null };

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

/** `read` is stored as a start classification's `presence` evidence, so a service's reading keeps it. */
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
