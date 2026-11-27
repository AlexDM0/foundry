/**
 * `talos-<startNumber>.json`, a Talos's own record: created exclusively as its claim, then replaced atomically on each change of its state
 * or of the lease's standing. A reader gets a verdict, never a throw.
 */
import { JsonRecordUtil }                            from '../../lib/json-record/JsonRecordUtil.ts';
import type { ProcessIdentity }                      from '../../lib/process-identity/ProcessIdentity.ts';
import type { LeaseStanding }                        from './SupervisionLease.ts';
import { TALOS_RECORD_FORMAT_VERSION }               from './constants/TalosProtocol.ts';
import { ParsedValueUtil, type StoredRecordReading } from './utils/ParsedValueUtil.ts';

export type TalosState = 'claimed' | 'serving' | 'quitting' | 'quit';
export type TalosQuitReason = 'protocol-mismatch' | 'restart' | 'start-refused';

export interface LeaseRenewer {
  processId:    number;
  startStamp:   string;
  bootIdentity: string;
  /** The Hephaestus lock generation of the renewing Hephaestus. */
  generation:   number;
}

export interface TalosRecord {
  formatVersion:   typeof TALOS_RECORD_FORMAT_VERSION;
  startNumber:     number;
  protocolVersion: number;
  codeVersion:     string;
  talos:           ProcessIdentity | null;
  state:           TalosState;
  endpoint:        string | null;
  quitReason:      TalosQuitReason | null;
  /** Written on each change of standing, never per renewal. */
  lease:           { standing: LeaseStanding; lastRenewer: LeaseRenewer | null };
}

const TALOS_STATES = Object.keys({
  claimed: true, serving: true, quitting: true, quit: true
} satisfies Record<TalosState, true>) as readonly TalosState[];

const TALOS_QUIT_REASONS = Object.keys({ 'protocol-mismatch': true, 'restart': true, 'start-refused': true } satisfies Record<TalosQuitReason, true>) as readonly TalosQuitReason[];

const LEASE_STANDINGS = Object.keys({
  'unheld': true, 'held': true, 'waiting-after-gap': true, 'ended': true
} satisfies Record<LeaseStanding, true>) as readonly LeaseStanding[];

const { ownFieldOf, isWholeNumberAtLeast, isOneOf } = ParsedValueUtil;

/** The validator of a renewal frame's renewer and of the record's last renewer: every field well typed, or `null`. */
export function leaseRenewerOf(value: unknown): LeaseRenewer | null {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return null;
  const processId = ownFieldOf(value, 'processId');
  const startStamp = ownFieldOf(value, 'startStamp');
  const bootIdentity = ownFieldOf(value, 'bootIdentity');
  const generation = ownFieldOf(value, 'generation');
  if (!isWholeNumberAtLeast(processId, 1) || typeof startStamp !== 'string' || startStamp === '' || typeof bootIdentity !== 'string') return null;
  if (!isWholeNumberAtLeast(generation, 0)) return null;
  return {
    processId, startStamp, bootIdentity, generation
  };
}

export function talosRecordTextOf(record: TalosRecord): string {
  return ParsedValueUtil.storedTextOf(record);
}

export function talosRecordOf(text: string): StoredRecordReading<TalosRecord> {
  const reading = ParsedValueUtil.parsedObjectOf(text, TALOS_RECORD_FORMAT_VERSION);
  if (reading.verdict !== 'object') return reading;
  const field = (key: keyof TalosRecord): unknown => ownFieldOf(reading.parsed, key);
  const unreadable = (reason: string): StoredRecordReading<TalosRecord> => ({ verdict: 'unreadable', reason });
  const startNumber = field('startNumber');
  const protocolVersion = field('protocolVersion');
  const codeVersion = field('codeVersion');
  const talos = ParsedValueUtil.identityOrNullOf(field('talos'));
  const state = field('state');
  const endpoint = field('endpoint');
  const quitReason = field('quitReason');
  const storedLease = field('lease');
  if (!isWholeNumberAtLeast(startNumber, 1)) return unreadable('startNumber is not a whole number from 1');
  if (!isWholeNumberAtLeast(protocolVersion, 1)) return unreadable('protocolVersion is not a whole number from 1');
  if (typeof codeVersion !== 'string') return unreadable('codeVersion is not a string');
  if (talos === undefined) return unreadable('talos is neither null nor a process identity');
  if (!isOneOf(state, TALOS_STATES)) return unreadable('state is not a Talos state');
  if (endpoint !== null && (typeof endpoint !== 'string' || endpoint === '')) return unreadable('endpoint is neither null nor a non-empty string');
  if (quitReason !== null && !isOneOf(quitReason, TALOS_QUIT_REASONS)) return unreadable('quitReason is neither null nor a quit reason');
  if (!JsonRecordUtil.valueIsAPlainObject(storedLease)) return unreadable('lease is not an object');
  const standing = ownFieldOf(storedLease, 'standing');
  const storedRenewer = ownFieldOf(storedLease, 'lastRenewer');
  const lastRenewer = storedRenewer === null ? null : leaseRenewerOf(storedRenewer);
  if (!isOneOf(standing, LEASE_STANDINGS)) return unreadable('lease.standing is not a lease standing');
  if (storedRenewer !== null && lastRenewer === null) return unreadable('lease.lastRenewer is neither null nor a renewer');
  return {
    verdict: 'read',
    record:  {
      formatVersion: TALOS_RECORD_FORMAT_VERSION,
      startNumber,
      protocolVersion,
      codeVersion,
      talos,
      state,
      endpoint,
      quitReason,
      lease:         { standing, lastRenewer },
    },
  };
}
