/**
 * The row form. What matters: the head is the row's label and displayed name in its display state, or the ticket's own for a ticket
 * without a row; the Task facts carry owner, note, start, end, elapsed, tokens, review round and ticket; recorded phases count a repeat
 * review's round, say the time since the phase before, and the newest takes the row's display state; a row without recorded phases has
 * them derived from the stamps up to the status it reached, under a note; and a review row has no Ticket section.
 */
import { describe, expect, test } from 'bun:test';

import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt
} from '../../testing/DetailBoardFixture.ts';
import { NO_PHASES_TO_SHOW_NOTE, PHASES_WERE_NOT_RECORDED_NOTE, RowDetailModelUtil } from './RowDetailModel.ts';

const BOARD = exampleDetailBoard({
  tickets: [
    exampleDetailTicket('012', {
      status: 'in-review', task: 9, branch: 'ticket-012', commit: 'abc1234', dependsOn: ['003'], epics: ['billing']
    }),
    exampleDetailTicket('013', {
      status: 'delivered', task: 11, started: exampleStampAt('10:00'), delivered: exampleStampAt('12:00')
    }),
    exampleDetailTicket('015', { status: 'draft' }),
  ],
  rows: [
    exampleDetailRow(9, {
      ticket:      '012',
      name:        '#012 Example checkout totals',
      owner:       'Alex Example',
      note:        'Built on ticket-012',
      status:      're-review',
      start:       exampleStampAt('10:15'),
      end:         exampleStampAt('11:00'),
      tokens:      1800000,
      reviewRound: 2,
      history:     [
        { status: 'committed', at: exampleStampAt('09:00') },
        { status: 'in-progress', at: exampleStampAt('10:15') },
        { status: 'in-review', at: exampleStampAt('11:00') },
        { status: 're-review', at: exampleStampAt('12:00') },
      ],
    }),
    exampleDetailRow(10, {
      reviewOf: '012', name: 'Review 1 #012', status: 'in-progress', start: exampleStampAt('11:10')
    }),
    exampleDetailRow(11, {
      ticket: '013', status: 'delivered', start: exampleStampAt('10:00'), end: exampleStampAt('11:30')
    }),
    exampleDetailRow(12, { ticket: null, status: 'committed' }),
  ],
  displayStates: { 9: 'reviewing', 10: 'reviewing' },
  log:           [{
    at: exampleStampAt('09:00'), text: 'Ticket #012 started', taskIds: [9], ticketIds: ['012']
  }],
});

function taskRowModelOf(taskId: number) {
  const model = RowDetailModelUtil.taskRowDetailModelOf(BOARD, taskId, EXAMPLE_DETAIL_FORMAT);
  if (model === null) throw new Error(`no model for row ${String(taskId)}`);
  return model;
}

describe('the head', () => {
  test('is the row\'s label, its name without the label\'s number, and its display state', () => {
    expect(taskRowModelOf(9).head).toEqual({
      idText: '#012', title: 'Example checkout totals', titleTitle: '#012 Example checkout totals', state: { kind: 'row', token: 'reviewing', label: 'Reviewing' }
    });
  });

  test('a ticket without a row shows the ticket\'s own id, title and status badge', () => {
    const model = RowDetailModelUtil.ticketRowDetailModelOf(BOARD, '015', EXAMPLE_DETAIL_FORMAT);
    expect(model?.head).toEqual({
      idText: '#015', title: 'Example ticket 015', titleTitle: null, state: { kind: 'ticket-status', status: 'draft', label: 'Draft' }
    });
    expect([model?.taskFacts, model?.phases]).toEqual([null, null]);
  });
});

describe('the task facts', () => {
  test('carry owner, note, start, end, elapsed, tokens, review round and the ticket', () => {
    const facts = taskRowModelOf(9).taskFacts ?? [];
    expect(facts.map((fact) => [fact.label, fact.kind === 'text' ? fact.text : fact.kind])).toEqual([
      ['owner', 'Alex Example'],
      ['note', 'Built on ticket-012'],
      ['start', 'stamp'],
      ['end', 'stamp'],
      ['elapsed', '45m'],
      ['tokens', '1.8M'],
      ['review round', '2'],
      ['ticket', 'links'],
    ]);
  });
});

describe('the phases', () => {
  test('recorded ones count a repeat review\'s round, say the time since the one before, and the newest takes the display state', () => {
    expect(taskRowModelOf(9).phases).toEqual({
      note:  null,
      lines: [
        {
          stateToken: 'committed', label: 'To do', stamp: { shortText: '09:00', fullText: '2026-09-18 09:00' }, gapText: null
        },
        {
          stateToken: 'in-progress', label: 'In progress', stamp: { shortText: '10:15', fullText: '2026-09-18 10:15' }, gapText: 'after 1h 15m'
        },
        {
          stateToken: 'in-review', label: 'Awaiting review', stamp: { shortText: '11:00', fullText: '2026-09-18 11:00' }, gapText: 'after 45m'
        },
        {
          stateToken: 'reviewing', label: 'Reviewing', stamp: { shortText: '12:00', fullText: '2026-09-18 12:00' }, gapText: 'after 1h'
        },
      ],
    });
  });

  test('unrecorded ones are derived from the stamps up to the status the row reached, under a note', () => {
    const { phases } = taskRowModelOf(11);
    expect(phases?.note).toBe(PHASES_WERE_NOT_RECORDED_NOTE);
    expect(phases?.lines.map((line) => [line.stateToken, line.stamp.shortText])).toEqual([
      ['committed', '09:00'],
      ['in-progress', '10:00'],
      ['in-review', '11:30'],
      ['delivered', '12:00'],
    ]);
  });

  test('a row with nothing to derive them from says so', () => {
    expect(taskRowModelOf(12).phases).toEqual({ note: NO_PHASES_TO_SHOW_NOTE, lines: [] });
  });
});

describe('the ticket section', () => {
  test('carries the ticket\'s head and facts, its links opening the row form', () => {
    const { ticket } = taskRowModelOf(9);
    expect([ticket?.idText, ticket?.ticketType, ticket?.status, ticket?.statusLabel]).toEqual(['#012', 'ticket', 'in-review', 'Awaiting review']);
    expect(ticket?.facts.map((fact) => fact.label)).toEqual(['epics', 'filed', 'branch', 'commit', 'task', 'waits on']);
    const links = [{ text: '#003', item: { form: 'ticket-row', ticketId: '003' } as const }];
    expect(ticket?.facts.find((fact) => fact.label === 'waits on')).toEqual({ kind: 'links', label: 'waits on', links });
  });

  test('a review row has none, and is labelled by the ticket it reviews', () => {
    const model = taskRowModelOf(10);
    expect([model.head.idText, model.ticket]).toEqual(['#012', null]);
  });
});

test('the log carries the lines about the row or its ticket; an unknown row or ticket has no row form', () => {
  expect(taskRowModelOf(9).logLines.map((line) => line.text)).toEqual(['Ticket #012 started']);
  expect(RowDetailModelUtil.taskRowDetailModelOf(BOARD, 99, EXAMPLE_DETAIL_FORMAT)).toBeNull();
  expect(RowDetailModelUtil.ticketRowDetailModelOf(BOARD, '999', EXAMPLE_DETAIL_FORMAT)).toBeNull();
});
