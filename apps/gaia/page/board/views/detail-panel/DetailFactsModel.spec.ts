/**
 * The parts every detail form is built from: a group's integration and its release ticket, only an open marked one (a settled one's mark
 * is history); a paused build's `since … · …` against the handed-in now; log lines claimed by ids or a note's sentence; stamps as written.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardLogEntryDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt
} from '../../testing/DetailBoardFixture.ts';
import { DetailFactsModel } from './DetailFactsModel.ts';

describe('the integration fact', () => {
  const tickets = [
    exampleDetailTicket('002', { group: 'account', releasesGroup: true }),
    exampleDetailTicket('003', { group: 'account' }),
    exampleDetailTicket('004', { group: 'account' }),
    exampleDetailTicket('007', { group: 'search' }),
    exampleDetailTicket('008', { group: 'auth', releasesGroup: true, status: 'delivered' }),
    exampleDetailTicket('009', { group: 'auth' }),
    exampleDetailTicket('010'),
  ];
  const integrationOf = (ticketId: string) => DetailFactsModel.integrationOf(tickets.find((ticket) => ticket.id === ticketId) ?? exampleDetailTicket(ticketId), tickets, 'ticket');

  test('a member lands together on the group branch and is released with the release ticket', () => {
    expect(integrationOf('003')).toEqual({ branch: 'group-account', relation: 'lands-together', links: [{ text: '#002', item: { form: 'ticket', ticketId: '002' } }] });
  });

  test('the release ticket releases the group branch with every other member, each a link in the form the panel shows', () => {
    expect(DetailFactsModel.integrationOf(tickets[0] ?? exampleDetailTicket('002'), tickets, 'ticket-row')).toEqual({
      branch:   'group-account',
      relation: 'releases',
      links:    [{ text: '#003', item: { form: 'ticket-row', ticketId: '003' } }, { text: '#004', item: { form: 'ticket-row', ticketId: '004' } }],
    });
  });

  test('a group with no release ticket, or only a settled one, has none yet', () => {
    expect(integrationOf('007')).toEqual({ branch: 'group-search', relation: 'lands-together', links: [] });
    expect(integrationOf('009')).toEqual({ branch: 'group-auth', relation: 'lands-together', links: [] });
  });

  test('a ticket in no group has no integration fact', () => {
    expect(DetailFactsModel.integrationFactsOf(exampleDetailTicket('010'), tickets, 'ticket')).toEqual([]);
  });
});

describe('the pause facts', () => {
  const pausedRow = exampleDetailRow(4, {
    ticket:  '004',
    status:  'paused',
    note:    'Waiting on the example vendor',
    history: [
      { status: 'in-progress', at: exampleStampAt('09:00') },
      { status: 'paused', at: exampleStampAt('10:00') },
      { status: 'in-progress', at: exampleStampAt('10:30') },
      { status: 'paused', at: exampleStampAt('11:45') },
    ],
  });

  test('count from the last pause against the handed-in now, the full stamp on hover, then the row note', () => {
    expect(DetailFactsModel.pauseFactsOf('paused', pausedRow, EXAMPLE_DETAIL_FORMAT)).toEqual([
      {
        kind: 'text', label: 'paused', text: 'since 11:45 · 1h 51m', title: '2026-09-18 11:45'
      },
      { kind: 'text', label: 'row note', text: 'Waiting on the example vendor' },
    ]);
  });

  test('are absent unless the Board shows the ticket paused', () => {
    expect(DetailFactsModel.pauseFactsOf('in-progress', pausedRow, EXAMPLE_DETAIL_FORMAT)).toEqual([]);
  });
});

describe('the task fact', () => {
  test('reads the row label and opens the row form of the ticket\'s row', () => {
    expect(DetailFactsModel.taskFactsOf(exampleDetailTicket('004', { task: 9 }))).toEqual([
      { kind: 'links', label: 'task', links: [{ text: '#004', item: { form: 'task-row', taskId: 9 } }] },
    ]);
  });
});

describe('the stamps', () => {
  test('are sliced as written and shortened against the viewer\'s day, the full stamp kept for the hover', () => {
    expect(DetailFactsModel.stampFactsOf([
      ['filed', '2025-12-31T23:48:00+01:00'],
      ['started', '2026-09-18T10:15:00-05:00'],
      ['finished', null],
    ], EXAMPLE_DETAIL_FORMAT)).toEqual([
      { kind: 'stamp', label: 'filed', stamp: { shortText: '2025-12-31 23:48', fullText: '2025-12-31 23:48' } },
      { kind: 'stamp', label: 'started', stamp: { shortText: '10:15', fullText: '2026-09-18 10:15' } },
    ]);
  });
});

describe('the log', () => {
  const log: readonly BoardLogEntryDocument[] = [
    {
      at: exampleStampAt('09:00'), text: 'Ticket #012 started', taskIds: [9], ticketIds: ['012']
    },
    {
      at: exampleStampAt('09:30'), text: 'Ticket #013 waits on #012', taskIds: [], ticketIds: ['013']
    },
    {
      at: exampleStampAt('10:00'), text: 'Note naming task #9 by its sentence', taskIds: null, ticketIds: null
    },
    {
      at: exampleStampAt('10:00'), text: 'Note naming ticket #0120 alone', taskIds: null, ticketIds: null
    },
    {
      at: exampleStampAt('08:00', '2026-09-17'), text: 'Backfilled line about the row', taskIds: [9], ticketIds: []
    },
  ];

  test('claims a line by its ids or, for a note, its sentence, never by a number an id-carrying line names, newest first', () => {
    expect(DetailFactsModel.logLinesOf(log, 9, '012', EXAMPLE_DETAIL_FORMAT).map((line) => [line.stamp.shortText, line.text])).toEqual([
      ['10:00', 'Note naming task #9 by its sentence'],
      ['09:00', 'Ticket #012 started'],
      ['09-17 08:00', 'Backfilled line about the row'],
    ]);
  });

  test('a ticket no line names has an empty log', () => {
    expect(DetailFactsModel.logLinesOf(log, null, '014', EXAMPLE_DETAIL_FORMAT)).toEqual([]);
  });
});
