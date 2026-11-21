/**
 * An untrusted body of a board kind read into the contract's command. What matters: every kind reads to itself with each optional field it
 * takes; a key the kind does not name is left behind; a missing or misshapen field, a draft edit written as a field string, and a kind
 * outside the board's read as `null`.
 */
import { describe, expect, test } from 'bun:test';

import { BOARD_COMMAND_SAMPLES }   from '../../../testing/BoardCommandSamples.ts';
import { BoardCommandReadingUtil } from './BoardCommandReadingUtil.ts';

function bodyOf(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe('a body of a board kind', () => {
  for (const command of Object.values(BOARD_COMMAND_SAMPLES)) {
    test(`${command.kind} reads to the command it names`, () => {
      expect(BoardCommandReadingUtil.boardCommandOf(bodyOf(command))).toEqual(command);
    });
  }

  test('a key the kind does not name is left behind', () => {
    expect(BoardCommandReadingUtil.boardCommandOf({ kind: 'ticket-unhold', ticketReference: '7', admission: { filedByJob: 'J1' } }))
      .toEqual({ kind: 'ticket-unhold', ticketReference: '7' });
  });

  test.each([
    ['a missing ticket', { kind: 'ticket-priority', priority: 'high' }],
    ['a priority outside the list', { kind: 'ticket-priority', ticketReference: '7', priority: 'urgent' }],
    ['a stop mode that is a fresh agent', { kind: 'job-stop', jobId: 'J1', mode: 'fresh' }],
    ['a revision that is no whole number', {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 1.5, resumesBoard: false
    }],
    ['a billing with a key it does not hold', { kind: 'pipeline-setup-start', billing: { mode: 'subscription', key: 'secret' }, replacesUnreadablePipeline: false }],
    ['a draft edit written as a field string', {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'review', value: null }]
    }],
    ['no draft edit', {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: []
    }],
    ['a copy flag that is not true', {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ target: 'review', value: null }], isACopy: false
    }],
    ['an answer of no form', { kind: 'decision-answer', decisionId: 'D1', answer: { choices: ['a'] } }],
    ['a picture with no name', { kind: 'intake-start', text: 'Add a page.', pictures: [{ pictureId: 'a1b2' }] }],
    ['two of the three ticks', {
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, draftedFrom: { contributing: true, research: true }
    }],
    ['a step move other than continue', {
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'design', move: 'reopen'
    }],
    ['a window with no tick', { kind: 'chart-range-set', range: { kind: 'window', from: '-4h', to: 'now' } }],
    ['a kind outside the board\'s', { kind: 'ticket-add', title: 'Example' }],
    ['a control contract kind', { kind: 'hephaestus-pause' }],
  ])('%s reads as null', (_case, body) => {
    expect(BoardCommandReadingUtil.boardCommandOf(body)).toBeNull();
  });

  test('names each board kind and no other', () => {
    expect(Object.keys(BOARD_COMMAND_SAMPLES).every(BoardCommandReadingUtil.isBoardCommandKind)).toBe(true);
    expect(BoardCommandReadingUtil.isBoardCommandKind('hephaestus-pause')).toBe(false);
  });
});
