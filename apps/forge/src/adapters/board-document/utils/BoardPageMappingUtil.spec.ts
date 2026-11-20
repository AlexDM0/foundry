/**
 * The board's page and its forge-wide figures against the contract's documents. What matters: a ticket, a row, a row's and a ticket's facts
 * and an epic map field by field, their statuses as the model names them; an optional field the model leaves absent stays absent, and a
 * field no reader names (a ticket's model, its stored extra lines, its body hash) never reaches the document; an unset Overseer setting
 * reads as paused and an absent draft list as none; a notice keeps its kind and its other fields as facts, and a value that is no notice is
 * dropped; a Baton warning that does not read as one is `null`.
 */
import { describe, expect, test } from 'bun:test';

import type { EpicRollup }      from '../../../lib/tracker-model/@types/Epic.ts';
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
  claimedBodyHash: 'example-hash',
  filed:           AT,
  updated:         AT,
  started:         null,
  finished:        null,
  delivered:       null,
  abandonedAt:     null,
  task:            null,
  extra:           [['owner-note', 'kept']],
  bodyHtml:        '<p>Example</p>',
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
    epicDescriptions:             [{ key: 'example-checkout', descriptionHtml: '<p>Epic</p>' }],
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
  offers: { kinds: ['ticket-hold', 'ticket-park'], priorityChoices: ['normal', 'low'] },
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
      bodyHtml:        '<p>Example</p>',
      sections:        [{ heading: 'Brief', markdown: 'Example brief.' }],
      acceptanceItems: [{ label: 'A1', text: 'The page loads.', waived: false }],
      facts:           TICKET_READINGS.facts,
      offers:          TICKET_READINGS.offers,
    }]);
    const fieldsNoReaderNames = ['model', 'effort', 'extra', 'claimedBodyHash', 'filePath', 'size', 'group'];
    expect(page.tickets[0] === undefined ? [] : Object.keys(page.tickets[0]).filter((field) => fieldsNoReaderNames.includes(field))).toEqual([]);
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

  test('keeps the chart range as written and reads an unset Overseer setting as paused', () => {
    expect(page.payload.progress.view).toEqual({
      kind: 'relative', from: '-2h', to: 'now', tickMinutes: null
    });
    expect(page.payload.progress.overseerState).toBe('paused');
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

describe('BoardPageMappingUtil.overseerOf', () => {
  const overseer = {
    state: 'serving', paused: true, url: 'http://127.0.0.1:4100/', generation: 3, codeVersion: 'code-example', installVersion: 36
  } as const;

  test('names the state, the pause and the code version, and the Baton warning that reads as one', () => {
    const batonPassWarning = { successorCodeVersion: 'code-next', step: 'handover', error: 'Example failure.' };
    expect(BoardPageMappingUtil.overseerOf({ ...overseer, batonPassWarning })).toEqual({
      state: 'serving', paused: true, codeVersion: 'code-example', batonPassWarning
    });
  });

  test('reads a Baton warning that does not read as one as none', () => {
    expect(BoardPageMappingUtil.overseerOf({ ...overseer, batonPassWarning: { step: 3 } }).batonPassWarning).toBeNull();
  });
});
