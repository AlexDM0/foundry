/**
 * The Questions view's model. What matters: an agent's questions come first, before the code-opened kinds, and an escalated one is marked;
 * an answered decision is read back from the log; and only open decisions count, never a finding or a notice.
 */
import { describe, expect, test } from 'bun:test';

import type { ConversationBoardDocument, DecisionDocument } from '../../@types/ConversationDocuments.ts';
import { QuestionsModelUtil }                               from './QuestionsModel.ts';

const AT = '2026-10-29T20:00:00+01:00';

function decisionOf(id: string, kind: string, questions: DecisionDocument['questions'] = []): DecisionDocument {
  return {
    id, kind, ticketIds: ['042'], jobId: 'J3', askedBy: 'builder', questions, context: 'Example context', openedAt: AT
  };
}

const ONE_QUESTION = [{
  question: 'Which store?', header: 'Store', multiSelect: false, options: [{ label: 'Disk', description: '' }, { label: 'Memory', description: '' }]
}];

const BOARD: ConversationBoardDocument = {
  jobs: [{
    id: 'J3', kind: 'build', ticketIds: ['042'], state: 'running'
  }],
  decisions: [decisionOf('E1', 'parked'), decisionOf('E2', 'agent-question', ONE_QUESTION), decisionOf('E3', 'agent-question')],
  incidents: [],
  notices:   [{ kind: 'dirty-main-checkout' }],
  page:      {
    tickets: [{
      id: '050', title: 'Example finding', status: 'draft', priority: 'low', filedByJob: 'J3'
    }],
  },
  questionHistory: [
    {
      kind: 'job-launched', at: AT, jobId: 'J1', fields: { kind: 'review', ticketIds: ['040'] }
    },
    {
      kind: 'incident-escalated', at: AT, incidentId: 'I4', fields: { decisionId: 'E3' }
    },
    {
      kind: 'decision-answered', at: AT, decisionId: 'E0', fields: { answer: { 'Which store?': 'Disk' } }
    },
  ],
};

describe('QuestionsModelUtil.questionsModelOf', () => {
  const model = QuestionsModelUtil.questionsModelOf(BOARD);

  test('lists agent questions first, then the code-opened kinds, marking the escalated one', () => {
    expect(model.openDecisions.map(({ decision, escalated }) => [decision.id, escalated])).toEqual([['E2', false], ['E3', true], ['E1', false]]);
  });

  test('reads answered decisions back from the log with their answers', () => {
    expect(model.answeredDecisions).toEqual([{ decisionId: 'E0', answeredAt: AT, answer: [['Which store?', 'Disk']] }]);
  });

  test('counts only the open decisions: a finding and a notice add nothing', () => {
    expect(model.openQuestionCount).toBe(3);
    expect(model.notices).toEqual([{ kind: 'dirty-main-checkout' }]);
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
