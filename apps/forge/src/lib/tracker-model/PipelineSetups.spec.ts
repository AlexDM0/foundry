/**
 * The setup record's moves on the Board. What matters: one record is open at a time and its id is never reused; a step reopened sends
 * every later done step to `needs-recheck`, never back to `not-started`, and only Continue clears a recheck; only User's edit of an
 * earlier step of a first setup reopens it; the constitution is kept byte for byte, a source must name a line the text holds, and an
 * edit re-anchors the sources so only the edited line loses its tag; Undo writes the base value back; an unreadable record and a pending
 * Apply refuse every move; and each move refuses with its reason and logs ids and values only. The `entities` step is walked only by a
 * record whose step states hold it: a first setup and an update of a pipeline without entities open with no such state and never reach
 * it, while a record over entities walks it between research and the constitution. The edits of a copy to another entity carry their
 * set's batch, the first of their edit ids, and still undo one by one or as one set at one revision, a copy to two entities one entity
 * at a time; no other edit carries a batch, so
 * its set is itself; and a field inside an entity is
 * refused as the same field at the top would be. A finding of one entity goes to that entity's part. A first setup starts to walk the
 * `entities` step at the forge's second layout finding while research is current, and nothing else starts it: one layout finding, an
 * update, an entity's finding or a record past research keep today's steps, unchanged and unlogged. The agent asks at the `entities` step,
 * and User's answer there from a later step reopens it. A draft whose entities the validator refuses is kept, and Continue of any step
 * and Apply are refused `entity-refusals-stand` until an edit clears every refusal.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf } from '../../testing/BoardFixtures.ts';
import type { Pipeline }                 from './@types/Pipeline.ts';
import type {
  PipelineDraftEdit,
  PipelineSetup,
  PipelineSetupOpening,
  PipelineSetupReading,
  ResearchFindingRecording
} from './@types/PipelineSetup.ts';
import type { Board }              from './Board.ts';
import type { BoardRefusalDetail } from './BoardRefusal.ts';
import { PipelineUtil }            from './utils/PipelineUtil.ts';

const AT = '2026-11-12T10:00:00+01:00';

const FIRST_SETUP: PipelineSetupOpening = {
  mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
};

const STORED_PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install' }, { name: 'build', run: 'bun run build' }],
  gates:   [{ name: 'types', run: 'bun run typecheck' }, { name: 'test', run: 'bun test' }],
  phases:  { build: ['types', 'test'], review: ['test'], merge: ['types', 'test'] },
};

const CONSTITUTION_TEXT = '# Example constitution\n\n## Rules\n- Keep every change small.\n- Name things in full.\n- Keep every change small.\n';

function openedBoard(opening: PipelineSetupOpening = FIRST_SETUP, pipeline?: Pipeline): { board: Board; setupId: string } {
  const { board } = boardFixture(pipeline === undefined ? {} : { pipeline });
  return { board, setupId: board.openSetup(opening, AT).setup.setupId };
}

function openSetupOf(board: Board): Readonly<PipelineSetup> {
  const setup = board.pipelineSetup();
  if (setup === null) throw new Error('no setup is open');
  return setup;
}

function boardAtDesign(): { board: Board; setupId: string } {
  const opened = openedBoard();
  for (const step of ['research', 'constitution'] as const) opened.board.continueSetupStep(opened.setupId, step, AT);
  return opened;
}

describe('opening a record', () => {
  test('a first setup opens at the research with the billing it was started with done, and its id is never reused', () => {
    const { board, progress } = boardFixture();

    const { setup, logged } = board.openSetup(FIRST_SETUP, AT);

    expect(setup.setupId).toBe('S1');
    expect(setup.stepStates).toEqual({
      billing: 'done', research: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
    });
    expect(setup.currentStep).toBe('research');
    expect([setup.constitution, setup.draft, setup.baseContentHash]).toEqual([null, null, null]);
    expect(logged).toEqual([{
      at: AT, kind: 'pipeline-setup-opened', setupId: 'S1', fields: { mode: 'setup', replacesUnreadablePipeline: false }
    }]);
    board.startOverSetup('S1', AT);
    expect(board.openSetup(FIRST_SETUP, AT).setup.setupId).toBe('S2');
    expect(progress.nextSetupId).toBe(3);
  });

  test('a second start beside an open record refuses setup-in-progress', () => {
    const { board } = openedBoard();

    expect(refusalDetailOf(() => board.openSetup(FIRST_SETUP, AT))).toEqual({ reason: 'setup-in-progress', setupId: 'S1' });
  });

  test('an update starts from the stored pipeline with every step before Apply done, at the design step', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);
    const setup = openSetupOf(board);

    expect(setupId).toBe('S1');
    expect(setup.stepStates).toEqual({
      billing: 'done', research: 'done', constitution: 'done', design: 'done', apply: 'not-started'
    });
    expect(setup.currentStep).toBe('design');
    expect(setup.draft).toEqual(STORED_PIPELINE);
    expect(setup.baseContentHash).toBe(PipelineUtil.contentHashOf(STORED_PIPELINE));
    expect(setup.constitution).toEqual({
      markdown: '', annotations: [], draftedFrom: { contributing: true, research: true, installedDefault: false }, baseBlob: null, revision: 0
    });
  });

  test('an update or advise with no stored pipeline refuses no-pipeline-to-update', () => {
    const { board } = boardFixture();

    expect(refusalDetailOf(() => board.openSetup({ ...FIRST_SETUP, mode: 'advise' }, AT))).toEqual({ reason: 'no-pipeline-to-update', mode: 'advise' });
  });

  test('main\'s constitution opens the draft byte for byte, with the stored sources whose lines it still holds', () => {
    const { board } = openedBoard({
      ...FIRST_SETUP,
      mainConstitution:  { path: 'CONSTITUTION.md', markdown: CONSTITUTION_TEXT, blob: 'a1b2c3d4' },
      storedAnnotations: [
        {
          lineText: '- Name things in full.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
        },
        {
          lineText: '- A line main no longer holds.', occurrence: 1, kind: 'research', path: null
        },
      ],
    });
    const { constitution } = openSetupOf(board);

    expect(constitution?.markdown).toBe(CONSTITUTION_TEXT);
    expect(constitution?.baseBlob).toBe('a1b2c3d4');
    expect(constitution?.annotations.map((annotation) => annotation.lineText)).toEqual(['- Name things in full.']);
  });
});

describe('a record no move can change', () => {
  const UNREADABLE: PipelineSetupReading = { verdict: 'malformed', reason: 'setupId is missing' };

  test.each<[string, (board: Board) => unknown]>([
    ['openSetup', (board) => board.openSetup(FIRST_SETUP, AT)],
    ['setSetupBilling', (board) => board.setSetupBilling('S1', { mode: 'subscription' }, AT)],
    ['continueSetupStep', (board) => board.continueSetupStep('S1', 'billing', AT)],
    ['startOverSetup', (board) => board.startOverSetup('S1', AT)],
  ])('an unreadable record refuses %s and is never written over', (_move, move) => {
    const { board, records } = boardFixture({ pipelineSetup: UNREADABLE });

    expect(refusalDetailOf(() => move(board))).toEqual({ reason: 'pipeline-setup-unreadable', problem: 'setupId is missing' });
    expect(board.pipelineSetupWrite()).toEqual({ write: 'unchanged' });
    expect(records).toEqual([]);
  });

  test('a move naming a record that is not the open one refuses no-setup-open', () => {
    const { board } = openedBoard();

    expect(refusalDetailOf(() => board.discardDraft('S7', AT))).toEqual({ reason: 'no-setup-open', setupId: 'S7' });
  });

  test.each(['committing', 'held'] as const)('while an Apply is %s, every move refuses pipeline-apply-pending', (state) => {
    const { board } = openedBoard();
    const setup = openSetupOf(board) as PipelineSetup;
    setup.applyRequest = {
      draftRevision: 0, resumesBoard: false, commitJobId: null, state, reason: null
    };

    for (const move of [
      () => board.setSetupBilling('S1', { mode: 'subscription' }, AT),
      () => board.continueSetupStep('S1', 'billing', AT),
      () => board.answerSetupQuestion('S1', 'Q1', { text: 'Yes' }, AT),
      () => board.editConstitution('S1', { revision: 0, markdown: 'x' }, AT),
      () => board.discardDraft('S1', AT),
      () => board.startOverSetup('S1', AT),
    ]) expect(refusalDetailOf(move)).toEqual({ reason: 'pipeline-apply-pending', setupId: 'S1' });
  });

  test('a cap that is not above zero refuses billing-cap-not-positive', () => {
    const { board, setupId } = openedBoard();

    expect(refusalDetailOf(() => board.setSetupBilling(setupId, { mode: 'api', maxBudgetUsd: 0 }, AT))).toEqual({ reason: 'billing-cap-not-positive', maxBudgetUsd: 0 });
  });
});

describe('the steps', () => {
  test('Continue sets the current step done and opens the next one', () => {
    const { board, setupId } = openedBoard();

    const { setup, logged } = board.continueSetupStep(setupId, 'research', AT);

    expect([setup.stepStates.research, setup.stepStates.constitution, setup.currentStep]).toEqual(['done', 'in-progress', 'constitution']);
    expect(logged.map((record) => record.fields)).toEqual([{
      step: 'research', state: 'done', currentStep: 'constitution', needsRecheck: []
    }]);
  });

  test('Continue refuses a step that is not current, and the Apply step', () => {
    const { board, setupId } = openedBoard();

    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'constitution', AT))).toEqual({
      reason: 'setup-step-not-current', setupId, step: 'constitution', currentStep: 'research'
    });
    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'apply', AT))).toEqual({ reason: 'setup-step-not-continued', setupId, step: 'apply' });
  });

  test('reopening sends every later done step to needs-recheck, never to not-started, and leaves the current one in progress', () => {
    const { board, setupId } = boardAtDesign();

    const { setup, logged } = board.reopenSetupStep(setupId, 'research', AT);

    expect(setup.stepStates).toEqual({
      billing: 'done', research: 'in-progress', constitution: 'needs-recheck', design: 'in-progress', apply: 'not-started'
    });
    expect(setup.currentStep).toBe('research');
    expect(logged.map((record) => record.fields)).toEqual([{
      step: 'research', state: 'in-progress', currentStep: 'research', needsRecheck: ['constitution']
    }]);
  });

  test('a step never reached cannot be reopened', () => {
    const { board, setupId } = openedBoard();

    expect(refusalDetailOf(() => board.reopenSetupStep(setupId, 'design', AT))).toEqual({ reason: 'setup-step-not-reached', setupId, step: 'design' });
  });

  test('a step after the current one cannot be reopened, so a later recheck still waits for its Continue', () => {
    const { board, setupId } = boardAtDesign();
    board.reopenSetupStep(setupId, 'research', AT);

    expect(refusalDetailOf(() => board.reopenSetupStep(setupId, 'constitution', AT))).toEqual({ reason: 'setup-step-not-reached', setupId, step: 'constitution' });
    const { setup, logged } = board.editConstitution(setupId, { revision: 0, markdown: CONSTITUTION_TEXT }, AT);
    expect([setup.currentStep, setup.stepStates.constitution]).toEqual(['research', 'needs-recheck']);
    expect(logged.map((record) => record.kind)).toEqual(['pipeline-constitution-set']);
  });

  test('reopening a step that needs a recheck keeps the recheck', () => {
    const { board, setupId } = boardAtDesign();
    board.reopenSetupStep(setupId, 'research', AT);
    board.continueSetupStep(setupId, 'research', AT);

    const { setup } = board.reopenSetupStep(setupId, 'constitution', AT);

    expect([setup.currentStep, setup.stepStates.constitution]).toEqual(['constitution', 'needs-recheck']);
  });

  test('Continue on a step that needs a recheck sets it done, the one way out of a recheck', () => {
    const { board, setupId } = boardAtDesign();
    board.reopenSetupStep(setupId, 'research', AT);
    board.continueSetupStep(setupId, 'research', AT);

    expect(openSetupOf(board).stepStates.constitution).toBe('needs-recheck');
    const { setup } = board.continueSetupStep(setupId, 'constitution', AT);

    expect([setup.stepStates.constitution, setup.currentStep]).toEqual(['done', 'design']);
  });

  test('User\'s edit of an earlier step of a first setup reopens it; the agent\'s never moves a step', () => {
    const { board, setupId } = boardAtDesign();

    board.setConstitution(setupId, { markdown: CONSTITUTION_TEXT, annotations: [] }, AT);
    expect(openSetupOf(board).currentStep).toBe('design');

    const { setup, logged } = board.editConstitution(setupId, { revision: 1, markdown: `${CONSTITUTION_TEXT}- One more rule.\n` }, AT);
    expect([setup.currentStep, setup.stepStates.constitution]).toEqual(['constitution', 'in-progress']);
    expect(logged.map((record) => record.kind)).toEqual(['pipeline-setup-step-moved', 'pipeline-constitution-set']);
  });

  test('an update record has no stepper, so User\'s constitution edit moves no step', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);

    const { setup } = board.editConstitution(setupId, { revision: 0, markdown: CONSTITUTION_TEXT }, AT);

    expect(setup.currentStep).toBe('design');
    expect(setup.stepStates.design).toBe('done');
  });

  test('a resume moves the snapshot and asks for a recheck of research and of each finding naming a changed path', () => {
    const { board, setupId } = openedBoard();
    board.recordFinding(setupId, {
      topic: 'scripts', label: 'Tests', value: 'bun test', sourcePaths: ['package.json'], script: null
    }, AT);
    board.recordFinding(setupId, {
      topic: 'continuous-integration', label: 'CI', value: null, sourcePaths: ['.github/workflows/ci.yml'], script: null
    }, AT);
    board.continueSetupStep(setupId, 'research', AT);

    const { setup } = board.resumeSetup(setupId, 'f0e1d2c3', ['package.json'], AT);

    expect(setup.snapshotCommit).toBe('f0e1d2c3');
    expect(setup.stepStates.research).toBe('needs-recheck');
    expect(setup.findings.map((finding) => [finding.findingId, finding.needsRecheck])).toEqual([['F1', true], ['F2', false]]);
  });
});

describe('the entities step', () => {
  const STORED_OVER_ENTITIES: Pipeline = {
    ...STORED_PIPELINE,
    prepare:  [],
    gates:    [],
    phases:   { build: [], review: [], merge: [] },
    entities: {
      web: {
        kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
      }
    },
  };

  function boardWalkingEntities(): { board: Board; setupId: string } {
    const { board, setupId } = openedBoard();
    const setup = openSetupOf(board);
    const walking: PipelineSetup = { ...setup, stepStates: { ...setup.stepStates, entities: 'not-started' } };
    return { board: boardFixture({ pipelineSetup: { verdict: 'readable', setup: walking } }).board, setupId };
  }

  test('a first setup and an update of a pipeline without entities open with no entities step state, and skip the step', () => {
    const { board, setupId } = openedBoard();
    expect(Object.hasOwn(openSetupOf(board).stepStates, 'entities')).toBe(false);
    expect(board.continueSetupStep(setupId, 'research', AT).setup.currentStep).toBe('constitution');
    expect(refusalDetailOf(() => board.reopenSetupStep(setupId, 'entities', AT))).toEqual({ reason: 'setup-step-not-reached', setupId, step: 'entities' });

    const updated = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);
    expect(Object.hasOwn(openSetupOf(updated.board).stepStates, 'entities')).toBe(false);
  });

  test('an update of a stored pipeline over entities walks the entities step, done like every step before Apply', () => {
    const { board } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_OVER_ENTITIES);

    expect(openSetupOf(board).stepStates).toEqual({
      billing: 'done', research: 'done', entities: 'done', constitution: 'done', design: 'done', apply: 'not-started'
    });
  });

  test('a record over entities walks the entities step between research and the constitution, and a reopened research rechecks it', () => {
    const { board, setupId } = boardWalkingEntities();

    expect(board.continueSetupStep(setupId, 'research', AT).setup.currentStep).toBe('entities');
    const { setup } = board.continueSetupStep(setupId, 'entities', AT);
    expect([setup.stepStates.entities, setup.currentStep, setup.stepStates.constitution]).toEqual(['done', 'constitution', 'in-progress']);

    const { logged } = board.reopenSetupStep(setupId, 'research', AT);
    expect(openSetupOf(board).stepStates.entities).toBe('needs-recheck');
    expect(logged.map((record) => record.fields)).toEqual([{
      step: 'research', state: 'in-progress', currentStep: 'research', needsRecheck: ['entities']
    }]);
  });

  function layoutFinding(folder: string): ResearchFindingRecording {
    return {
      topic: 'layout', label: folder, value: 'Example app', sourcePaths: [`${folder}/package.json`], script: null
    };
  }

  test('a first setup walks the entities step once the forge\'s research records a second layout finding, which logs the step', () => {
    const { board, setupId } = openedBoard();

    board.recordFinding(setupId, layoutFinding('apps/web'), AT);
    expect(board.walkEntitiesStepAfterLayout(setupId, AT).logged).toEqual([]);
    expect(Object.hasOwn(openSetupOf(board).stepStates, 'entities')).toBe(false);

    board.recordFinding(setupId, layoutFinding('packages/ui'), AT);
    const { setup, logged } = board.walkEntitiesStepAfterLayout(setupId, AT);

    expect(Object.entries(setup.stepStates)).toEqual([
      ['billing', 'done'],
      ['research', 'in-progress'],
      ['entities', 'not-started'],
      ['constitution', 'not-started'],
      ['design', 'not-started'],
      ['apply', 'not-started'],
    ]);
    expect(logged.map((record) => record.kind)).toEqual(['pipeline-setup-step-moved']);
    expect(logged.map((record) => record.fields)).toEqual([{
      step: 'entities', state: 'not-started', currentStep: 'research', needsRecheck: []
    }]);
    expect(board.walkEntitiesStepAfterLayout(setupId, AT).logged).toEqual([]);
    expect(board.continueSetupStep(setupId, 'research', AT).setup.currentStep).toBe('entities');
    expect(openSetupOf(board).stepStates.entities).toBe('in-progress');
  });

  test('a first setup without two layout findings of the forge keeps today\'s steps, and its record stays as it was', () => {
    const { board, setupId } = openedBoard();
    board.recordFinding(setupId, {
      topic: 'stack', label: 'Bun', value: '1.3', sourcePaths: ['package.json'], script: null
    }, AT);
    board.recordFinding(setupId, layoutFinding('apps/web'), AT, 'web');
    board.recordFinding(setupId, layoutFinding('packages/ui'), AT, 'ui');
    const before = structuredClone(openSetupOf(board));

    expect(board.walkEntitiesStepAfterLayout(setupId, AT)).toEqual({ logged: [], setup: before });
    expect(openSetupOf(board)).toEqual(before);
    expect(board.continueSetupStep(setupId, 'research', AT).setup.currentStep).toBe('constitution');
  });

  test('an update, and a first setup past its research, never start to walk the entities step', () => {
    const updated = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);
    const past    = openedBoard();
    past.board.continueSetupStep(past.setupId, 'research', AT);

    for (const { board, setupId } of [updated, past]) {
      board.recordFinding(setupId, layoutFinding('apps/web'), AT);
      board.recordFinding(setupId, layoutFinding('packages/ui'), AT);
      expect(board.walkEntitiesStepAfterLayout(setupId, AT).logged).toEqual([]);
      expect(Object.hasOwn(openSetupOf(board).stepStates, 'entities')).toBe(false);
    }
  });

  test('the agent asks at the entities step, and User\'s answer from the constitution reopens it', () => {
    const { board, setupId } = boardWalkingEntities();
    board.continueSetupStep(setupId, 'research', AT);
    const asking = {
      step:               'entities',
      subject:            { kind: 'finding', reference: 'F1' },
      question:           'Is docs an entity of its own?',
      context:            'It has no build.',
      optionTexts:        ['Fold it into the root', 'Keep it as a package'],
      recommendedLetters: ['a'],
      multiple:           false,
    } as const;

    const { logged } = board.askSetupQuestion(setupId, asking, AT);
    expect(logged.map((record) => record.fields)).toEqual([{ questionId: 'Q1', step: 'entities' }]);
    expect(openSetupOf(board).questions.map((question) => question.step)).toEqual(['entities']);

    board.continueSetupStep(setupId, 'entities', AT);
    board.answerSetupQuestion(setupId, 'Q1', { letters: ['a'] }, AT);
    expect([openSetupOf(board).currentStep, openSetupOf(board).stepStates.entities]).toEqual(['entities', 'in-progress']);
  });

  test('a finding with an entity key goes to that entity\'s part, created the first time, numbered with the forge\'s findings', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_OVER_ENTITIES);
    const recording: ResearchFindingRecording = {
      topic: 'note', label: 'no-caching-tool', value: 'tests', sourcePaths: [], script: null
    };

    board.recordFinding(setupId, recording, AT);
    board.recordFinding(setupId, recording, AT, 'web');

    const setup = openSetupOf(board);
    expect(setup.findings.map((finding) => finding.findingId)).toEqual(['F1']);
    expect(setup.entities).toEqual({
      web: {
        agentJobId: null, findings: [{ ...recording, findingId: 'F2', needsRecheck: false }], questions: [], constitution: null
      }
    });
  });
});

describe('questions', () => {
  const ASKING = {
    step: 'design', subject: { kind: 'gate', reference: 'test' }, question: 'Run the tests on merge?', context: 'Example', multiple: false
  } as const;

  test.each<[readonly string[], readonly string[], boolean, BoardRefusalDetail]>([
    [['Only'], ['a'], false, {
      reason: 'setup-question-option-count', optionCount: 1, minimum: 2, maximum: 4
    }],
    [['a', 'b', 'c', 'd', 'e'], ['a'], false, {
      reason: 'setup-question-option-count', optionCount: 5, minimum: 2, maximum: 4
    }],
    [['Yes', 'No'], [], false, { reason: 'setup-question-without-recommendation' }],
    [['Yes', 'No'], ['c'], false, { reason: 'unknown-setup-option-letters', unknownLetters: ['c'], optionLetters: ['a', 'b'] }],
    [['Yes', 'No'], ['a', 'b'], false, { reason: 'several-letters-on-single-select-setup-question', letters: ['a', 'b'] }],
  ])('options %o recommending %o refuse with their reason', (optionTexts, recommendedLetters, multiple, refusal) => {
    const { board, setupId } = openedBoard();

    expect(refusalDetailOf(() => board.askSetupQuestion(setupId, {
      ...ASKING, optionTexts, recommendedLetters, multiple
    }, AT))).toEqual(refusal);
  });

  test('an answer is kept as letters or as free text, and answering again replaces it', () => {
    const { board, setupId } = openedBoard();
    board.askSetupQuestion(setupId, { ...ASKING, optionTexts: ['Yes', 'No'], recommendedLetters: ['a'] }, AT);

    board.answerSetupQuestion(setupId, 'Q1', { letters: ['b'] }, AT);
    expect(openSetupOf(board).questions[0]?.answer).toEqual({ letters: ['b'], answeredAt: AT });
    const { logged } = board.answerSetupQuestion(setupId, 'Q1', { text: 'Only on the merge phase' }, AT);

    expect(openSetupOf(board).questions[0]?.answer).toEqual({ text: 'Only on the merge phase', answeredAt: AT });
    expect(logged.map((record) => record.fields)).toEqual([{ questionId: 'Q1', answer: 'Only on the merge phase' }]);
    expect(refusalDetailOf(() => board.answerSetupQuestion(setupId, 'Q9', { text: 'x' }, AT))).toEqual({ reason: 'unknown-setup-question', setupId, questionId: 'Q9' });
    for (const reply of [{ letters: [] }, { text: ' ' }]) {
      expect(refusalDetailOf(() => board.answerSetupQuestion(setupId, 'Q1', reply, AT))).toEqual({ reason: 'empty-setup-answer', setupId, questionId: 'Q1' });
    }
  });
});

describe('the constitution', () => {
  test('the agent\'s markdown is stored byte for byte, and its sources stay beside it, never in the text', () => {
    const { board, setupId } = openedBoard();
    const annotations = [{
      lineText: '- Keep every change small.', occurrence: 2, kind: 'research', path: 'docs/conventions.md'
    }] as const;

    const { setup } = board.setConstitution(setupId, { markdown: CONSTITUTION_TEXT, annotations }, AT);

    expect(setup.constitution?.markdown).toBe(CONSTITUTION_TEXT);
    expect(setup.constitution?.annotations).toEqual([...annotations]);
    expect(setup.constitution?.revision).toBe(1);
  });

  test.each<[string, string, number]>([
    ['a line the text does not hold', '- Not in the text.', 1],
    ['more occurrences than the text holds', '- Name things in full.', 2],
    ['a line ending inside the line', '- Name things in full.\n', 1],
    ['occurrence 0', '- Name things in full.', 0],
  ])('a source naming %s refuses constitution-source-unanchored', (_case, lineText, occurrence) => {
    const { board, setupId } = openedBoard();

    expect(refusalDetailOf(() => board.setConstitution(setupId, {
      markdown:    CONSTITUTION_TEXT,
      annotations: [{
        lineText, occurrence, kind: 'research', path: null
      }]
    }, AT))).toEqual({ reason: 'constitution-source-unanchored', lineText, occurrence });
  });

  test('a source of a kind the SOURCES ticks do not select refuses constitution-source-not-ticked, and a ticked kind is kept', () => {
    const { board, setupId } = openedBoard();
    const installedDefault = {
      lineText: '- Name things in full.', occurrence: 1, kind: 'installed-default', path: null
    } as const;

    expect(refusalDetailOf(() => board.setConstitution(setupId, { markdown: CONSTITUTION_TEXT, annotations: [installedDefault] }, AT))).toEqual({
      reason: 'constitution-source-not-ticked', lineText: installedDefault.lineText, occurrence: 1, kind: 'installed-default'
    });
    expect(board.pipelineSetup()?.constitution).toBeNull();

    board.editConstitution(setupId, { revision: 0, draftedFrom: { contributing: false, research: false, installedDefault: true } }, AT);
    board.setConstitution(setupId, { markdown: CONSTITUTION_TEXT, annotations: [installedDefault] }, AT);
    expect(board.pipelineSetup()?.constitution?.annotations).toEqual([installedDefault]);
    const research = { ...installedDefault, kind: 'research' } as const;
    expect(refusalDetailOf(() => board.setConstitution(setupId, { markdown: CONSTITUTION_TEXT, annotations: [research] }, AT)))
      .toMatchObject({ reason: 'constitution-source-not-ticked', kind: 'research' });
  });

  test('two sources on one line, an empty text and an overlong one are refused', () => {
    const { board, setupId } = openedBoard();
    const source = {
      lineText: '- Name things in full.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
    } as const;

    const refusalOf = (markdown: string, annotations: readonly (typeof source)[]): unknown => refusalDetailOf(() => board.setConstitution(setupId, { markdown, annotations }, AT));

    expect(refusalOf(CONSTITUTION_TEXT, [source, source])).toEqual({ reason: 'constitution-source-repeated', lineText: source.lineText, occurrence: 1 });
    expect(refusalOf(' \n', [])).toEqual({ reason: 'constitution-empty' });
    expect(refusalOf('x'.repeat(20_001), [])).toEqual({ reason: 'constitution-too-long', characterCount: 20_001, limit: 20_000 });
  });

  test('User\'s edit re-anchors the sources: the edited line loses its tag and every other tag stays', () => {
    const { board, setupId } = openedBoard();
    board.setConstitution(setupId, {
      markdown:    CONSTITUTION_TEXT,
      annotations: [
        {
          lineText: '- Keep every change small.', occurrence: 2, kind: 'research', path: null
        },
        {
          lineText: '- Name things in full.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
        },
      ],
    }, AT);
    const editedText = CONSTITUTION_TEXT.replace('- Name things in full.', '- Name every file in full.');

    const { setup } = board.editConstitution(setupId, { revision: 1, markdown: editedText }, AT);

    expect(setup.constitution?.markdown).toBe(editedText);
    expect(setup.constitution?.annotations.map((annotation) => annotation.lineText)).toEqual(['- Keep every change small.']);
    expect(setup.constitution?.revision).toBe(2);
  });

  test('removing one of two equal lines drops the source on the second, since the text holds that line once', () => {
    const { board, setupId } = openedBoard();
    board.setConstitution(setupId, {
      markdown:    CONSTITUTION_TEXT,
      annotations: [{
        lineText: '- Keep every change small.', occurrence: 2, kind: 'research', path: null
      }]
    }, AT);

    const { setup } = board.editConstitution(setupId, { revision: 1, markdown: CONSTITUTION_TEXT.replace(/- Keep every change small\.\n$/u, '') }, AT);

    expect(setup.constitution?.annotations).toEqual([]);
  });

  test('the SOURCES ticks change alone, and an edit at an old revision refuses constitution-draft-stale', () => {
    const { board, setupId } = openedBoard();
    board.setConstitution(setupId, { markdown: CONSTITUTION_TEXT, annotations: [] }, AT);

    const { setup } = board.editConstitution(setupId, { revision: 1, draftedFrom: { contributing: false, research: true, installedDefault: true } }, AT);

    expect(setup.constitution?.markdown).toBe(CONSTITUTION_TEXT);
    expect(setup.constitution?.draftedFrom).toEqual({ contributing: false, research: true, installedDefault: true });
    expect(refusalDetailOf(() => board.editConstitution(setupId, { revision: 1, markdown: 'x' }, AT))).toEqual({
      reason: 'constitution-draft-stale', setupId, revision: 1, currentRevision: 2
    });
  });
});

describe('the draft', () => {
  test('one move\'s edits land at the next revision, each kept with its author and sentence', () => {
    const { board, setupId } = openedBoard();

    const { setup, logged } = board.editDraft(setupId, {
      by:       'agent',
      revision: null,
      edits:    [
        { edit: { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } }, summary: 'Run the tests.' },
        { edit: { target: 'phase-order', phase: 'merge', names: ['test'] }, summary: 'Run them on merge.' },
      ],
    }, AT);

    expect(setup.draft?.gates).toEqual([{ name: 'test', run: 'bun test' }]);
    expect(setup.draft?.phases.merge).toEqual(['test']);
    expect(setup.draftRevision).toBe(1);
    expect(setup.edits).toEqual([
      {
        editId: 'E1', by: 'agent', field: 'gate:test', summary: 'Run the tests.', undone: false
      },
      {
        editId: 'E2', by: 'agent', field: 'phase-order:merge', summary: 'Run them on merge.', undone: false
      },
    ]);
    expect(logged.map((record) => record.fields)).toEqual([{
      by: 'agent', revision: 1, editIds: ['E1', 'E2'], fields: ['gate:test', 'phase-order:merge']
    }]);
  });

  test('User\'s edit at an old revision refuses pipeline-draft-stale, and an empty edit no-draft-edits', () => {
    const { board, setupId } = openedBoard();
    board.editDraft(setupId, { by: 'agent', revision: null, edits: [{ edit: { target: 'review', value: { name: 'Review' } }, summary: 'Review.' }] }, AT);

    expect(refusalDetailOf(() => board.editDraft(setupId, { by: 'user', revision: 0, edits: [{ edit: { target: 'review', value: null }, summary: 'No review.' }] }, AT)))
      .toEqual({
        reason: 'pipeline-draft-stale', setupId, revision: 0, currentRevision: 1
      });
    expect(refusalDetailOf(() => board.editDraft(setupId, { by: 'user', revision: 1, edits: [] }, AT))).toEqual({ reason: 'no-draft-edits', setupId });
  });

  test('a gate named apart from its field, and a prepare order that is not a reorder, are refused', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);

    const refusalOf = (edit: PipelineDraftEdit): unknown => refusalDetailOf(() => board.editDraft(setupId, { by: 'user', revision: 0, edits: [{ edit, summary: 'x' }] }, AT));

    const renamedGate = { name: 'lint', run: 'bun run lint' };
    expect(refusalOf({ target: 'gate', name: 'test', value: renamedGate })).toEqual({ reason: 'draft-edit-name-mismatch', field: 'gate:test', name: 'lint' });
    expect(refusalOf({ target: 'prepare-order', names: ['build'] })).toEqual({ reason: 'prepare-order-not-a-reorder', names: ['build'], prepareNames: ['install', 'build'] });
  });

  test('Undo writes the base value back, a removed gate back into the phases the base runs it in', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);
    board.editDraft(setupId, { by: 'user', revision: 0, edits: [{ edit: { target: 'gate', name: 'types', value: null }, summary: 'Remove the type check.' }] }, AT);
    expect(openSetupOf(board).draft?.phases).toEqual({ build: ['test'], review: ['test'], merge: ['test'] });

    const { setup, logged } = board.undoDraftEdit(setupId, 'E1', AT);

    expect(setup.draft).toEqual(STORED_PIPELINE);
    expect(setup.edits[0]?.undone).toBe(true);
    expect(logged.map((record) => record.fields)).toEqual([{ editId: 'E1', field: 'gate:types', revision: 2 }]);
    expect(refusalDetailOf(() => board.undoDraftEdit(setupId, 'E1', AT))).toEqual({ reason: 'setup-edit-already-undone', setupId, editId: 'E1' });
    expect(refusalDetailOf(() => board.undoDraftEdit(setupId, 'E9', AT))).toEqual({ reason: 'unknown-setup-edit', setupId, editId: 'E9' });
  });

  test('Discard drops every proposed change and marks every edit undone', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_PIPELINE);
    board.editDraft(setupId, { by: 'agent', revision: null, edits: [{ edit: { target: 'approval', approval: 'merge', value: true }, summary: 'Approve merges.' }] }, AT);

    const { setup } = board.discardDraft(setupId, AT);

    expect(setup.draft).toEqual(STORED_PIPELINE);
    expect(setup.edits.every((edit) => edit.undone)).toBe(true);
    expect(setup.draftRevision).toBe(2);
  });
});

describe('the draft over entities', () => {
  const STORED_OVER_ENTITIES: Pipeline = {
    version:  5,
    prepare:  [],
    gates:    [],
    phases:   { build: [], review: [], merge: [] },
    entities: {
      web: {
        kind:    'app',
        home:    ['/apps/web'],
        prepare: [{ name: 'install', run: 'bun install' }, { name: 'build', run: 'bun run build' }],
        gates:   [{ name: 'test', run: 'bun test' }],
        phases:  { build: ['test'], review: [], merge: ['test'] },
        agents:  { builder: { model: 'opus' } },
      },
      api: {
        kind: 'app', home: ['/apps/api'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
      },
    },
  };

  const COPY_TO_API: readonly PipelineDraftEdit[] = [
    { target: 'within-entity', entityKey: 'api', edit: { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } } },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'role', role: 'builder', value: { model: 'opus' } } },
  ];

  test('a copy\'s edits carry the first of their edit ids as their batch, and each still undoes alone', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_OVER_ENTITIES);
    board.editDraft(setupId, { by: 'user', revision: 0, edits: [{ edit: { target: 'review', value: { name: 'Review' } }, summary: 'Review.' }] }, AT);

    const { setup } = board.editDraft(setupId, {
      by: 'user', revision: 1, edits: COPY_TO_API.map((edit) => ({ edit, summary: 'Copied from web.' })), isACopy: true
    }, AT);

    expect(setup.edits.map((edit) => [edit.editId, edit.field, edit.batch])).toEqual([
      ['E1', 'review', undefined],
      ['E2', 'entity:api/gate:test', 'E2'],
      ['E3', 'entity:api/role:builder', 'E2'],
    ]);
    expect(Object.hasOwn(setup.edits[0] ?? {}, 'batch')).toBe(false);
    expect(setup.draft?.entities?.['api']?.agents).toEqual({ builder: { model: 'opus' } });

    const undone = board.undoDraftEdit(setupId, 'E3', AT).setup;

    expect(undone.draft?.entities?.['api']?.gates).toEqual([{ name: 'test', run: 'bun test' }]);
    expect(undone.draft?.entities?.['api']?.agents).toBeUndefined();
    expect(undone.edits.map((edit) => edit.undone)).toEqual([false, false, true]);
  });

  test('a copy\'s set undoes at once at one revision, each edit logged as its own Undo, and a set with none standing is refused', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_OVER_ENTITIES);
    board.editDraft(setupId, { by: 'user', revision: 0, edits: [{ edit: { target: 'review', value: { name: 'Review' } }, summary: 'Review.' }] }, AT);
    board.editDraft(setupId, {
      by: 'user', revision: 1, edits: COPY_TO_API.map((edit) => ({ edit, summary: 'Copied from web.' })), isACopy: true
    }, AT);
    board.undoDraftEdit(setupId, 'E2', AT);

    const { setup, logged } = board.undoDraftBatch(setupId, 'E2', AT);

    expect(setup.draftRevision).toBe(4);
    expect(setup.edits.map((edit) => edit.undone)).toEqual([false, true, true]);
    expect(setup.draft?.entities?.['api']?.gates).toEqual([]);
    expect(setup.draft?.entities?.['api']?.agents).toBeUndefined();
    expect(logged.map((record) => record.kind)).toEqual(['pipeline-draft-undone']);
    expect(logged.map((record) => record.fields)).toEqual([{ editId: 'E3', field: 'entity:api/role:builder', revision: 4 }]);
    expect(refusalDetailOf(() => board.undoDraftBatch(setupId, 'E3', AT))).toEqual({ reason: 'setup-edit-already-undone', setupId, editId: 'E3' });
    expect(refusalDetailOf(() => board.undoDraftBatch(setupId, 'E9', AT))).toEqual({ reason: 'unknown-setup-edit', setupId, editId: 'E9' });

    const alone = board.undoDraftBatch(setupId, 'E1', AT);
    expect(alone.setup.edits.map((edit) => edit.undone)).toEqual([true, true, true]);
    expect(alone.logged.map((record) => record.fields)).toEqual([{ editId: 'E1', field: 'review', revision: 5 }]);
  });

  test('a copy to two entities undoes as one set per entity, leaving the other entity\'s edits standing', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_OVER_ENTITIES);
    const copyToWeb: PipelineDraftEdit = { target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'lint', value: { name: 'lint', run: 'bun run lint' } } };
    board.editDraft(setupId, {
      by: 'user', revision: 0, edits: [...COPY_TO_API, copyToWeb].map((edit) => ({ edit, summary: 'Copied gates.' })), isACopy: true
    }, AT);

    const { setup, logged } = board.undoDraftBatch(setupId, 'E1', AT);

    expect(setup.edits.map((edit) => [edit.editId, edit.batch, edit.undone])).toEqual([['E1', 'E1', true], ['E2', 'E1', true], ['E3', 'E1', false]]);
    expect(logged.map((record) => record.fields)).toEqual([
      { editId: 'E1', field: 'entity:api/gate:test', revision: 2 },
      { editId: 'E2', field: 'entity:api/role:builder', revision: 2 },
    ]);
    expect(setup.draft?.entities?.['web']?.gates.map((gate) => gate.name)).toEqual(['test', 'lint']);

    const web = board.undoDraftBatch(setupId, 'E3', AT);
    expect(web.setup.edits.map((edit) => edit.undone)).toEqual([true, true, true]);
    expect(web.setup.draft?.entities?.['web']?.gates.map((gate) => gate.name)).toEqual(['test']);
  });

  test('a gate named apart from its field, and a prepare order that is not a reorder, are refused inside an entity', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_OVER_ENTITIES);

    const refusalOf = (edit: PipelineDraftEdit): unknown => refusalDetailOf(() => board.editDraft(setupId, { by: 'user', revision: 0, edits: [{ edit, summary: 'x' }] }, AT));

    expect(refusalOf({ target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'test', value: { name: 'lint', run: 'bun run lint' } } }))
      .toEqual({ reason: 'draft-edit-name-mismatch', field: 'entity:web/gate:test', name: 'lint' });
    expect(refusalOf({ target: 'within-entity', entityKey: 'web', edit: { target: 'prepare-order', names: ['build'] } }))
      .toEqual({ reason: 'prepare-order-not-a-reorder', names: ['build'], prepareNames: ['install', 'build'] });
  });
});

describe('an unfinished entities draft', () => {
  const NO_PHASES = { build: [], review: [], merge: [] };

  const STORED_WEB_AND_API: Pipeline = {
    version:  5,
    prepare:  [],
    gates:    [],
    phases:   NO_PHASES,
    entities: {
      web: {
        kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: NO_PHASES
      },
      api: {
        kind: 'app', home: ['/apps/api'], prepare: [], gates: [], phases: NO_PHASES
      },
    },
  };

  const MAIN_READING = { mainConstitution: null, entityConstitutions: { root: null, web: null, api: null } };

  function apiHomeEdit(home: string): PipelineDraftEdit {
    return { target: 'entity', entityKey: 'api', value: { kind: 'app', home: [home] } };
  }

  function editedTo(board: Board, setupId: string, home: string): Readonly<PipelineSetup> {
    const revision = openSetupOf(board).draftRevision;
    return board.editDraft(setupId, { by: 'user', revision, edits: [{ edit: apiHomeEdit(home), summary: 'Move api.' }] }, AT).setup;
  }

  const REFUSAL_STANDS: BoardRefusalDetail = { reason: 'entity-refusals-stand', setupId: 'S1', reasons: ['equal-homes'] };

  test('an edit that leaves two entities on one home lands at the next revision, the refusal kept in the draft', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_WEB_AND_API);

    const setup = editedTo(board, setupId, '/apps/web');

    expect(setup.draftRevision).toBe(1);
    expect(setup.draft?.entities?.['api']?.home).toEqual(['/apps/web']);
  });

  test.each(['research', 'entities', 'constitution', 'design'] as const)('Continue of %s is refused entity-refusals-stand while a refusal stands', (step) => {
    const opened = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_WEB_AND_API);
    editedTo(opened.board, opened.setupId, '/apps/web');
    const atStep: PipelineSetup = { ...structuredClone(openSetupOf(opened.board)), currentStep: step };
    atStep.stepStates[step] = 'in-progress';
    const { board } = boardFixture({ pipeline: STORED_WEB_AND_API, pipelineSetup: { verdict: 'readable', setup: atStep } });

    expect(refusalDetailOf(() => board.continueSetupStep('S1', step, AT))).toEqual(REFUSAL_STANDS);
    expect(openSetupOf(board).currentStep).toBe(step);
  });

  test('Continue and Apply proceed once an edit clears the refusal, and the Apply refusal reads it until then', () => {
    const { board, setupId } = openedBoard({ ...FIRST_SETUP, mode: 'update' }, STORED_WEB_AND_API);
    editedTo(board, setupId, '/apps/web');
    const requesting = { ...MAIN_READING, draftRevision: 1, resumesBoard: false };

    expect(refusalDetailOf(() => board.requestApply(setupId, requesting, AT))).toEqual(REFUSAL_STANDS);
    expect(board.applyRefusalOf(setupId, MAIN_READING)).toEqual(REFUSAL_STANDS);
    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'design', AT))).toEqual(REFUSAL_STANDS);

    editedTo(board, setupId, '/apps/api');

    expect(board.applyRefusalOf(setupId, MAIN_READING)).toBeNull();
    expect(board.continueSetupStep(setupId, 'design', AT).setup.currentStep).toBe('apply');
    expect(board.requestApply(setupId, { ...requesting, draftRevision: 2 }, AT).outcome).toBe('applied');
  });
});

describe('the write the hold makes', () => {
  test('a move writes the record, a start over removes it, and a refused move writes nothing', () => {
    const { board, setupId } = openedBoard();
    expect(board.pipelineSetupWrite()).toMatchObject({ write: 'record' });

    board.startOverSetup(setupId, AT);

    expect(board.pipelineSetupWrite()).toEqual({ write: 'removed' });
    expect(board.pipelineSetup()).toBeNull();
    expect(boardFixture().board.pipelineSetupWrite()).toEqual({ write: 'unchanged' });
  });
});
