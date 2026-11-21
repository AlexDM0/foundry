/**
 * What the merge-queue habitat cues between two payloads (`docs/design/board.md`, "Flint's habitats on the board views", `merge-queue`). What matters:
 * each row of the table is cued from its change, once, and not from a fact that only stays; a holder that changes phase, a candidate that joins already
 * conflicting and a candidate that leaves are no change; a prediction waiting for merge counts as one in the order; and several changes come in the order
 * of the table.
 */
import { describe, expect, test } from 'bun:test';

import type { MergeQueueLine, WaitingForMergeLine }    from './MergeQueueModel.ts';
import { MergeQueueSpriteModel, type CuedMergeTarget } from './MergeQueueSpriteModel.ts';

type Forecast = MergeQueueLine['forecast'];

function line(ticketId: string, forecast: Forecast = 'clean'): MergeQueueLine {
  return {
    ticketId, forecast, position: 1, priority: 'normal', causesText: null, forecastLabel: forecast, forecastState: 'reviewed', conflictedFilesText: null,
  };
}

function waitingLine(ticketId: string, forecast: Forecast): WaitingForMergeLine {
  return {
    ticketId, forecast, priority: 'normal', forecastLabel: forecast, forecastState: 'reviewed', conflictedFilesText: null,
  };
}

function target(changes: Partial<CuedMergeTarget> = {}): CuedMergeTarget {
  return {
    target: 'main', phase: null, lines: [], ...changes
  };
}

describe('the rows of the table', () => {
  test.each<readonly [string, readonly CuedMergeTarget[], readonly CuedMergeTarget[], readonly string[]]>([
    ['a target gets a holder', [target()], [target({ phase: 'merge-in' })], ['airlock-taken']],
    ['a target that was not shown comes with a holder', [], [target({ phase: 'gating' })], ['airlock-taken']],
    ['a candidate becomes conflicting', [target({ lines: [line('001')] })], [target({ lines: [line('001', 'conflicting')] })], ['conflict-predicted']],
    [
      'a ticket waiting for merge becomes conflicting',
      [target({ waitingLines: [waitingLine('001', 'prediction-failed')] })],
      [target({ waitingLines: [waitingLine('001', 'conflicting')] })],
      ['conflict-predicted'],
    ],
    ['a ticket joins the order', [target({ lines: [line('001')] })], [target({ lines: [line('001'), line('002')] })], ['ticket-queued']],
  ])('%s', (_description, previous, next, cueNames) => {
    expect(MergeQueueSpriteModel.cuesBetween(previous, next)).toEqual(cueNames);
  });
});

describe('what is no change', () => {
  test.each<readonly [string, readonly CuedMergeTarget[], readonly CuedMergeTarget[]]>([
    ['the same targets', [target({ phase: 'gating', lines: [line('001', 'conflicting')] })], [target({ phase: 'gating', lines: [line('001', 'conflicting')] })]],
    ['a holder that changes phase', [target({ phase: 'merge-in' })], [target({ phase: 'landing' })]],
    ['a holder that lets go', [target({ phase: 'landing' })], [target()]],
    ['a conflicting candidate that turns clean', [target({ lines: [line('001', 'conflicting')] })], [target({ lines: [line('001')] })]],
    ['a candidate that leaves', [target({ lines: [line('001'), line('002')] })], [target({ lines: [line('002')] })]],
  ])('%s', (_description, previous, next) => {
    expect(MergeQueueSpriteModel.cuesBetween(previous, next)).toEqual([]);
  });

  test('a candidate that joins already conflicting only joins the order', () => {
    expect(MergeQueueSpriteModel.cuesBetween([target()], [target({ lines: [line('001', 'conflicting')] })])).toEqual(['ticket-queued']);
  });
});

test('several changes come in the order of the table', () => {
  const previous = [target({ lines: [line('001')] })];
  const next = [target({ phase: 'merge-in', lines: [line('001', 'conflicting'), line('002')] })];
  expect(MergeQueueSpriteModel.cuesBetween(previous, next)).toEqual(['airlock-taken', 'conflict-predicted', 'ticket-queued']);
});
