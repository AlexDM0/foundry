/**
 * The board's conversations against the contract's documents: decisions, a spec agent's questions, incidents and log records map field
 * by field, absent fields read `null`, and the relay request id stays out.
 */
import { describe, expect, test } from 'bun:test';

import type { Decision }                from '../../../domain/tracker-model/@types/Decision.ts';
import type { LogRecord }               from '../../../domain/tracker-model/@types/LogRecord.ts';
import { BoardConversationMappingUtil } from './BoardConversationMappingUtil.ts';

const AT = '2026-11-19T10:00:00+01:00';

const DECISION: Decision = {
  id:        'E1',
  kind:      'agent-question',
  ticketIds: ['001'],
  jobId:     'J1',
  askedBy:   'reviewer',
  requestId: 'request-example',
  questions: [{
    question:    'Which format?',
    header:      'Format',
    multiSelect: true,
    options:     [
      {
        label: 'CSV', description: 'Comma separated', isRecommended: true, touches: ['src/export.ts'], tradeOff: 'Smaller.', acceptanceEffect: 'A2 holds'
      },
      { label: 'JSON', description: 'One document', isRecommended: false },
    ],
  }],
  context:  'The export needs a format.',
  openedAt: AT,
};

describe('BoardConversationMappingUtil.decisionOf', () => {
  test('maps a decision field by field, the recommendation as a field, absent consequences absent and the request id left out', () => {
    expect(BoardConversationMappingUtil.decisionOf(DECISION, null)).toEqual({
      id:        'E1',
      kind:      'agent-question',
      ticketIds: ['001'],
      jobId:     'J1',
      askedBy:   'reviewer',
      questions: [{
        question:    'Which format?',
        header:      'Format',
        multiSelect: true,
        options:     [
          {
            letter: 'a', label: 'CSV', description: 'Comma separated', recommended: true, touches: ['src/export.ts'], tradeOff: 'Smaller.', acceptanceEffect: 'A2 holds'
          },
          {
            letter: 'b', label: 'JSON', description: 'One document', recommended: false
          },
        ],
      }],
      context:  'The export needs a format.',
      openedAt: AT,
    });
  });

  const ANCHOR = {
    view: 'code', versionNumber: 3, lines: { from: 7, to: 8 }, sectionPath: ['Behaviour'], surroundingLines: { from: 5, to: 10 }
  } as const;
  const DOCUMENT_QUESTION: Decision = {
    ...DECISION,
    askedBy:   'spec-agent',
    requestId: null,
    document:  'spec',
    anchor:    {
      ...ANCHOR, lines: { from: 7, to: 8 }, sectionPath: ['Behaviour'], surroundingLines: { from: 5, to: 10 }
    },
  };

  test('a spec agent\'s question carries its document, its anchor as asked and where its lines stand on the head now', () => {
    const mapped = BoardConversationMappingUtil.decisionOf(DOCUMENT_QUESTION, { from: 9, to: 10 });
    expect([mapped.document, mapped.anchor, mapped.placement]).toEqual(['spec', ANCHOR, { from: 9, to: 10 }]);
  });

  test('a question whose lines are gone from the head has a null placement', () => {
    expect(BoardConversationMappingUtil.decisionOf(DOCUMENT_QUESTION, null).placement).toBeNull();
  });

  test('a decision no document agent asked names no document, anchor or placement', () => {
    expect(Object.keys(BoardConversationMappingUtil.decisionOf(DECISION, { from: 1, to: 1 }))).not.toContain('placement');
  });
});

describe('BoardConversationMappingUtil.incidentOf', () => {
  test('maps an incident field by field, its delivery turn included', () => {
    const incident = {
      id:              'I1',
      kind:            'quiet-job',
      ticketIds:       ['001'],
      jobId:           'J1',
      facts:           { sweeps: '4' },
      defaultMove:     'job-fresh',
      deliveredInTurn: { jobId: 'J9', chatSequence: 2 },
      openedAt:        AT,
    } as const;
    expect(BoardConversationMappingUtil.incidentOf({ ...incident, ticketIds: ['001'] })).toEqual(incident);
  });
});

describe('BoardConversationMappingUtil.questionHistoryEntryOf', () => {
  test('keeps a record\'s kind, stamp, the ids it names and its fields', () => {
    const answered: LogRecord = {
      kind: 'decision-answered', at: AT, decisionId: 'E1', fields: { answer: { 'Which format?': 'CSV' } }
    };
    expect(BoardConversationMappingUtil.questionHistoryEntryOf(answered)).toEqual({
      kind: 'decision-answered', at: AT, decisionId: 'E1', fields: { answer: { 'Which format?': 'CSV' } }
    });
  });

  test('names a job\'s record by its job and leaves the ids it does not name absent', () => {
    const ended: LogRecord = {
      kind: 'job-ended', at: AT, jobId: 'J1', fields: { outcome: 'closed', deniedPermissions: ['Bash'] }
    };
    const entry = BoardConversationMappingUtil.questionHistoryEntryOf(ended);
    expect(entry).toEqual({
      kind: 'job-ended', at: AT, jobId: 'J1', fields: { outcome: 'closed', deniedPermissions: ['Bash'] }
    });
    expect(Object.hasOwn(entry, 'ticketId') || Object.hasOwn(entry, 'decisionId')).toBe(false);
  });
});

describe('BoardConversationMappingUtil.pictureLimitsOf', () => {
  test('maps the picture limits field by field, and none as null', () => {
    const limits = { perMessage: 4, sizeLimitBytes: 1000, mediaTypes: ['image/png'] };
    expect(BoardConversationMappingUtil.pictureLimitsOf(limits)).toEqual(limits);
    expect(BoardConversationMappingUtil.pictureLimitsOf(null)).toBeNull();
  });
});
