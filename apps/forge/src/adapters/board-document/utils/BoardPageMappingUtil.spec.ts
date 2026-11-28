/**
 * The board's page and forge-wide figures against the contract's documents: tickets, rows, facts, epics and notices map field by field,
 * an absent optional field stays absent, and a field no reader names never reaches the document.
 */
import { describe, expect, test } from 'bun:test';

import type { EpicRollup }      from '../../../domain/tracker-model/@types/Epic.ts';
import type { PageTicket }      from '../../../shared/@types/PagePayload.ts';
import type { PagePayload }     from '../../../shared/@types/PagePayload.ts';
import { BoardPageMappingUtil } from './BoardPageMappingUtil.ts';

const AT = '2026-11-19T10:00:00+01:00';

const PAGE_TICKET: PageTicket = {
  id:              '001',
  title:           'Example checkout page',
  type:            'bug',
  status:          'committed',
  priority:        'high',
  model:           'opus',
  effort:          'max',
  hold:            '',
  epics:           ['example-checkout'],
  introducedBy:    '000',
  contentHash:     '0123456789abcdef',
  filed:           AT,
  updated:         AT,
  started:         null,
  finished:        null,
  delivered:       null,
  abandonedAt:     null,
  task:            null,
  extra:           [['owner-note', 'kept']],
  bodyMarkdown:    'Example',
  sections:        [{ heading: 'Brief', markdown: 'Example brief.' }],
  acceptanceItems: [{ label: 'A1', text: 'The page loads.', waived: false }],
};

const EPIC: EpicRollup = {
  key:                 'example-checkout',
  title:               'Example checkout redesign',
  slot:                1,
  ticketIds:           ['001'],
  ticketCountByStatus: {
    'draft': 0, 'ready-for-review': 0, 'committed': 1, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
  },
  tokens: 0,
  span:   null,
};

function payloadWith(changes: Partial<PagePayload>): PagePayload {
  return {
    progress: {
      trackerId: 'example-tracker-id',
      project:   'Example Agency',
      startedAt: AT,
      view:      {
        kind: 'relative', from: '-2h', to: 'now', tickMinutes: null
      },
      nextTaskId: 2,
      version:    1,
      tasks:      [{
        id:      1,
        name:    'Example checkout page',
        status:  'committed',
        start:   null,
        end:     null,
        owner:   'Alex Example',
        note:    '',
        ticket:  '001',
        tokens:  null,
        history: [{ status: 'committed', at: AT }],
        agent:   '001',
      }],
      log: [{
        at: AT, text: 'Ticket #001 filed.', taskIds: [], ticketIds: ['001']
      }, { at: AT, text: 'A note.' }],
    },
    generatedAtEpochMilliseconds: 1,
    limits:                       {} as PagePayload['limits'],
    concurrency:                  { limit: 2, agentsInFlight: 0 },
    pageScriptFailure:            null,
    epicDescriptions:             [{ key: 'example-checkout', descriptionMarkdown: 'Epic' }],
    boardFacts:                   {
      rows:    [{ displayState: 'committed', deliveredRowCountsAsReviewed: false, ownRowPositionOfReviewedTicket: null }],
      tickets: [{
        ticketId: '001', ownRowPosition: 0, reviewBarPositions: [], displayState: 'committed', waitingOnTicketIds: []
      }],
      epics:        [EPIC],
      readyTickets: [{
        id: '001', priority: 'high', model: 'opus', effort: 'max', held: true
      }],
    },
    ...changes,
  };
}

const TICKET_READINGS = {
  facts: {
    resolvedPriority: 'high', settlesADependency: false, isClosed: false, noAgentHasPickedItUp: true, reviewRound: null, isRepeatReview: false
  },
  offers:    { kinds: ['ticket-hold', 'ticket-park'], priorityChoices: ['normal', 'low'] },
  documents: null,
  draft:     null,
} as const;

const DOCUMENTS_SUMMARY = {
  spec:      { standing: 'approved', headNumber: 5, approvedNumber: 5 },
  plan:      { standing: 'out-of-date', headNumber: 3, approvedNumber: 3 },
  buildHeld: true,
} as const;

describe('BoardPageMappingUtil.pageOf', () => {
  const page = BoardPageMappingUtil.pageOf({ payload: payloadWith({}), tickets: [PAGE_TICKET] }, () => TICKET_READINGS);

  test('maps a ticket field by field, its status committed, the fields it names kept and no other', () => {
    expect(page.tickets).toEqual([{
      id:              '001',
      title:           'Example checkout page',
      type:            'bug',
      status:          'committed',
      priority:        'high',
      hold:            '',
      epics:           ['example-checkout'],
      introducedBy:    '000',
      task:            null,
      filed:           AT,
      updated:         AT,
      started:         null,
      finished:        null,
      delivered:       null,
      abandonedAt:     null,
      bodyMarkdown:    'Example',
      sections:        [{ heading: 'Brief', markdown: 'Example brief.' }],
      acceptanceItems: [{ label: 'A1', text: 'The page loads.', waived: false }],
      facts:           TICKET_READINGS.facts,
      offers:          TICKET_READINGS.offers,
    }]);
    const fieldsNoReaderNames = ['model', 'effort', 'extra', 'contentHash', 'filePath', 'size', 'group', 'documents'];
    expect(page.tickets[0] === undefined ? [] : Object.keys(page.tickets[0]).filter((field) => fieldsNoReaderNames.includes(field))).toEqual([]);
  });

  test('a ticket being written carries its draft as read', () => {
    const draft = {
      stage: 'spec-review', waitsOnUser: 'answer', agent: null, waitingSince: AT
    } as const;
    const pageWithDraft = BoardPageMappingUtil.pageOf({ payload: payloadWith({}), tickets: [PAGE_TICKET] }, () => ({ ...TICKET_READINGS, draft }));
    expect(pageWithDraft.tickets[0]?.draft).toEqual(draft);
  });

  test('a ticket with a documents record carries its summary as read', () => {
    const pageWithDocuments = BoardPageMappingUtil.pageOf({ payload: payloadWith({}), tickets: [PAGE_TICKET] }, () => ({ ...TICKET_READINGS, documents: DOCUMENTS_SUMMARY }));
    expect(pageWithDocuments.tickets[0]?.documents).toEqual(DOCUMENTS_SUMMARY);
  });

  test('maps a row, its phases and its facts, leaving out the claim it was started by', () => {
    expect(page.payload.progress.tasks).toEqual([{
      id:      1,
      name:    'Example checkout page',
      status:  'committed',
      start:   null,
      end:     null,
      owner:   'Alex Example',
      note:    '',
      ticket:  '001',
      tokens:  null,
      history: [{ status: 'committed', at: AT }],
    }]);
    expect(page.payload.boardFacts.rows[0]?.displayState).toBe('committed');
    expect(page.payload.boardFacts.tickets[0]?.displayState).toBe('committed');
  });

  test('keeps the chart range as written and reads an unset Hephaestus setting as paused', () => {
    expect(page.payload.progress.view).toEqual({
      kind: 'relative', from: '-2h', to: 'now', tickMinutes: null
    });
    expect(page.payload.progress.hephaestusState).toBe('paused');
  });

  test('keeps a log entry\'s ids where its record names them, and none on a note', () => {
    expect(page.payload.progress.log).toEqual([{
      at: AT, text: 'Ticket #001 filed.', taskIds: [], ticketIds: ['001']
    }, { at: AT, text: 'A note.' }]);
  });

  test('counts an epic\'s committed tickets under committed, and a ready ticket keeps only its id and its hold', () => {
    expect(page.payload.boardFacts.epics[0]?.ticketCountByStatus.committed).toBe(1);
    expect(page.payload.boardFacts.readyTickets).toEqual([{ id: '001', held: true }]);
  });

  test('reads an absent draft list and absent draft requests as none', () => {
    expect(page.payload.boardFacts.drafts).toEqual([]);
    expect(page.payload.draftRequests).toEqual([]);
  });
});

describe('BoardPageMappingUtil.hephaestusOf', () => {
  const hephaestus = {
    state: 'serving', paused: true, url: 'http://127.0.0.1:4100/', generation: 3, codeVersion: 'code-example', installVersion: 36, unreadableFiles: []
  } as const;

  test('names the state, the pause and the code version, and the Hephaestus lock warning that reads as one', () => {
    const restartWarning = { successorCodeVersion: 'code-next', step: 'handover', error: 'Example failure.' };
    expect(BoardPageMappingUtil.hephaestusOf({ ...hephaestus, restartWarning })).toEqual({
      state: 'serving', paused: true, codeVersion: 'code-example', restartWarning
    });
  });

  test('reads a Hephaestus lock warning that does not read as one as none', () => {
    expect(BoardPageMappingUtil.hephaestusOf({ ...hephaestus, restartWarning: { step: 3 } }).restartWarning).toBeNull();
  });
});
