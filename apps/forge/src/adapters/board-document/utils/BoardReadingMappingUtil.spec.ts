/**
 * The board's readings against the contract's reading documents. What matters: an attention entry keeps every field and carries its target,
 * never a route; a notice keeps its facts beside forge's sentence, and only an incident default carries its cause worded; a warning names
 * the facts its sentence names; today's figures carry the date they counted; a ticket's facts follow the Board's status classes, and its
 * review round falls back to the first repeat round only while a repeat review runs; the stop holds are the Board's holds; and the rule
 * limits are forge's own constants.
 */
import { describe, expect, test } from 'bun:test';

import { CONCURRENCY_LIMIT_CEILING_AGENTS, DEFAULT_CONCURRENCY_LIMIT_AGENTS } from '../../../domain/tracker-model/constants/ConcurrencyLimits.ts';
import {
  DEFAULT_APPROVALS,
  DEFAULT_DOCUMENTS_OF_ROLE,
  DEFAULT_INSTRUCTIONS_OF_ROLE,
  DEFAULT_TICKET_WRITING_ROUTE,
  RE_REVIEW_THRESHOLD_STEP_LINES
} from '../../../domain/tracker-model/constants/PipelineDefaults.ts';
import type { PageTicket, PageTicketFacts } from '../../../shared/@types/PagePayload.ts';
import { DISPATCH_PROTOCOL }                from '../../../shared/constants/DispatchProtocol.ts';
import {
  DEFAULT_AGENT_PAIR_OF_ROLE,
  PLAN_AGENT_EFFORT,
  PLAN_AGENT_MODEL,
  SPEC_AGENT_EFFORT,
  SPEC_AGENT_MODEL,
  WORKER_EFFORT,
  WORKER_MODEL
} from '../../../shared/constants/HephaestusLimits.ts';
import type { AttentionEntry }     from '../../../shared/monitor/AttentionEntries.ts';
import { taskFixture }             from '../../../testing/BoardFixtures.ts';
import { BoardReadingMappingUtil } from './BoardReadingMappingUtil.ts';

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
    status:          'committed',
    filed:           AT,
    updated:         AT,
    started:         null,
    finished:        null,
    delivered:       null,
    abandonedAt:     null,
    task:            null,
    extra:           [],
    bodyMarkdown:    '',
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
  test('serves the monitor\'s warnings with the facts each sentence names, an unreadable file\'s problem worded as its reason', () => {
    const restartWarning = { successorCodeVersion: 'code-next', step: 'handover', error: 'Example failure.' };
    const notices = [{
      kind: 'incident-defaulted', incidentId: 'I4', move: 'ticket-park', cause: 'no-assistant'
    }];
    const unreadableFiles = [{ file: 'crash-logs/crash-2.json', problem: { code: 'version-differs', field: 'crashLogVersion', expectedVersion: 2 } }];
    expect(BoardReadingMappingUtil.warningsOf(notices, { restartWarning, unreadableFiles })).toEqual([
      { kind: 'restart-failed', facts: restartWarning, sentence: 'the restart to code code-next failed at handover: Example failure.' },
      { kind: 'assistant-down', facts: {}, sentence: 'no Assistant can come up: open incidents take their defaults' },
      {
        kind:     'system-file-unreadable',
        facts:    { file: 'crash-logs/crash-2.json', reason: 'its crashLogVersion is not 2' },
        sentence: 'Hephaestus cannot read the board file crash-logs/crash-2.json: restart Hephaestus, and report a bug if this warning stays',
      },
    ]);
    expect(BoardReadingMappingUtil.warningsOf([], { restartWarning: null, unreadableFiles: [] })).toEqual([]);
  });
});

describe('BoardReadingMappingUtil.todayOf', () => {
  test('carries the calendar date the figures were counted on', () => {
    expect(BoardReadingMappingUtil.todayOf('2026-11-20', { deliveredTickets: 2, tokens: 900 })).toEqual({ calendarDate: '2026-11-20', deliveredTickets: 2, tokens: 900 });
  });
});

describe('BoardReadingMappingUtil.ticketFactsOf', () => {
  test('resolves an absent priority to the default and reads the status classes of a committed ticket', () => {
    expect(BoardReadingMappingUtil.ticketFactsOf(pageTicketWith({}), ticketFactsWith('committed'), undefined)).toEqual({
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

  test('serves each role\'s default model and effort as the launch takes them, the document agents\' own beside the worker pair', () => {
    const limits = BoardReadingMappingUtil.ruleLimitsOf();
    expect(limits.defaultAgentPairOfRole).toEqual(DEFAULT_AGENT_PAIR_OF_ROLE);
    expect(limits.defaultAgentPairOfRole.specAgent).toEqual({ model: SPEC_AGENT_MODEL, effort: SPEC_AGENT_EFFORT });
    expect(limits.defaultAgentPairOfRole.planAgent).toEqual({ model: PLAN_AGENT_MODEL, effort: PLAN_AGENT_EFFORT });
    expect(limits.defaultAgentPairOfRole.builder).toEqual({ model: WORKER_MODEL, effort: WORKER_EFFORT });
  });

  test('serves the pipeline\'s defaults: the documents each reading role reads, the reviewer\'s fixed spec, the approvals and the route', () => {
    const limits = BoardReadingMappingUtil.ruleLimitsOf();
    expect(limits.defaultDocumentsOfRole).toEqual(DEFAULT_DOCUMENTS_OF_ROLE);
    expect(limits.fixedDocumentsOfRole).toEqual({ builder: [], reviewer: ['spec'] });
    expect(limits.defaultApprovals).toEqual(DEFAULT_APPROVALS);
    expect(limits.defaultTicketWritingRoute).toBe(DEFAULT_TICKET_WRITING_ROUTE);
  });
});
