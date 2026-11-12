/**
 * The setup record's moves on the Board. What matters: one record is open at a time and its id is never reused; a step reopened sends
 * every later done step to `needs-recheck`, never back to `not-started`, and only Continue clears a recheck; only User's edit of an
 * earlier step of a first setup reopens it; the constitution is kept byte for byte, a source must name a line the text holds, and an
 * edit re-anchors the sources so only the edited line loses its tag; Undo writes the base value back; an unreadable record and a pending
 * Apply refuse every move; and each move refuses with its reason and logs ids and values only.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf } from '../../testing/BoardFixtures.ts';
import type { Pipeline }                 from './@types/Pipeline.ts';
import type {
  PipelineDraftEdit,
  PipelineSetup,
  PipelineSetupOpening,
  PipelineSetupReading
} from './@types/PipelineSetup.ts';
import type { Board }              from './Board.ts';
import type { BoardRefusalDetail } from './BoardRefusal.ts';
import { PipelineUtil }            from './utils/PipelineUtil.ts';

const AT = '2026-11-12T10:00:00+01:00';

const FIRST_SETUP: PipelineSetupOpening = {
  mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
};

const STORED_PIPELINE: Pipeline = {
  version: 2,
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
  for (const step of ['billing', 'research', 'constitution'] as const) opened.board.continueSetupStep(opened.setupId, step, AT);
  return opened;
}

describe('opening a record', () => {
  test('a first setup starts at billing with nothing else started, and its id is never reused', () => {
    const { board, progress } = boardFixture();

    const { setup, logged } = board.openSetup(FIRST_SETUP, AT);

    expect(setup.setupId).toBe('S1');
    expect(setup.stepStates).toEqual({
      billing: 'in-progress', research: 'not-started', constitution: 'not-started', design: 'not-started', apply: 'not-started'
    });
    expect(setup.currentStep).toBe('billing');
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
      mainConstitution:  { markdown: CONSTITUTION_TEXT, blob: 'a1b2c3d4' },
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

    const { setup, logged } = board.continueSetupStep(setupId, 'billing', AT);

    expect([setup.stepStates.billing, setup.stepStates.research, setup.currentStep]).toEqual(['done', 'in-progress', 'research']);
    expect(logged.map((record) => record.fields)).toEqual([{
      step: 'billing', state: 'done', currentStep: 'research', needsRecheck: []
    }]);
  });

  test('Continue refuses a step that is not current, and the Apply step', () => {
    const { board, setupId } = openedBoard();

    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'research', AT))).toEqual({
      reason: 'setup-step-not-current', setupId, step: 'research', currentStep: 'billing'
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
    board.continueSetupStep(setupId, 'billing', AT);
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
