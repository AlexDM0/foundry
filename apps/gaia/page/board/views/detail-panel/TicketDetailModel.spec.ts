/**
 * The ticket form: the head's display state and type, the ✓ only on a reviewed Done card, the same four section tabs with only Activity
 * counting, Activity's own lines newest first, and the Overview's facts in their fixed order, the network last.
 */
import { describe, expect, test } from 'bun:test';

import type { TicketSection } from '../../shared/routing/DetailRoute.ts';
import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt
} from '../../testing/DetailBoardFixture.ts';
import { TicketDetailModelUtil } from './TicketDetailModel.ts';

const BOARD = exampleDetailBoard({
  tickets: [
    exampleDetailTicket('012', {
      status:   'in-progress',
      started:  exampleStampAt('10:15'),
      hold:     '',
      branch:   'ticket-012',
      task:     9,
      epics:    ['checkout'],
      group:    'account',
      network:  ['registry.example.com'],
      priority: 'high',
    }),
    exampleDetailTicket('014', {
      status: 'delivered', type: 'bug', task: 10, delivered: exampleStampAt('12:00'), finished: exampleStampAt('11:00')
    }),
  ],
  rows: [
    exampleDetailRow(9, {
      ticket: '012', status: 'paused', note: 'Waiting on the example vendor', start: exampleStampAt('10:15'), history: [{ status: 'paused', at: exampleStampAt('12:36') }]
    }),
    exampleDetailRow(10, { ticket: '014', status: 'delivered', reviewed: exampleStampAt('11:30') }),
  ],
  displayStates: { '012': 'paused' },
  reviewedFirst: [10],
  waitingOn:     { '012': ['003'] },
  log:           [
    {
      at: exampleStampAt('09:10'), text: 'Ticket #012 readied', taskIds: [], ticketIds: ['012']
    },
    {
      at: exampleStampAt('10:15'), text: 'Task #9 started', taskIds: [9], ticketIds: ['012']
    },
    {
      at: exampleStampAt('11:00'), text: 'Ticket #014 finished', taskIds: [10], ticketIds: ['014']
    },
  ],
});

function modelOf(ticketId: string, section: TicketSection = 'overview') {
  const model = TicketDetailModelUtil.ticketDetailModelOf(BOARD, ticketId, section, EXAMPLE_DETAIL_FORMAT);
  if (model === null) throw new Error(`no model for ${ticketId}`);
  return model;
}

describe('the head', () => {
  test('takes the Board\'s display state, the ticket\'s priority and its type, a plain ticket\'s too', () => {
    const model = modelOf('012');
    expect([model.idText, model.stateToken, model.stateLabel, model.priority, model.ticketType]).toEqual(['#012', 'paused', 'Paused', 'high', 'ticket']);
  });

  test('marks a Done card reviewed first with its full reviewed stamp, and no other', () => {
    expect(modelOf('014').reviewedTitle).toBe('Reviewed 2026-09-18 11:30 before it was done');
    expect(modelOf('012').reviewedTitle).toBeNull();
  });
});

describe('the facts', () => {
  test('come in their fixed order, the network last and no group fact beside the integration', () => {
    expect(modelOf('012').overview.facts.map((fact) => fact.label)).toEqual([
      'epics',
      'integration',
      'filed',
      'started',
      'paused',
      'row note',
      'held',
      'waiting on',
      'branch',
      'task',
      'network',
    ]);
    expect(modelOf('014').overview.facts.map((fact) => fact.label)).toEqual(['filed', 'finished', 'reviewed', 'done', 'task']);
  });

  test('a waiting-on link opens the ticket form of the ticket waited on', () => {
    const links = [{ text: '#003', item: { form: 'ticket', ticketId: '003' } as const }];
    expect(modelOf('012').overview.facts.find((fact) => fact.label === 'waiting on')).toEqual({ kind: 'links', label: 'waiting on', links });
  });
});

describe('the sections', () => {
  test('are always Overview, Timeline, Activity and Description, in order, only Activity counting its lines', () => {
    expect(modelOf('012').tabs).toEqual([
      { section: 'overview', label: 'Overview', count: null },
      { section: 'timeline', label: 'Timeline', count: null },
      { section: 'activity', label: 'Activity', count: 2 },
      { section: 'description', label: 'Description', count: null },
    ]);
  });

  test('a ticket no line names shows no Activity count', () => {
    const quiet = TicketDetailModelUtil.ticketDetailModelOf(exampleDetailBoard({ tickets: [exampleDetailTicket('020')] }), '020', 'overview', EXAMPLE_DETAIL_FORMAT);
    expect(quiet?.tabs.find((tab) => tab.section === 'activity')?.count).toBeNull();
  });

  test('Activity claims the lines naming the ticket or its own row, newest first', () => {
    expect(modelOf('012').activity.map((line) => line.text)).toEqual(['Task #9 started', 'Ticket #012 readied']);
  });

  test('the section shown is the routed one, every section built whatever is shown', () => {
    const timeline = modelOf('012', 'timeline');
    expect(timeline.section).toBe('timeline');
    expect(timeline.overview.facts.length).toBeGreaterThan(0);
    expect(timeline.activity.length).toBe(2);
  });
});

test('an unknown ticket has no ticket form', () => {
  expect(TicketDetailModelUtil.ticketDetailModelOf(BOARD, '999', 'overview', EXAMPLE_DETAIL_FORMAT)).toBeNull();
});
