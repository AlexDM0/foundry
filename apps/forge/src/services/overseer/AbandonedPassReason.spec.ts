/**
 * The reading of a throw out of a drive pass. What matters: only the tracker lock's two expected conditions abandon a pass, each by its own
 * reason with the refusal's message as the detail; every other refusal, a Board's and an unreadable tracker's included, and a plain error
 * read as a crash, since an unexpected error in a pass is a crash on its first occurrence.
 */
import { describe, expect, test } from 'bun:test';

import { OperationRefusal }    from '../../shared/OperationRefusal.ts';
import { AbandonedPassReason } from './AbandonedPassReason.ts';

const LOCK_DIRECTORY_PATH = '/example/board/.forge/lock';

describe('AbandonedPassReason.of', () => {
  test('a held tracker lock abandons the pass with the reason tracker-lock-held and the refusal\'s message', () => {
    const refusal = new OperationRefusal('unrepaired', { kind: 'tracker-lock-held', lockDirectoryPath: LOCK_DIRECTORY_PATH });
    expect(AbandonedPassReason.of(refusal)).toEqual({ verdict: 'abandoned', reason: 'tracker-lock-held', detail: refusal.message });
  });

  test('a lock taken over abandons the pass with the reason lock-taken-over and the refusal\'s message', () => {
    const refusal = new OperationRefusal('unrepaired', { kind: 'lock-taken-over', lockDirectoryPath: LOCK_DIRECTORY_PATH });
    expect(AbandonedPassReason.of(refusal)).toEqual({ verdict: 'abandoned', reason: 'lock-taken-over', detail: refusal.message });
  });

  test('a Board\'s refusal reads as a crash', () => {
    const refusal = new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal: { reason: 'ticket-id-already-filed', ticketId: '001' } });
    expect(AbandonedPassReason.of(refusal)).toEqual({ verdict: 'crash' });
  });

  test('an unreadable tracker\'s refusal reads as a crash', () => {
    const refusal = new OperationRefusal('unrepaired', { kind: 'unreadable-tracker', reading: { verdict: 'absent', filePath: '/example/board/.forge/progress.json' } });
    expect(AbandonedPassReason.of(refusal)).toEqual({ verdict: 'crash' });
  });

  test('a plain error, a refusal with no detail and a thrown string read as a crash', () => {
    expect([new Error('example failure'), new OperationRefusal('unrepaired', 'example refusal'), 'tracker-lock-held'].map(AbandonedPassReason.of))
      .toEqual([{ verdict: 'crash' }, { verdict: 'crash' }, { verdict: 'crash' }]);
  });
});
