/**
 * The ticket form. What matters: the head takes the Board's display state and shows every type, a plain ticket's too; only a Done card
 * whose row counts as reviewed carries the ✓, titled with its full `reviewed` stamp; and the facts come in their fixed order (epics,
 * integration, filed, started, paused and its row note, finished, reviewed, done, abandoned, reason, held, waiting on, branch, task), the
 * Bridge's network last, with no group fact beside the integration.
 */
import { describe, expect, test } from 'bun:test';

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
});

function modelOf(ticketId: string) {
  const model = TicketDetailModelUtil.ticketDetailModelOf(BOARD, ticketId, EXAMPLE_DETAIL_FORMAT);
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
  test('come in their fixed order, the Bridge\'s network last and no group fact beside the integration', () => {
    expect(modelOf('012').facts.map((fact) => fact.label)).toEqual([
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
    expect(modelOf('014').facts.map((fact) => fact.label)).toEqual(['filed', 'finished', 'reviewed', 'done', 'task']);
  });

  test('a waiting-on link opens the ticket form of the ticket waited on', () => {
    const links = [{ text: '#003', item: { form: 'ticket', ticketId: '003' } as const }];
    expect(modelOf('012').facts.find((fact) => fact.label === 'waiting on')).toEqual({ kind: 'links', label: 'waiting on', links });
  });
});

test('an unknown ticket has no ticket form', () => {
  expect(TicketDetailModelUtil.ticketDetailModelOf(BOARD, '999', EXAMPLE_DETAIL_FORMAT)).toBeNull();
});
