/**
 * The Questions view's model. What matters: an answered decision is read back from the log; a notice carries the id it is about and its
 * sentence; and only open decisions count, never a finding or a notice. The order of the open decisions is `OpenDecisionsUtil`'s, held by
 * its own spec.
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

  test('reads answered decisions back from the log with their answers', () => {
    expect(model.answeredDecisions).toEqual([{ decisionId: 'E0', answeredAt: AT, answer: [['Which store?', 'Disk']] }]);
  });

  test('counts only the open decisions: a finding and a notice add nothing', () => {
    expect(model.openQuestionCount).toBe(3);
    expect(model.notices.map((notice) => notice.kind)).toEqual(['dirty-main-checkout']);
  });

  test('a notice carries the id it is about and its sentence, and one about no id carries none', () => {
    const { notices } = QuestionsModelUtil.questionsModelOf({
      ...BOARD,
      notices: [
        {
          kind: 'incident-defaulted', incidentId: 'I3', move: 'merge-abort', cause: 'turn-closed'
        },
        { kind: 'agent-program-refused', jobId: 'J7', reason: 'Example reason' },
        { kind: 'rounds-not-converging', ticketId: '042' },
        { kind: 'install-version-changed' },
      ],
    });
    expect(notices.map(({ subjectText, sentence }) => [subjectText, sentence])).toEqual([
      ['I3', 'incident I3 took its default, merge-abort: its delivery turn closed'],
      ['J7', 'job J7 is not launched: Example reason'],
      ['#042', 'ticket #042\'s review rounds are not converging'],
      [null, expect.stringContaining('the install version changed')],
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
