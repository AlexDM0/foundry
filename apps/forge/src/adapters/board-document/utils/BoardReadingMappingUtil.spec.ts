/**
 * The board's readings against the contract's reading documents. What matters: an attention entry keeps every field and carries its target,
 * never a route; a notice keeps its facts beside forge's sentence, and only an incident default carries its cause worded; a warning names
 * the facts its sentence names; today's figures carry the date they counted; a ticket's facts follow the Board's status classes, and its
 * review round falls back to the first repeat round only while a repeat review runs; the stop holds are the Board's holds; and the rule
 * limits are forge's own constants.
 */
import { describe, expect, test } from 'bun:test';

import { CONCURRENCY_LIMIT_CEILING_AGENTS, DEFAULT_CONCURRENCY_LIMIT_AGENTS } from '../../../lib/tracker-model/constants/ConcurrencyLimits.ts';
import { DEFAULT_INSTRUCTIONS_OF_ROLE, RE_REVIEW_THRESHOLD_STEP_LINES }       from '../../../lib/tracker-model/constants/PipelineDefaults.ts';
import type { PageTicket, PageTicketFacts }                                   from '../../../shared/@types/PagePayload.ts';
import { DISPATCH_PROTOCOL }                                                  from '../../../shared/constants/DispatchProtocol.ts';
import { WORKER_EFFORT, WORKER_MODEL }                                        from '../../../shared/constants/OverseerLimits.ts';
import type { AttentionEntry }                                                from '../../../shared/monitor/AttentionEntries.ts';
import { taskFixture }                                                        from '../../../testing/BoardFixtures.ts';
import { BoardReadingMappingUtil }                                            from './BoardReadingMappingUtil.ts';

const AT = '2026-11-20T10:00:00+01:00';

const ENTRY: AttentionEntry = {
  key:                     'decision:E3',
  kind:                    'question',
  idText:                  'E3',
  ticketIds:               ['009'],
  subject:                 'Which format?',
  jobId:                   'J2',
  askedBy:                 'builder',
  decisionKind:            null,
  escalatedFromIncidentId: null,
  metaText:                null,
  stamp:                   AT,
  stampWord:               'opened',
  actionLabel:             'Answer',
  target:                  { subject: 'decision', id: 'E3' },
};

function pageTicketWith(changes: Partial<PageTicket>): PageTicket {
  return {
    id:              '001',
    title:           'Example checkout page',
    type:            'ticket',
    status:          'pending',
    filed:           AT,
    updated:         AT,
    started:         null,
    finished:        null,
    delivered:       null,
    abandonedAt:     null,
    task:            null,
    extra:           [],
    bodyHtml:        '',
    sections:        [],
    acceptanceItems: [],
    ...changes,
  };
}

function ticketFactsWith(displayState: PageTicketFacts['displayState']): PageTicketFacts {
  return {
    ticketId: '001', ownRowPosition: 0, reviewBarPositions: [], displayState, waitingOnTicketIds: []
  };
}

describe('BoardReadingMappingUtil.attentionEntryOf', () => {
  test('keeps every field of the entry and carries its target, never a route', () => {
    const document = BoardReadingMappingUtil.attentionEntryOf(ENTRY);
    expect(document).toEqual(ENTRY);
    expect(Object.hasOwn(document, 'route')).toBe(false);
  });
});

describe('BoardReadingMappingUtil.noticesOf', () => {
  test('keeps a notice\'s kind and its other fields as facts beside forge\'s sentence, and drops a value that names no kind', () => {
    const notices = [{ kind: 'attribution-found', ticketId: '002' }, 'not a notice', { ticketId: '003' }];
    expect(BoardReadingMappingUtil.noticesOf(notices)).toEqual([{ kind: 'attribution-found', facts: { ticketId: '002' }, sentence: 'ticket #002 carries an AI attribution' }]);
  });

  test('words an incident default\'s cause, and only an incident default\'s', () => {
    const [defaulted, other] = BoardReadingMappingUtil.noticesOf([
      {
        kind: 'incident-defaulted', incidentId: 'I4', move: 'ticket-park', cause: 'no-assistant'
      },
      { kind: 'new-code' },
    ]);
    expect(defaulted?.sentence).toBe('incident I4 took its default, ticket-park: no Assistant was up');
    expect(defaulted?.causeSentence).toBe('no Assistant was up');
    expect(other === undefined ? true : Object.hasOwn(other, 'causeSentence')).toBe(false);
  });
});

describe('BoardReadingMappingUtil.warningsOf', () => {
  test('serves the monitor\'s warnings with the facts each sentence names', () => {
    const batonPassWarning = { successorCodeVersion: 'code-next', step: 'handover', error: 'Example failure.' };
    const notices = [{
      kind: 'incident-defaulted', incidentId: 'I4', move: 'ticket-park', cause: 'no-assistant'
    }];
    expect(BoardReadingMappingUtil.warningsOf(notices, batonPassWarning)).toEqual([
      { kind: 'baton-pass-failed', facts: batonPassWarning, sentence: 'the Baton pass to code code-next failed at handover: Example failure.' },
      { kind: 'assistant-down', facts: {}, sentence: 'no Assistant can come up: open incidents take their defaults' },
    ]);
    expect(BoardReadingMappingUtil.warningsOf([], null)).toEqual([]);
  });
});

describe('BoardReadingMappingUtil.todayOf', () => {
  test('carries the calendar date the figures were counted on', () => {
    expect(BoardReadingMappingUtil.todayOf('2026-11-20', { deliveredTickets: 2, tokens: 900 })).toEqual({ calendarDate: '2026-11-20', deliveredTickets: 2, tokens: 900 });
  });
});

describe('BoardReadingMappingUtil.ticketFactsOf', () => {
  test('resolves an absent priority to the default and reads the status classes of a committed ticket', () => {
    expect(BoardReadingMappingUtil.ticketFactsOf(pageTicketWith({}), ticketFactsWith('pending'), undefined)).toEqual({
      resolvedPriority: 'normal', settlesADependency: false, isClosed: false, noAgentHasPickedItUp: true, reviewRound: null, isRepeatReview: false
    });
  });

  test('a reviewed ticket settles a dependency and is closed; an abandoned one is closed and settles none', () => {
    const reviewed = BoardReadingMappingUtil.ticketFactsOf(pageTicketWith({ status: 'reviewed' }), ticketFactsWith('reviewed'), undefined);
    const abandoned = BoardReadingMappingUtil.ticketFactsOf(pageTicketWith({ status: 'abandoned' }), ticketFactsWith('abandoned'), undefined);
    expect([reviewed.settlesADependency, reviewed.isClosed, reviewed.noAgentHasPickedItUp]).toEqual([true, true, false]);
    expect([abandoned.settlesADependency, abandoned.isClosed]).toEqual([false, true]);
  });

  test('a repeat review reads its row\'s round, or the first repeat round while the row counts none', () => {
    const inReview = pageTicketWith({ status: 'in-review' });
    expect(BoardReadingMappingUtil.ticketFactsOf(inReview, ticketFactsWith('re-review'), taskFixture({ reviewRound: 3 })))
      .toMatchObject({ reviewRound: 3, isRepeatReview: true });
    expect(BoardReadingMappingUtil.ticketFactsOf(inReview, ticketFactsWith('re-review'), taskFixture({})))
      .toMatchObject({ reviewRound: 2, isRepeatReview: true });
    expect(BoardReadingMappingUtil.ticketFactsOf(inReview, ticketFactsWith('in-review'), taskFixture({})))
      .toMatchObject({ reviewRound: null, isRepeatReview: false });
  });
});

describe('BoardReadingMappingUtil offers and stop holds', () => {
  test('copies the Board\'s offers of a ticket and of a job', () => {
    expect(BoardReadingMappingUtil.ticketOffersOf({ kinds: ['ticket-hold'], priorityChoices: ['high'] })).toEqual({ kinds: ['ticket-hold'], priorityChoices: ['high'] });
    expect(BoardReadingMappingUtil.jobOffersOf({ stopModes: ['stop', 'wind-down'], takesFresh: false, takesMessage: true }))
      .toEqual({ stopModes: ['stop', 'wind-down'], takesFresh: false, takesMessage: true });
  });

  test('names the hold each stop mode leaves on the job\'s tickets', () => {
    expect(BoardReadingMappingUtil.jobStopHoldsOf('J4')).toEqual({ stop: 'stopped by User (J4)', windDown: 'wound down by User (J4)' });
  });
});

describe('BoardReadingMappingUtil.ruleLimitsOf', () => {
  test('serves forge\'s own bounds and defaults', () => {
    const limits = BoardReadingMappingUtil.ruleLimitsOf();
    expect(limits.concurrency).toEqual({ lowest: 1, ceiling: CONCURRENCY_LIMIT_CEILING_AGENTS, default: DEFAULT_CONCURRENCY_LIMIT_AGENTS });
    expect([limits.workerModel, limits.workerEffort, limits.reworkRoundThresholdLines]).toEqual([WORKER_MODEL, WORKER_EFFORT, DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES]);
    expect([limits.defaultTicketPriority, limits.firstRepeatReviewRound, limits.reReviewThresholdStepLines]).toEqual(['normal', 2, RE_REVIEW_THRESHOLD_STEP_LINES]);
    expect(limits.defaultInstructionsOfRole).toEqual(DEFAULT_INSTRUCTIONS_OF_ROLE);
  });
});
