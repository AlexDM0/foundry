/**
 * The pipeline agent panel's model. What matters: the activity line shows only while a turn runs, and says the newest line the agent wrote
 * or its last tool call; a step's questions become cards, an answered one with its confirmation; an answer sends the chosen letters or the
 * Other text and nothing while it is incomplete; a multiple question toggles its letters and starts with every recommended one, a single
 * one keeps one letter, and Other excludes the letters, since the control contract takes either letters or a text; a message goes to the
 * agent's job; a flow node's question cards are only its open ones; the agent strip reads on research, drafts on the constitution, and
 * waits on the design only while a design question is open.
 */
import { describe, expect, test } from 'bun:test';

import type { SetupQuestion }           from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { TranscriptEntryDocument } from '../../../api/TranscriptStreamClient.ts';
import { pipelineBoardStateOf }         from '../../../testing/PipelineFixture.ts';
import { PipelineAgentPanelModel }      from './PipelineAgentPanelModel.ts';

function entry(sequence: number, changes: Partial<TranscriptEntryDocument> & Pick<TranscriptEntryDocument, 'role'>): TranscriptEntryDocument {
  return {
    cursor: `1.${sequence}`, entryKey: `1.${sequence}.0`, at: null, text: '', ...changes
  };
}

function researchRecord() {
  const record = pipelineBoardStateOf('A1').pipelineSetup?.record;
  if (record === undefined) throw new Error('the fixture A1 has no setup record');
  return record;
}

describe('the activity line', () => {
  test('while a turn runs it is the newest line the agent wrote', () => {
    expect(PipelineAgentPanelModel.activityLineOf([
      entry(1, { role: 'assistant', text: 'Reading package.json.\n\nSorting the scripts into build and merge…' }),
    ])).toBe('Sorting the scripts into build and merge…');
  });

  test('a turn with only tool calls names its last call, and a turn that ended shows nothing', () => {
    expect(PipelineAgentPanelModel.activityLineOf([entry(1, {
      role: 'tool-call', text: 'package.json', toolName: 'Read', toolUseId: 't1'
    })]))
      .toBe('Read running…');
    expect(PipelineAgentPanelModel.activityLineOf([
      entry(1, { role: 'assistant', text: 'Done.' }),
      entry(2, { role: 'turn-end' }),
    ])).toBeNull();
    expect(PipelineAgentPanelModel.activityLineOf([])).toBeNull();
  });
});

describe('the question cards', () => {
  test('a step\'s questions become cards named by their finding, with the Other letter after the options', () => {
    const record = researchRecord();
    const [card] = PipelineAgentPanelModel.questionCardsOf(record.questions, 'research', record.findings);
    expect(card?.eyebrow).toBe('Question · browser-tests');
    expect(card?.otherLetter).toBe('c');
    expect(card?.answeredText).toBeNull();
    expect(PipelineAgentPanelModel.questionCardsOf(record.questions, 'design', record.findings)).toEqual([]);
  });

  test('an answered question shows its confirmation', () => {
    const record = researchRecord();
    const answered: SetupQuestion[] = record.questions.map((question) => ({ ...question, answer: { letters: ['b'], answeredAt: '2026-11-12T09:31:00Z' } }));
    expect(PipelineAgentPanelModel.questionCardsOf(answered, 'research', record.findings)[0]?.answeredText).toBe('Answered: No, leave them out');
  });

  test('an answer sends the chosen letter or the Other text, and nothing while it is incomplete', () => {
    const record = researchRecord();
    const [card] = PipelineAgentPanelModel.questionCardsOf(record.questions, 'research', record.findings);
    if (card === undefined) throw new Error('no card');
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, ['a'], '')).toEqual({
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a'] }
    });
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, ['c'], ' Run them nightly ')).toEqual({
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'text', text: 'Run them nightly' }
    });
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, ['c'], '  ')).toBeNull();
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, [], '')).toBeNull();
    expect(PipelineAgentPanelModel.initialChoiceOf(card)).toEqual(['a']);
  });

  test('a single question keeps the one letter chosen last', () => {
    const record = researchRecord();
    const [card] = PipelineAgentPanelModel.questionCardsOf(record.questions, 'research', record.findings);
    if (card === undefined) throw new Error('no card');
    expect([card.isMultiple, PipelineAgentPanelModel.choiceAfterChoosing(card, ['a'], 'b'), PipelineAgentPanelModel.choiceAfterChoosing(card, ['a'], 'c')])
      .toEqual([false, ['b'], ['c']]);
  });

  test('a multiple question toggles its letters in option order, starts with every recommended one and sends them all', () => {
    const record = researchRecord();
    const multipleQuestions: SetupQuestion[] = record.questions.map((question) => ({ ...question, multiple: true, recommended: ['b', 'a'] }));
    const [card] = PipelineAgentPanelModel.questionCardsOf(multipleQuestions, 'research', record.findings);
    if (card === undefined) throw new Error('no card');
    const initial = PipelineAgentPanelModel.initialChoiceOf(card);
    const withoutA = PipelineAgentPanelModel.choiceAfterChoosing(card, initial, 'a');
    const withAAgain = PipelineAgentPanelModel.choiceAfterChoosing(card, withoutA, 'a');
    expect([card.isMultiple, initial, withoutA, withAAgain]).toEqual([true, ['a', 'b'], ['b'], ['a', 'b']]);
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, withAAgain, '')).toEqual({
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a', 'b'] }
    });
    expect(PipelineAgentPanelModel.answeredTextAfterSending(card, withAAgain, '')).toBe('Answered: Yes, in the merge phase, No, leave them out');
  });

  test('on a multiple question Other drops the letters, a letter drops Other, and Other chosen again clears it', () => {
    const record = researchRecord();
    const [card] = PipelineAgentPanelModel.questionCardsOf(record.questions.map((question) => ({ ...question, multiple: true })), 'research', record.findings);
    if (card === undefined) throw new Error('no card');
    expect([
      PipelineAgentPanelModel.choiceAfterChoosing(card, ['a', 'b'], 'c'),
      PipelineAgentPanelModel.choiceAfterChoosing(card, ['c'], 'a'),
      PipelineAgentPanelModel.choiceAfterChoosing(card, ['c'], 'c'),
    ]).toEqual([['c'], ['a'], []]);
  });
});

describe('the message', () => {
  test('goes to the agent\'s job, and nothing goes with no job or an empty text', () => {
    expect(PipelineAgentPanelModel.messageCommandOf('J4', ' the tests also need Redis ')).toEqual({ kind: 'job-message', jobId: 'J4', text: 'the tests also need Redis' });
    expect(PipelineAgentPanelModel.messageCommandOf(null, 'hello')).toBeNull();
    expect(PipelineAgentPanelModel.messageCommandOf('J4', ' ')).toBeNull();
  });
});

describe('the questions of a flow node', () => {
  test('lists only the open questions among the node\'s ids, and the open ids of every step', () => {
    const setup = pipelineBoardStateOf('A2-question-open').pipelineSetup;
    if (setup === null || setup === undefined) throw new Error('the fixture A2-question-open has no setup');
    const { questions, findings } = setup.record;
    expect(PipelineAgentPanelModel.openQuestionIdsOf(questions)).toEqual(['Q3']);
    expect(PipelineAgentPanelModel.openQuestionCardsOf(questions, ['Q1', 'Q3'], findings).map((card) => card.questionId)).toEqual(['Q3']);
    expect(PipelineAgentPanelModel.openQuestionCardsOf(questions, ['Q3'], findings)[0]?.eyebrow).toBe('Question · gate browser-tests');
  });
});

describe('the agent strip', () => {
  test('reads on research, drafts on the constitution, waits while a design question is open and is ready once the agent proposed', () => {
    const setup = pipelineBoardStateOf('A2-question-open').pipelineSetup;
    if (setup === null || setup === undefined) throw new Error('the fixture A2-question-open has no setup');
    const { questions } = setup.record;
    const proposed = { questions, readyToContinue: ['design' as const] };
    expect(PipelineAgentPanelModel.agentStripOf('research', proposed)).toEqual({ text: 'Reading the repository', pose: 'typing' });
    expect(PipelineAgentPanelModel.agentStripOf('constitution', proposed)).toEqual({ text: 'Drafting the constitution', pose: 'thinking' });
    expect(PipelineAgentPanelModel.agentStripOf('design', proposed)).toEqual({ text: 'Waiting for your answer', pose: 'waiting' });
    const answeredQuestions = questions.filter((question) => question.answer !== null);
    expect(PipelineAgentPanelModel.agentStripOf('design', { ...proposed, questions: answeredQuestions })).toEqual({ text: 'Proposal ready', pose: 'happy' });
  });

  test('an open design step with no question and no proposal yet is designing, never ready', () => {
    expect(PipelineAgentPanelModel.agentStripOf('design', { questions: [], readyToContinue: ['research'] }))
      .toEqual({ text: 'Designing the pipeline', pose: 'thinking' });
  });
});
