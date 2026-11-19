/**
 * What a throw out of a drive pass is: one of the tracker lock's two expected conditions abandons the pass, which waits for the next
 * wake-up; anything else, every other refusal included, is a crash on its first occurrence.
 */
import { refusalIsOperationRefusal }                           from '../../shared/OperationRefusal.ts';
import type { AbandonedPassReason as ReasonOfAnAbandonedPass } from './@types/PresenceRecord.ts';

export type PassThrowReading =
  | { verdict: 'abandoned'; reason: ReasonOfAnAbandonedPass; detail: string }
  | { verdict: 'crash' };

const REASON_IS_AN_EXPECTED_LOCK_CONDITION = { 'tracker-lock-held': true, 'lock-taken-over': true } as const satisfies Record<ReasonOfAnAbandonedPass, true>;

function reasonOfAnAbandonedPassOrNull(kind: string): ReasonOfAnAbandonedPass | null {
  return Object.hasOwn(REASON_IS_AN_EXPECTED_LOCK_CONDITION, kind) ? kind as ReasonOfAnAbandonedPass : null;
}

function of(thrown: unknown): PassThrowReading {
  if (!refusalIsOperationRefusal(thrown) || thrown.detail === null) return { verdict: 'crash' };
  const reason = reasonOfAnAbandonedPassOrNull(thrown.detail.kind);
  return reason === null ? { verdict: 'crash' } : { verdict: 'abandoned', reason, detail: thrown.message };
}

export const AbandonedPassReason = Object.freeze({ of });
