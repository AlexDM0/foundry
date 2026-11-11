/**
 * The question panel's model against synthetic boards. What matters: which decision shows (the pointed one while open, else the first one
 * opened since the fold, else the first) and whether the panel shows against the fold (it shows again once a decision opens that was not
 * open at the fold, and whenever User opened it); options stay exactly as asked, `(Recommended)` and all, with consequences only when the
 * agent noted them; own words only on a decision of one question; a code-opened decision has no conversation, no steps and is asked by the
 * Overseer; the ticket block reads the first ticket's sections and Acceptance as served, a wrapped line joined to its paragraph as
 * Markdown reads it, and omits them when the board serves none; the earlier answers join the openings by decision id, on that ticket
 * only, newest first; the steps are the last top-level tool calls with the asking call current; the queue foot names the later
 * decisions, wrapping round; and `open since` is the sliced stamp, never the clock.
 */
import { describe, expect, test } from 'bun:test';

import type { DecisionDocument }                from '../../@types/ConversationDocuments.ts';
import { OpenDecisionsUtil, type OpenDecision } from '../../conversation/OpenDecisionsUtil.ts';
import {
  ASKING_TRANSCRIPT,
  DARK_MODE_QUESTION,
  EXAMPLE_FORMAT,
  PARKED_DECISION,
  TWO_QUESTION_DECISION,
  examplePanelTicket,
  exampleQuestionPanelBoard
} from '../../testing/QuestionPanelFixture.ts';
import { QUESTION_PANEL_STEPS_SHOWN, QuestionPanelModel, type QuestionPanelBoard } from './QuestionPanelModel.ts';

function queueOf(...decisions: readonly DecisionDocument[]): OpenDecision[] {
  return OpenDecisionsUtil.openDecisionsOf({ decisions, questionHistory: [] });
}

function modelOf(board: QuestionPanelBoard, decisionId: string) {
  const queue = OpenDecisionsUtil.openDecisionsOf(board);
  const shown = queue.find(({ decision }) => decision.id === decisionId);
  if (shown === undefined) throw new Error(`no open decision ${decisionId}`);
  return QuestionPanelModel.questionPanelModelOf(board, queue, shown, EXAMPLE_FORMAT);
}

describe('QuestionPanelModel.shownDecisionOf', () => {
  const queue = queueOf(PARKED_DECISION, DARK_MODE_QUESTION, TWO_QUESTION_DECISION);

  test('shows the pointed decision while it is open', () => {
    expect(QuestionPanelModel.shownDecisionOf(queue, 'E8', [])?.decision.id).toBe('E8');
  });

  test('without a pointed one, shows the first opened since the fold, else the first', () => {
    expect(QuestionPanelModel.shownDecisionOf(queue, 'E1', ['E7'])?.decision.id).toBe('E8');
    expect(QuestionPanelModel.shownDecisionOf(queue, null, [])?.decision.id).toBe('E7');
    expect(QuestionPanelModel.shownDecisionOf(queue, null, ['E7', 'E8', 'E6'])?.decision.id).toBe('E7');
  });

  test('shows none on an empty queue', () => {
    expect(QuestionPanelModel.shownDecisionOf([], 'E7', [])).toBeNull();
  });
});

describe('QuestionPanelModel.panelIsShownOf', () => {
  const queue = queueOf(DARK_MODE_QUESTION, TWO_QUESTION_DECISION);

  test('shows while a decision is open that was not open at the fold', () => {
    expect(QuestionPanelModel.panelIsShownOf(queue, [], false)).toBe(true);
    expect(QuestionPanelModel.panelIsShownOf(queue, ['E7'], false)).toBe(true);
  });

  test('stays folded while every open decision was open at the fold, and shows once User opened it', () => {
    expect(QuestionPanelModel.panelIsShownOf(queue, ['E7', 'E8'], false)).toBe(false);
    expect(QuestionPanelModel.panelIsShownOf(queue, ['E7', 'E8'], true)).toBe(true);
  });

  test('never shows with nothing open', () => {
    expect(QuestionPanelModel.panelIsShownOf([], [], true)).toBe(false);
  });
});

describe('QuestionPanelModel.nextDecisionIdOf', () => {
  test('moves to the next decision and wraps round to the first', () => {
    const queue = queueOf(DARK_MODE_QUESTION, TWO_QUESTION_DECISION, PARKED_DECISION);
    expect(QuestionPanelModel.nextDecisionIdOf(queue, 'E8')).toBe('E6');
    expect(QuestionPanelModel.nextDecisionIdOf(queue, 'E6')).toBe('E7');
  });
});

describe('QuestionPanelModel.questionPanelModelOf', () => {
  test('heads an agent question with its asker, role, header mark, tickets and the sliced open-since clock', () => {
    expect(modelOf(exampleQuestionPanelBoard(), 'E7').head).toEqual({
      askerText: 'J4', askerRoleText: 'builder', headerMark: 'Tokens', ticketIds: ['004'], openSinceText: '14:06', escalated: false
    });
  });

  test('open since is the stamp\'s own clock, sliced, and none before the board names its slices', () => {
    const board = exampleQuestionPanelBoard();
    const queue = OpenDecisionsUtil.openDecisionsOf(board);
    const [shown] = queue;
    if (shown === undefined) throw new Error('no open decision');
    expect(QuestionPanelModel.questionPanelModelOf(board, queue, shown, { todayCalendarDate: '2026-10-30', slices: EXAMPLE_FORMAT.slices }).head.openSinceText).toBe('10-29 14:06');
    expect(QuestionPanelModel.questionPanelModelOf(board, queue, shown, { todayCalendarDate: '2026-10-29', slices: null }).head.openSinceText).toBeNull();
  });

  test('keeps every option exactly as asked, (Recommended) included, with consequences only where the agent noted them', () => {
    const [question] = modelOf(exampleQuestionPanelBoard(), 'E7').questions;
    expect(question?.options).toEqual([
      {
        letter:       'a',
        label:        'Extend the shared theme tokens (Recommended)',
        description:  'Add account entries to the token file every page reads.',
        consequences: {
          touches:          ['src/theme/tokens.css', 'src/account/Layout.tsx'],
          tradeOff:         'One place to change; the storefront reads the same file.',
          acceptanceEffect: 'meets A1 to A3 as written',
        },
      },
      {
        letter: 'b', label: 'A scoped stylesheet for the account pages', description: 'A new stylesheet only the account pages load.', consequences: null
      },
      {
        letter: 'c', label: 'Follow the system setting only', description: null, consequences: { acceptanceEffect: 'A2 fails: the ticket\'s Acceptance must change first' }
      },
    ]);
  });

  test('allows own words on a decision of one question only, and names the command the answer posts', () => {
    const board = exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] });
    expect(modelOf(board, 'E7').ownWordsAllowed).toBe(true);
    expect(modelOf(board, 'E8').ownWordsAllowed).toBe(false);
    expect(modelOf(board, 'E7').answerLineText).toBe('decision-answer E7');
  });

  test('a code-opened decision is the Overseer\'s, with no role, no steps and no conversation tab', () => {
    const model = modelOf(exampleQuestionPanelBoard({ decisions: [PARKED_DECISION] }), 'E6');
    expect(model.head.askerText).toBe('Overseer');
    expect(model.head.askerRoleText).toBeNull();
    expect(model.stepsJobId).toBeNull();
    expect(model.readingTabs).toEqual(['background']);
    expect(model.stoppedReason).toBeNull();
  });

  test('a decision naming no ticket has no ticket block, no ticket tab and no earlier answers', () => {
    const model = modelOf(exampleQuestionPanelBoard({ decisions: [{ ...DARK_MODE_QUESTION, ticketIds: [] }] }), 'E7');
    expect(model.ticket).toBeNull();
    expect(model.readingTabs).toEqual(['background', 'conversation']);
    expect(model.earlierAnswers).toEqual([]);
  });

  test('the ticket block reads the first ticket\'s epics, held count, the asking job\'s calls, and its Wanted, Brief and Acceptance as served', () => {
    const { ticket } = modelOf(exampleQuestionPanelBoard({ decisions: [{ ...DARK_MODE_QUESTION, ticketIds: ['004', '005'] }] }), 'E7');
    expect(ticket?.ticketId).toBe('004');
    expect(ticket?.epics).toEqual([{ key: 'customer-account', title: 'Customer account', slot: 2 }]);
    expect(ticket?.heldCount).toBe(2);
    expect(ticket?.callsText).toBe('J4, call 38 / 150');
    expect(ticket?.wantedText).toBe('The account pages follow the system colour scheme. An override is remembered per browser.');
    expect(ticket?.briefText).toBe('Work belongs in `src/account/**`.');
    expect(ticket?.acceptanceItems.map((item) => item.label)).toEqual(['A1', 'A2', 'A3']);
  });

  test('a section wrapped in its file reads as Markdown reads it: soft breaks join, while blocks, hard breaks and fences keep their lines', () => {
    const brief = [
      'Work belongs in `src/auth/`, and the reset mail',
      'stays as it is.',
      '',
      'Facts you do not need to look up:',
      '',
      '1. `RateLimit.consume` exists and returns',
      '   a verdict.',
      '- A second item',
      '',
      'Ends here with a hard break  ',
      'then a line.',
      '```',
      'first code line',
      'second code line',
      '```',
      'After the fence.',
    ].join('\n');
    const wrappedTicket = examplePanelTicket('004', { sections: [{ heading: 'Brief', markdown: brief }] });
    const { ticket } = modelOf(exampleQuestionPanelBoard({ tickets: [wrappedTicket] }), 'E7');
    expect(ticket?.briefText?.split('\n')).toEqual([
      'Work belongs in `src/auth/`, and the reset mail stays as it is.',
      '',
      'Facts you do not need to look up:',
      '',
      '1. `RateLimit.consume` exists and returns a verdict.',
      '- A second item',
      '',
      'Ends here with a hard break  ',
      'then a line.',
      '```',
      'first code line',
      'second code line',
      '```',
      'After the fence.',
    ]);
  });

  test('the ticket block omits the sections, the Acceptance and the ticket tab when the board serves none', () => {
    const model = modelOf(exampleQuestionPanelBoard({ tickets: [examplePanelTicket('004')] }), 'E7');
    expect(model.ticket?.wantedText).toBeNull();
    expect(model.ticket?.briefText).toBeNull();
    expect(model.ticket?.acceptanceItems).toEqual([]);
    expect(model.readingTabs).toEqual(['background', 'conversation']);
  });

  test('earlier answers join the openings by decision id, keep to the ticket, leave out the shown decision and come newest first', () => {
    const history = [
      ...exampleQuestionPanelBoard().questionHistory ?? [],
      {
        kind: 'decision-answered', at: '2026-10-29T14:20:00+01:00', decisionId: 'E7', fields: { answer: { 'Where?': 'tokens' } }
      },
    ];
    const opening = {
      kind: 'decision-opened', at: '2026-10-29T13:30:00+01:00', decisionId: 'E1', fields: { kind: 'agent-question', ticketIds: ['004'] }
    };
    const answered = {
      kind: 'decision-answered', at: '2026-10-29T13:35:00+01:00', decisionId: 'E1', fields: { answer: { 'Which?': 'first' } }
    };
    const model = modelOf(exampleQuestionPanelBoard({ questionHistory: [opening, answered, ...history] }), 'E7');
    expect(model.earlierAnswers.map(({ decisionId, answeredClockText, answerText }) => [decisionId, answeredClockText, answerText])).toEqual([
      ['E3', '13:52', 'Auto · Light · Dark · account header'],
      ['E1', '13:35', 'first'],
    ]);
  });

  test('the queue foot names the later decisions and their askers, wrapping round to the first', () => {
    const board = exampleQuestionPanelBoard({ decisions: [PARKED_DECISION, DARK_MODE_QUESTION, TWO_QUESTION_DECISION] });
    expect(modelOf(board, 'E8').queueFoot).toEqual({ position: 2, count: 3, laterEntries: [{ idText: 'E6', askerText: 'Overseer' }, { idText: 'E7', askerText: 'J4' }] });
  });

  test('an escalated decision is marked in the head', () => {
    const board = {
      ...exampleQuestionPanelBoard(),
      questionHistory: [{
        kind: 'incident-escalated', at: '2026-10-29T14:07:00+01:00', incidentId: 'I2', fields: { decisionId: 'E7' }
      }],
    };
    expect(modelOf(board, 'E7').head.escalated).toBe(true);
  });
});

describe('QuestionPanelModel.lastStepsOf', () => {
  test('lists the last top-level tool calls oldest first, a subagent\'s left out, the asking call current', () => {
    const steps = QuestionPanelModel.lastStepsOf(ASKING_TRANSCRIPT, QUESTION_PANEL_STEPS_SHOWN);
    expect(steps.map((step) => [step.toolName, step.isCurrent])).toEqual([
      ['Read', false], ['Grep', false], ['Read', false], ['Bash', false], ['Glob', false], ['AskUserQuestion', true],
    ]);
    expect(steps.map((step) => step.text)).not.toContain('src/theme/tokens.css');
  });

  test('a last call that is no question is not current', () => {
    const steps = QuestionPanelModel.lastStepsOf(ASKING_TRANSCRIPT.slice(0, -1), QUESTION_PANEL_STEPS_SHOWN);
    expect(steps.some((step) => step.isCurrent)).toBe(false);
  });
});
