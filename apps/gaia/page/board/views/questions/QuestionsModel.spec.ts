/**
 * The Questions view's model. What matters: the open decisions come in the answering order the forge serves, escalated where the forge
 * says, and an id the board names no decision for is passed over; an answered decision is read back from the log; a notice carries the id
 * it is about and the forge's sentence as served; and only open decisions count, never a finding or a notice.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDecisionDocument }              from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardNoticeDocument }                from '../../../@types/board/BoardFactDocuments.ts';
import { QuestionsModelUtil, type QuestionsBoard } from './QuestionsModel.ts';

const AT = '2026-10-29T20:00:00+01:00';

function decisionOf(id: string, kind: string, questions: BoardDecisionDocument['questions'] = []): BoardDecisionDocument {
  return {
    id, kind, ticketIds: ['042'], jobId: 'J3', askedBy: 'builder', questions, context: 'Example context', openedAt: AT
  };
}

function noticeOf(kind: string, facts: Readonly<Record<string, unknown>>, text: string): BoardNoticeDocument {
  return {
    kind, facts, text, causeText: null,
  };
}

const ONE_QUESTION = [{
  question:    'Which store?',
  header:      'Store',
  multiSelect: false,
  options:     [
    {
      label: 'Disk', description: '', recommended: false, touches: [], tradeOff: null, acceptanceEffect: null
    },
    {
      label: 'Memory', description: '', recommended: false, touches: [], tradeOff: null, acceptanceEffect: null
    },
  ]
}];

const BOARD: QuestionsBoard = {
  decisions:            [decisionOf('E1', 'parked'), decisionOf('E2', 'agent-question', ONE_QUESTION), decisionOf('E3', 'agent-question')],
  openDecisionIds:      ['E2', 'E3', 'E1'],
  escalatedDecisionIds: ['E3'],
  notices:              [noticeOf('dirty-main-checkout', {}, 'Example landings on main wait')],
  questionHistory:      [
    {
      kind: 'job-launched', at: AT, jobId: 'J1', ticketId: null, decisionId: null, incidentId: null, fields: { kind: 'review', ticketIds: ['040'] }
    },
    {
      kind: 'incident-escalated', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I4', fields: { decisionId: 'E3' }
    },
    {
      kind: 'decision-answered', at: AT, jobId: null, ticketId: null, decisionId: 'E0', incidentId: null, fields: { answer: { 'Which store?': 'Disk' } }
    },
  ],
};

describe('QuestionsModelUtil.questionsModelOf', () => {
  const model = QuestionsModelUtil.questionsModelOf(BOARD);

  test('the open decisions come in the forge\'s answering order, escalated as the forge serves it', () => {
    expect(model.openDecisions.map(({ decision, escalated }) => [decision.id, escalated])).toEqual([['E2', false], ['E3', true], ['E1', false]]);
  });

  test('an id the board names no decision for is passed over', () => {
    const board = { ...BOARD, openDecisionIds: ['E9', ...BOARD.openDecisionIds] };
    expect(QuestionsModelUtil.openDecisionsOf(board).map(({ decision }) => decision.id)).toEqual(['E2', 'E3', 'E1']);
  });

  test('reads answered decisions back from the log with their answers', () => {
    expect(model.answeredDecisions).toEqual([{ decisionId: 'E0', answeredAt: AT, answer: [['Which store?', 'Disk']] }]);
  });

  test('counts only the open decisions: a notice adds nothing', () => {
    expect(model.openQuestionCount).toBe(3);
    expect(model.notices.map((notice) => notice.kind)).toEqual(['dirty-main-checkout']);
  });

  test('a notice carries the id it is about and the forge\'s sentence, and one about no id carries none', () => {
    const { notices } = QuestionsModelUtil.questionsModelOf({
      ...BOARD,
      notices: [
        noticeOf('incident-defaulted', { incidentId: 'I3', move: 'merge-abort', cause: 'turn-closed' }, 'Example incident I3 took its default'),
        noticeOf('agent-program-refused', { jobId: 'J7', reason: 'Example reason' }, 'Example job J7 is not launched'),
        noticeOf('rounds-not-converging', { ticketId: '042' }, 'Example rounds of #042'),
        noticeOf('install-version-changed', {}, 'Example launches are held'),
      ],
    });
    expect(notices.map(({ subjectText, sentence }) => [subjectText, sentence])).toEqual([
      ['I3', 'Example incident I3 took its default'],
      ['J7', 'Example job J7 is not launched'],
      ['#042', 'Example rounds of #042'],
      [null, 'Example launches are held'],
    ]);
  });
});

describe('the tab title and notifications', () => {
  test('the open-question count leads the title only while one is open', () => {
    expect(QuestionsModelUtil.tabTitleOf('agent-progress', 3)).toBe('(3) agent-progress');
    expect(QuestionsModelUtil.tabTitleOf('agent-progress', 0)).toBe('agent-progress');
  });

  test('only a decision not seen before is new', () => {
    expect(QuestionsModelUtil.newDecisionsOf(new Set(['E1', 'E2']), BOARD.decisions).map((decision) => decision.id)).toEqual(['E3']);
  });
});
