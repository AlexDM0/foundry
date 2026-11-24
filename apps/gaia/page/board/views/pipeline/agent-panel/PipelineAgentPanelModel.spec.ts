/**
 * The pipeline agent panel's model. What matters: Hephaestus's chats, its step prompts among them, are its system lines with the prompt
 * on User's ask, never User bubbles, which are User's own messages alone; the activity line shows only while a turn runs, and says the
 * newest line the agent wrote or its last tool call; a step's questions become cards, an answered one with its confirmation; an answer
 * sends the chosen letters or the Other text and nothing while it is incomplete; a multiple question toggles its letters and starts with
 * every recommended one, a single one keeps one letter, and Other excludes the letters, since the control contract takes either letters or
 * a text; a message goes to the agent's job; a flow node's question cards are only its open ones; the agent strip waits on User with the
 * ask cue on any step whose own question is open, then reads on research, proposes on the entities step, drafts on the constitution and
 * designs or has its proposal ready on the design, and once the agent's job stopped it shows no work at all.
 */
import { describe, expect, test }                       from 'bun:test';
import type { BoardSetupQuestionDocument }              from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardTranscriptEntryDocument }            from '../../../../@types/board/ConversationDocument.ts';
import { pipelineBoardStateOf }                         from '../../../testing/PipelineFixture.ts';
import { PipelineAgentPanelModel, type AgentStripView } from './PipelineAgentPanelModel.ts';

function entry(sequence: number, changes: Partial<BoardTranscriptEntryDocument> & Pick<BoardTranscriptEntryDocument, 'role'>): BoardTranscriptEntryDocument {
  return {
    cursor:          `1.${sequence}`,
    entryKey:        `1.${sequence}.0`,
    at:              null,
    text:            '',
    toolName:        null,
    parentToolUseId: null,
    toolUseId:       null,
    asksUser:        false,
    model:           null,
    tokens:          null,
    clientAct:       null,
    sentBy:          null,
    chatSequence:    null,
    incidentIds:     [],
    pictures:        [],
    ...changes,
  };
}

function researchRecord() {
  const record = pipelineBoardStateOf('A1').pipeline.setup?.record;
  if (record === undefined) throw new Error('the fixture A1 has no setup record');
  return record;
}

describe('the chat', () => {
  test('Hephaestus\'s step prompt is its system line with the prompt to reveal, and only User\'s own message is a User bubble', () => {
    const stepPrompt = 'User completed the research step. The current step is constitution.';
    const turns = PipelineAgentPanelModel.chatTurnsOf([
      entry(1, {
        role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', text: 'You are the pipeline agent.'
      }),
      entry(2, {
        role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', text: stepPrompt
      }),
      entry(3, {
        role: 'user', clientAct: 'chat', sentBy: 'user', text: 'Keep the lint gate.'
      }),
    ], 'J4', '2026-11-12');
    expect(turns.map((turn) => (turn.kind === 'system' ? [turn.kind, turn.text, turn.revealText] : [turn.kind, turn.kind === 'user' ? turn.text : null, null])))
      .toEqual([
        ['system', 'Hephaestus started J4 for the pipeline setup', 'You are the pipeline agent.'],
        ['system', 'Hephaestus sent a message', stepPrompt],
        ['user', 'Keep the lint gate.', null],
      ]);
  });
});

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
    const answer = { form: 'letters', letters: ['b'], answeredAt: '2026-11-12T09:31:00Z' } as const;
    const answered: BoardSetupQuestionDocument[] = record.questions.map((question) => ({ ...question, answer }));
    expect(PipelineAgentPanelModel.questionCardsOf(answered, 'research', record.findings)[0]?.answeredText).toBe('Answered: No, leave them out');
  });

  test('an answer sends the chosen letter or the Other text, and nothing while it is incomplete', () => {
    const record = researchRecord();
    const [card] = PipelineAgentPanelModel.questionCardsOf(record.questions, 'research', record.findings);
    if (card === undefined) throw new Error('no card');
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, ['a'], '')).toEqual({
      boardCommandVersion: 2, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a'] }
    });
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, ['c'], ' Run them nightly ')).toEqual({
      boardCommandVersion: 2, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'text', text: 'Run them nightly' }
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
    const multipleQuestions: BoardSetupQuestionDocument[] = record.questions.map((question) => ({ ...question, multiple: true, recommended: ['b', 'a'] }));
    const [card] = PipelineAgentPanelModel.questionCardsOf(multipleQuestions, 'research', record.findings);
    if (card === undefined) throw new Error('no card');
    const initial = PipelineAgentPanelModel.initialChoiceOf(card);
    const withoutA = PipelineAgentPanelModel.choiceAfterChoosing(card, initial, 'a');
    const withAAgain = PipelineAgentPanelModel.choiceAfterChoosing(card, withoutA, 'a');
    expect([card.isMultiple, initial, withoutA, withAAgain]).toEqual([true, ['a', 'b'], ['b'], ['a', 'b']]);
    expect(PipelineAgentPanelModel.answerCommandOf('S1', card, withAAgain, '')).toEqual({
      boardCommandVersion: 2, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a', 'b'] }
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
    expect(PipelineAgentPanelModel.messageCommandOf('J4', ' the tests also need Redis ')).toEqual({
      boardCommandVersion: 2, kind: 'job-message', jobId: 'J4', text: 'the tests also need Redis', pictures: [], incidentId: null,
    });
    expect(PipelineAgentPanelModel.messageCommandOf(null, 'hello')).toBeNull();
    expect(PipelineAgentPanelModel.messageCommandOf('J4', ' ')).toBeNull();
  });
});

describe('the questions of a flow node', () => {
  test('lists only the open questions among the node\'s ids, and the open ids of every step', () => {
    const { setup } = pipelineBoardStateOf('A2-question-open').pipeline;
    if (setup === null || setup === undefined) throw new Error('the fixture A2-question-open has no setup');
    const { questions, findings } = setup.record;
    expect(PipelineAgentPanelModel.openQuestionIdsOf(questions)).toEqual(['Q3']);
    expect(PipelineAgentPanelModel.openQuestionCardsOf(questions, ['Q1', 'Q3'], findings).map((card) => card.questionId)).toEqual(['Q3']);
    expect(PipelineAgentPanelModel.openQuestionCardsOf(questions, ['Q3'], findings)[0]?.eyebrow).toBe('Question · gate browser-tests');
  });
});

describe('the agent strip', () => {
  function partsOf(strip: AgentStripView): readonly (string | null)[] {
    return [strip.text, strip.flintHabitat.kind, strip.flintCue];
  }

  function designQuestions(): BoardSetupQuestionDocument[] {
    const { setup } = pipelineBoardStateOf('A2-question-open').pipeline;
    if (setup === null || setup === undefined) throw new Error('the fixture A2-question-open has no setup');
    return [...setup.record.questions];
  }

  function openQuestionOn(step: BoardSetupQuestionDocument['step']): BoardSetupQuestionDocument {
    const openQuestion = designQuestions().find((question) => question.answer === null);
    if (openQuestion === undefined) throw new Error('the fixture A2-question-open has no open question');
    return { ...openQuestion, step };
  }

  test('reads on research, drafts on the constitution, designs, and is ready once the agent proposed, while the job runs', () => {
    const answeredQuestions = designQuestions().filter((question) => question.answer !== null);
    const working = { questions: answeredQuestions, readyToContinue: ['research' as const] };
    expect([
      PipelineAgentPanelModel.agentStripOf('research', working, 'running'),
      PipelineAgentPanelModel.agentStripOf('entities', working, 'running'),
      PipelineAgentPanelModel.agentStripOf('constitution', working, 'running'),
      PipelineAgentPanelModel.agentStripOf('design', working, 'running'),
      PipelineAgentPanelModel.agentStripOf('design', { ...working, readyToContinue: ['design'] }, 'running'),
    ].map(partsOf)).toEqual([
      ['Reading the repository', 'research-slot', 'agent-reads'],
      ['Proposing the entities', 'research-slot', 'agent-reads'],
      ['Drafting the constitution', 'constitution-slot', null],
      ['Designing the pipeline', 'pipeline-design-slot', 'agent-thinks'],
      ['Proposal ready', 'pipeline-design-slot', 'agent-is-done'],
    ]);
  });

  test('waits on User with the ask cue on each step whose own question is open, before the proposal and while the job runs', () => {
    const stripOf = (step: BoardSetupQuestionDocument['step']) => PipelineAgentPanelModel.agentStripOf(
      step, { questions: [openQuestionOn(step)], readyToContinue: ['research', 'design'] }, 'running'
    );
    expect((['research', 'entities', 'constitution', 'design'] as const).map((step) => partsOf(stripOf(step)))).toEqual([
      ['Waiting for your answer', 'research-slot', 'agent-waits-on-user'],
      ['Waiting for your answer', 'research-slot', 'agent-waits-on-user'],
      ['Waiting for your answer', 'constitution-slot', 'agent-waits-on-user'],
      ['Waiting for your answer', 'pipeline-design-slot', 'agent-waits-on-user'],
    ]);
  });

  test('an open question of another step leaves the strip at its work: the research strip reads while a design question is open', () => {
    expect(partsOf(PipelineAgentPanelModel.agentStripOf('research', { questions: designQuestions(), readyToContinue: [] }, 'running')))
      .toEqual(['Reading the repository', 'research-slot', 'agent-reads']);
  });

  test('a stopped job shows no work on any step, yet an open question still waits and a ready proposal stays ready', () => {
    const idle = { questions: [], readyToContinue: [] };
    expect([
      PipelineAgentPanelModel.agentStripOf('research', idle, null),
      PipelineAgentPanelModel.agentStripOf('constitution', idle, null),
      PipelineAgentPanelModel.agentStripOf('design', idle, null),
      PipelineAgentPanelModel.agentStripOf('research', { ...idle, questions: [openQuestionOn('research')] }, null),
      PipelineAgentPanelModel.agentStripOf('design', { ...idle, readyToContinue: ['design'] }, null),
    ].map(partsOf)).toEqual([
      ['Stopped', 'research-slot', 'agent-is-idle'],
      ['Stopped', 'constitution-slot', 'agent-is-idle'],
      ['Stopped', 'pipeline-design-slot', 'agent-is-idle'],
      ['Waiting for your answer', 'research-slot', 'agent-waits-on-user'],
      ['Proposal ready', 'pipeline-design-slot', 'agent-is-done'],
    ]);
  });
});
