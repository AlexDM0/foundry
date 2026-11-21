/**
 * What waits on User. What matters: the list is the attention the forge serves, entry for entry and in its order, with only the action
 * added; each action routes to the tab and item of its served target; the escalated entries lead with the one primary action; the tab
 * counts tone Questions by escalation, sum the four Kanban kinds, count the Assistant's open incidents in grey, give no entry at zero and
 * never count Intake; and the accessible names read singular and plural. Which entries wait, and their order, are the forge's rules.
 */
import { describe, expect, test } from 'bun:test';

import {
  AGENT_DECISION,
  nothingWaitingBoard,
  WAITING_ATTENTION,
  waitingOnUserBoard
} from '../testing/WaitingOnUserFixture.ts';
import { WaitingOnUserModel } from './WaitingOnUserModel.ts';

const { waitingOnUserOf, tabCountsOf, pillAriaLabelOf } = WaitingOnUserModel;

describe('the served entries', () => {
  test('the list is the served attention entry for entry, in its order, the action only added', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    const shownEntries = [...waiting.escalated, ...waiting.byAge].map(({ action: _action, ...entry }) => entry);
    expect(shownEntries).toEqual([...WAITING_ATTENTION]);
  });

  test('each action carries the served label and routes to the tab and item of the entry\'s served target', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    const actions = [...waiting.escalated, ...waiting.byAge].map((item) => [item.idText, item.action.label, item.action.route]);
    expect(actions).toEqual([
      ['E3', 'Answer', { tab: 'questions', item: 'E3' }],
      ['D2', 'Answer', { tab: 'kanban', item: 'draft/D2' }],
      ['E2', 'Answer', { tab: 'questions', item: 'E2' }],
      ['#009', 'Ready', { tab: 'kanban', item: 'ticket/009' }],
      ['#006', 'Review', { tab: 'kanban', item: 'ticket/006' }],
      ['#005', 'Accept', { tab: 'kanban', item: 'ticket/005' }],
      ['#015', 'Ready', { tab: 'kanban', item: 'ticket/015' }],
      ['E4', 'Answer', { tab: 'questions', item: 'E4' }],
    ]);
  });

  test('an entry whose target is a job or an incident routes to its agent or to the Assistant', () => {
    const [first] = WAITING_ATTENTION;
    if (first === undefined) throw new Error('the waiting board serves attention');
    const board = waitingOnUserBoard({
      attention: [
        {
          ...first, kind: 'question', key: 'job:J7', target: { subject: 'job', id: 'J7' }
        },
        {
          ...first, kind: 'question', key: 'incident:I5', target: { subject: 'incident', id: 'I5' }
        },
      ],
    });
    expect(waitingOnUserOf(board).byAge.map((item) => item.action.route)).toEqual([{ tab: 'agents', item: 'J7' }, { tab: 'assistant', item: null }]);
  });

  test('the escalated entries lead with the one primary action, the rest keep the served order', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    expect(waiting.escalated.map((item) => [item.idText, item.escalatedFromIncidentId, item.action.primary])).toEqual([['E3', 'I2', true]]);
    expect(waiting.byAge.every((item) => !item.action.primary)).toBe(true);
    expect(waiting.byAge.map((item) => item.key)).toEqual(WAITING_ATTENTION.slice(1).map((entry) => entry.key));
  });

  test('the total and the escalated count, and a board where nothing waits counts none', () => {
    const waiting = waitingOnUserOf(waitingOnUserBoard());
    expect([waiting.total, waiting.escalatedCount]).toEqual([8, 1]);
    const nothing = waitingOnUserOf(nothingWaitingBoard());
    expect([nothing.total, nothing.escalatedCount, nothing.escalated, nothing.byAge]).toEqual([0, 0, [], []]);
  });
});

describe('the tab counts and the accessible names', () => {
  test('Questions is escalated while any open decision is, Kanban sums its four kinds, and the Assistant counts its incidents in grey', () => {
    const board = waitingOnUserBoard();
    expect(tabCountsOf(board, waitingOnUserOf(board))).toEqual({
      questions: { count: 3, tone: 'escalated', ariaLabel: 'Questions, 3 questions wait on User, 1 escalated' },
      kanban:    { count: 5, tone: 'waiting', ariaLabel: 'Kanban, 5 wait on User' },
      assistant: { count: 1, tone: 'neutral', ariaLabel: 'Assistant, 1 incident the Assistant is settling' },
    });
  });

  test('with nothing escalated Questions waits in rose, one item reads singular, and a zero count gives no entry; Intake never gets one', () => {
    const board = waitingOnUserBoard({ decisions: [AGENT_DECISION], incidents: [], attention: WAITING_ATTENTION.filter((entry) => entry.idText === 'E4'), });
    const counts = tabCountsOf(board, waitingOnUserOf(board));
    expect(counts.questions).toEqual({ count: 1, tone: 'waiting', ariaLabel: 'Questions, 1 question waits on User' });
    expect([counts.kanban, counts.assistant, counts.intake]).toEqual([undefined, undefined, undefined]);
    const nothing = nothingWaitingBoard();
    expect(tabCountsOf(nothing, waitingOnUserOf(nothing))).toEqual({});
  });

  test('the pill names the total and the escalated, and none when nothing waits', () => {
    expect(pillAriaLabelOf(waitingOnUserOf(waitingOnUserBoard()))).toBe('Waiting on User: 8, 1 escalated');
    const unescalated = waitingOnUserBoard({ attention: WAITING_ATTENTION.map((entry) => ({ ...entry, kind: entry.kind === 'escalated-question' ? 'question' : entry.kind })) });
    expect(pillAriaLabelOf(waitingOnUserOf(unescalated))).toBe('Waiting on User: 8');
    expect(pillAriaLabelOf(waitingOnUserOf(nothingWaitingBoard()))).toBe('Waiting on User: none');
  });
});
