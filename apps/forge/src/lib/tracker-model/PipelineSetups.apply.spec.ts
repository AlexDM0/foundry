/**
 * Apply's two stages on the Board. What matters: stage 1 refuses an open question, a step that needs a recheck, a touched snapshot, a
 * stale revision, a stored pipeline that moved since the record opened and a `CONSTITUTION.md` main changed since; when main lacks the
 * draft's text it stores only the request, after which every other setup move and every `gate` verb refuses; when main already holds the
 * text, stage 2 runs in the same hold and stores the whole pipeline on main's file, the sources keyed by the text's blob id, the
 * withdrawal of `checks-not-set` and the resume when asked, `pipeline-applied` with the field names, and last closes the record. Apply is
 * idempotent by setup and revision: a pipeline this draft stored is no move of anyone else's, so a retry or the Overseer's start finishes
 * the rest, and an Apply of a revision already applied changes nothing. Cancel clears the request and leaves the record editable at
 * design, with Apply not reached. Once Apply lands, in whichever hold, the record's live pipeline agent is stopped. A constitution commit
 * job takes a waiting or held request and leaves it waiting when it ends without a landing; a hold logs the blocking files and a refusal
 * git's text.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf } from '../../testing/BoardFixtures.ts';
import type { Pipeline }                 from './@types/Pipeline.ts';
import type {
  MainConstitution,
  PipelineSetup,
  PipelineSetupOpening,
  SummarisedDraftEdit
} from './@types/PipelineSetup.ts';
import type { Board }   from './Board.ts';
import { PipelineUtil } from './utils/PipelineUtil.ts';

const AT = '2026-11-12T10:00:00+01:00';

const CONSTITUTION_TEXT = '# Example Agency\n\n## Rules\n- Keep the basket page fast.\n';

const MAIN_CONSTITUTION: MainConstitution = { path: 'CONSTITUTION.md', markdown: CONSTITUTION_TEXT, blob: 'c'.repeat(40) };

const FIRST_SETUP: PipelineSetupOpening = {
  mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
};

const STORED_PIPELINE: Pipeline = {
  version: 2,
  prepare: [],
  gates:   [{ name: 'test', run: 'bun test' }],
  phases:  { build: ['test'], review: ['test'], merge: ['test'] },
};

const TEST_GATE_EDIT: SummarisedDraftEdit = { edit: { target: 'gate', name: 'types', value: { name: 'types', run: 'bun run typecheck' } }, summary: 'Check the types.' };

const TYPES_PHASE_EDIT: SummarisedDraftEdit = { edit: { target: 'phase-order', phase: 'build', names: ['types'] }, summary: 'Check the types first.' };

interface ApplyWorld {
  board:   Board;
  setupId: string;
}

function openSetupOf(board: Board): Readonly<PipelineSetup> {
  const setup = board.pipelineSetup();
  if (setup === null) throw new Error('no setup is open');
  return setup;
}

/** A first setup at the apply step: a constitution drafted with one source, and a draft that runs the type check in the build phase. */
function firstSetupAtApply(): ApplyWorld {
  const { board } = boardFixture();
  const { setupId } = board.openSetup(FIRST_SETUP, AT).setup;
  board.setConstitution(setupId, {
    markdown:    CONSTITUTION_TEXT,
    annotations: [{
      lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
    }]
  }, AT);
  board.editDraft(setupId, { by: 'agent', revision: null, edits: [TEST_GATE_EDIT, TYPES_PHASE_EDIT] }, AT);
  for (const step of ['research', 'constitution', 'design'] as const) board.continueSetupStep(setupId, step, AT);
  return { board, setupId };
}

describe('stage 1 refuses', () => {
  test('an open question, naming it', () => {
    const { board, setupId } = firstSetupAtApply();
    board.askSetupQuestion(setupId, {
      step: 'design', subject: null, question: 'Run the type check in review too?', context: '', optionTexts: ['Yes', 'No'], recommendedLetters: ['a'], multiple: false
    }, AT);

    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT)))
      .toEqual({ reason: 'setup-question-open', setupId, questionIds: ['Q1'] });
  });

  test('a step before Apply that needs a recheck', () => {
    const { board, setupId } = firstSetupAtApply();
    board.reopenSetupStep(setupId, 'research', AT);

    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT)))
      .toEqual({ reason: 'setup-step-needs-recheck', setupId, steps: ['constitution', 'design'] });
  });

  test('a snapshot a turn end found touched', () => {
    const { board, setupId } = firstSetupAtApply();
    board.recordSetupSnapshotTouched(setupId, { check: 'V4', reason: 'worktree-dirty' }, AT);

    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT)))
      .toEqual({ reason: 'setup-snapshot-touched', setupId });
  });

  test('a revision other than the draft\'s', () => {
    const { board, setupId } = firstSetupAtApply();

    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT)))
      .toEqual({
        reason: 'pipeline-draft-stale', setupId, revision: 0, currentRevision: 1
      });
  });

  test('a stored pipeline a gate verb changed since the record opened', () => {
    const { board, setupId } = firstSetupAtApply();
    board.setNoGates(AT);

    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT))).toEqual({
      reason: 'pipeline-moved', setupId, baseContentHash: null, contentHash: PipelineUtil.contentHashOf(PipelineUtil.minimalPipelineOf())
    });
  });

  test('a CONSTITUTION.md main changed since the record opened, unless main holds the draft\'s text', () => {
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    const { setupId } = board.openSetup({ ...FIRST_SETUP, mode: 'update', mainConstitution: MAIN_CONSTITUTION }, AT).setup;
    board.editConstitution(setupId, { revision: 0, markdown: `${CONSTITUTION_TEXT}- Name things in full.\n` }, AT);
    const changedOnMain = { ...MAIN_CONSTITUTION, markdown: '# Another text\n', blob: 'd'.repeat(40) };

    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: changedOnMain }, AT)))
      .toEqual({
        reason: 'constitution-moved', setupId, baseBlob: MAIN_CONSTITUTION.blob, mainBlob: changedOnMain.blob
      });
    const committedByHand = { ...MAIN_CONSTITUTION, markdown: `${CONSTITUTION_TEXT}- Name things in full.\n`, blob: 'e'.repeat(40) };
    expect(board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: committedByHand }, AT).outcome).toBe('applied');
  });
});

describe('stage 1 while main lacks the draft\'s text', () => {
  test('stores only the request, and every other setup move and gate verb refuses pipeline-apply-pending', () => {
    const { board, setupId } = firstSetupAtApply();

    const requested = board.requestApply(setupId, { draftRevision: 1, resumesBoard: true, mainConstitution: null }, AT);

    expect(requested.outcome).toBe('committing');
    expect(openSetupOf(board).applyRequest).toEqual({
      draftRevision: 1, resumesBoard: true, commitJobId: null, state: 'committing', reason: null
    });
    expect(requested.logged).toEqual([{
      at: AT, kind: 'pipeline-apply-requested', setupId, fields: { revision: 1, resumesBoard: true }
    }]);
    expect([board.pipeline(), board.pipelineChanged(), board.storedConstitutionSources()]).toEqual([null, false, null]);
    expect(refusalDetailOf(() => board.discardDraft(setupId, AT))).toEqual({ reason: 'pipeline-apply-pending', setupId });
    expect(refusalDetailOf(() => board.addGate({ name: 'lint', run: 'bun run lint' }, AT))).toEqual({ reason: 'pipeline-apply-pending', setupId });
    expect(refusalDetailOf(() => board.setNoGates(AT))).toEqual({ reason: 'pipeline-apply-pending', setupId });
  });

  test('the same revision again answers with the waiting request, and another revision refuses pipeline-apply-pending', () => {
    const { board, setupId } = firstSetupAtApply();
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);

    expect(board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT)).toMatchObject({ outcome: 'committing', logged: [] });
    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 2, resumesBoard: false, mainConstitution: null }, AT)))
      .toEqual({ reason: 'pipeline-apply-pending', setupId });
  });

  test('a held and a refused commit keep the request, and only a refused one leaves the record editable', () => {
    const { board, setupId } = firstSetupAtApply();
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);

    board.holdApply(setupId, { reason: 'dirty-checkout', blockingFiles: [] }, AT);
    expect(openSetupOf(board).applyRequest).toMatchObject({ state: 'held', reason: 'dirty-checkout' });
    expect(refusalDetailOf(() => board.discardDraft(setupId, AT))).toEqual({ reason: 'pipeline-apply-pending', setupId });
    board.refuseApply(setupId, { reason: 'constitution-commit-unsigned', gitFailure: null }, AT);
    expect(openSetupOf(board).applyRequest).toMatchObject({ state: 'refused', reason: 'constitution-commit-unsigned' });
    expect(refusalDetailOf(() => board.holdApply(setupId, { reason: 'dirty-checkout', blockingFiles: [] }, AT))).toEqual({ reason: 'no-apply-pending', setupId });
    expect(board.discardDraft(setupId, AT).logged.map((record) => record.kind)).toEqual(['pipeline-draft-discarded']);
  });

  test('the hold logs the files that block main, and the refusal git\'s own text', () => {
    const { board, setupId } = firstSetupAtApply();
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);

    expect(board.holdApply(setupId, { reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'] }, AT).logged).toEqual([{
      at: AT, kind: 'pipeline-apply-held', setupId, fields: { reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'] }
    }]);
    expect(board.refuseApply(setupId, { reason: 'constitution-commit-unsigned', gitFailure: 'error: gpg failed to sign the data' }, AT).logged).toEqual([{
      at: AT, kind: 'pipeline-apply-refused', setupId, fields: { reason: 'constitution-commit-unsigned', gitFailure: 'error: gpg failed to sign the data' }
    }]);
  });

  test('a constitution commit job takes a waiting or held request, committing under it; its end without a landing leaves it waiting', () => {
    const { board, setupId } = firstSetupAtApply();
    expect(refusalDetailOf(() => board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: 'a'.repeat(40) }, AT)))
      .toEqual({ reason: 'no-apply-pending', setupId });
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);
    board.holdApply(setupId, { reason: 'dirty-checkout', blockingFiles: [] }, AT);

    const { job } = board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: 'a'.repeat(40) }, AT);

    expect(job).toMatchObject({
      kind:    'constitution-commit',
      role:    null,
      state:   'merging',
      airlock: {
        target: 'main', targetTip: 'a'.repeat(40), branchTip: 'a'.repeat(40), phase: 'committing'
      }
    });
    expect(openSetupOf(board).applyRequest).toMatchObject({ state: 'committing', reason: null, commitJobId: job.id });
    expect(refusalDetailOf(() => board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: 'a'.repeat(40) }, AT)))
      .toEqual({ reason: 'airlock-held', target: 'main', jobId: job.id });
    board.endConstitutionCommitJob(job.id, { outcome: 'stopped', cause: 'orphaned' }, AT);
    expect(openSetupOf(board).applyRequest).toMatchObject({ state: 'committing', commitJobId: null });
  });

  test('a stored pipeline changed by hand while the commit waited is one stage 2 would refuse', () => {
    const { board, setupId } = firstSetupAtApply();
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);
    const record = structuredClone(openSetupOf(board)) as PipelineSetup;
    expect(board.storedPipelineMovedSince(setupId, MAIN_CONSTITUTION)).toBe(false);

    const { board: reloaded } = boardFixture({ pipeline: STORED_PIPELINE, pipelineSetup: { verdict: 'readable', setup: record } });

    expect(reloaded.storedPipelineMovedSince(setupId, MAIN_CONSTITUTION)).toBe(true);
  });

  test('cancel clears the request at the design step, in progress and editable, with Apply not reached, and with none pending refuses no-apply-pending', () => {
    const { board, setupId } = firstSetupAtApply();
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);

    const cancelled = board.cancelApply(setupId, AT);

    expect(cancelled.logged).toEqual([{
      at: AT, kind: 'pipeline-apply-cancelled', setupId, fields: { revision: 1, state: 'committing' }
    }]);
    expect(openSetupOf(board)).toMatchObject({ applyRequest: null, currentStep: 'design' });
    expect(openSetupOf(board).stepStates).toMatchObject({ design: 'in-progress', apply: 'not-started' });
    expect(board.pipeline()).toBeNull();
    expect(board.discardDraft(setupId, AT).setup.draftRevision).toBe(2);
    expect(refusalDetailOf(() => board.cancelApply(setupId, AT))).toEqual({ reason: 'no-apply-pending', setupId });
  });
});

describe('stage 2 when main already holds the draft\'s text', () => {
  test('stores the whole pipeline on main\'s file, the sources by blob id, withdraws checks-not-set, resumes, logs, and closes the record last', () => {
    const { board, setupId } = firstSetupAtApply();
    board.setOverseerState('paused', AT);
    board.openDecision({
      kind:      'checks-not-set',
      ticketIds: [],
      jobId:     null,
      askedBy:   'overseer',
      requestId: null,
      questions: [{
        question: 'Set the gates?', header: 'Gates', multiSelect: false, options: [{ label: 'Later', description: 'Wait' }]
      }],
      context: '',
    }, AT);

    const applied = board.requestApply(setupId, { draftRevision: 1, resumesBoard: true, mainConstitution: MAIN_CONSTITUTION }, AT);

    expect(applied.outcome).toBe('applied');
    expect(board.pipeline()).toEqual({
      version:      2,
      prepare:      [],
      gates:        [{ name: 'types', run: 'bun run typecheck' }],
      phases:       { build: ['types'], review: [], merge: [] },
      constitution: { path: 'CONSTITUTION.md' },
    });
    expect(board.constitutionSourcesWrite()).toEqual({
      write:   'sources',
      sources: {
        formatVersion: 1,
        blob:          MAIN_CONSTITUTION.blob,
        annotations:   [{
          lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
        }],
        extra: []
      },
    });
    expect(board.decisions()).toEqual([]);
    expect(board.overseerState()).toBe('running');
    expect(applied.logged.map((record) => record.kind)).toEqual(['decision-withdrawn', 'overseer-set', 'pipeline-applied']);
    expect(applied.logged.at(-1)).toEqual({
      at:     AT,
      kind:   'pipeline-applied',
      setupId,
      fields: {
        revision:           1,
        resumesBoard:       true,
        changedFields:      ['phase-order:build'],
        newFields:          ['gate:types', 'constitution'],
        removedFields:      [],
        constitutionCommit: null,
      },
    });
    expect([board.pipelineSetup(), board.pipelineSetupWrite()]).toEqual([null, { write: 'removed' }]);
  });

  test('a record with no constitution and a main with none applies the draft as it is, and stores no sources', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup(FIRST_SETUP, AT).setup;

    expect(board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT).outcome).toBe('applied');
    expect(board.pipeline()).toEqual(PipelineUtil.minimalPipelineOf());
    expect(board.constitutionSourcesWrite()).toEqual({ write: 'unchanged' });
  });
});

describe('the record\'s pipeline agent once Apply lands', () => {
  function withRunningAgent(world: ApplyWorld): string {
    const { job } = world.board.startPipelineAgent(AT);
    world.board.attachSetupAgent(world.setupId, job.id, 'a'.repeat(40));
    world.board.moveJob(job.id, 'running', AT);
    return job.id;
  }

  test('a running agent is stopped in the hold of a stage 2 that runs at once, after the record\'s close', () => {
    const world = firstSetupAtApply();
    const agentJobId = withRunningAgent(world);

    const applied = world.board.requestApply(world.setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);

    expect(world.board.jobById(agentJobId)?.state).toBe('stopping');
    expect(applied.logged.map((record) => record.kind)).toEqual(['pipeline-applied', 'job-stop-requested']);
  });

  test('stage 2 in the hold of the constitution commit\'s landing stops it too, and a stage 1 that only waits stops nothing', () => {
    const world = firstSetupAtApply();
    const agentJobId = withRunningAgent(world);

    world.board.requestApply(world.setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: null }, AT);
    expect(world.board.jobById(agentJobId)?.state).toBe('running');

    world.board.finishApply(world.setupId, {
      draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION, constitutionCommit: 'd'.repeat(40)
    }, AT);
    expect(world.board.jobById(agentJobId)?.state).toBe('stopping');
  });

  test('the Overseer\'s start that finishes a half-applied record stops it, and an agent that has no session ends closed', () => {
    const { board: first, setupId } = firstSetupAtApply();
    const { job } = first.startPipelineAgent(AT);
    first.attachSetupAgent(setupId, job.id, null);
    const setup = structuredClone(openSetupOf(first)) as PipelineSetup;
    first.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);
    const { board } = boardFixture({ pipeline: first.pipeline() as Pipeline, pipelineSetup: { verdict: 'readable', setup } });
    // The new board numbers its jobs afresh, so the agent the record names is this one, launching with no session yet.
    expect(board.startPipelineAgent(AT).job.id).toBe(job.id);

    board.finishHalfAppliedSetup(MAIN_CONSTITUTION, AT);

    expect(board.jobById(job.id)).toBeUndefined();
    expect(board.endedJobOutcomeOf(job.id)?.outcome).toBe('closed');
  });

  test('an agent already stopping is asked nothing again', () => {
    const world = firstSetupAtApply();
    const agentJobId = withRunningAgent(world);
    world.board.requestJobStop(agentJobId, 'stop', AT);

    const applied = world.board.requestApply(world.setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);

    expect(applied.logged.map((record) => record.kind)).toEqual(['pipeline-applied']);
  });
});

describe('idempotent by setup and revision', () => {
  test('a retried Apply of a pipeline this draft already stored finishes the rest and never refuses pipeline-moved', () => {
    const { board: first, setupId } = firstSetupAtApply();
    const setup = structuredClone(openSetupOf(first)) as PipelineSetup;
    first.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);
    const storedByTheCutApply = first.pipeline();
    if (storedByTheCutApply === null) throw new Error('the Apply stored no pipeline');
    const { board } = boardFixture({ pipeline: storedByTheCutApply as Pipeline, pipelineSetup: { verdict: 'readable', setup } });

    const retried = board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);

    expect(retried.outcome).toBe('applied');
    expect(board.pipelineSetup()).toBeNull();
  });

  test('an Apply of a revision the log already holds as applied changes nothing', () => {
    const { board, setupId } = firstSetupAtApply();
    board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);

    expect(board.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT))
      .toEqual({ outcome: 'already-applied', setup: null, logged: [] });
    expect(refusalDetailOf(() => board.requestApply(setupId, { draftRevision: 2, resumesBoard: false, mainConstitution: null }, AT)))
      .toEqual({ reason: 'no-setup-open', setupId });
  });

  test('the Overseer\'s start finishes an open record whose draft is the stored pipeline, resuming only as its request asked', () => {
    const { board: first, setupId } = firstSetupAtApply();
    first.requestApply(setupId, { draftRevision: 1, resumesBoard: true, mainConstitution: null }, AT);
    const setup = structuredClone(openSetupOf(first)) as PipelineSetup;
    first.cancelApply(setupId, AT);
    first.requestApply(setupId, { draftRevision: 1, resumesBoard: false, mainConstitution: MAIN_CONSTITUTION }, AT);
    const stored = first.pipeline() as Pipeline;
    const { board } = boardFixture({ pipeline: stored, pipelineSetup: { verdict: 'readable', setup } });
    board.setOverseerState('paused', AT);

    const finished = board.finishHalfAppliedSetup(MAIN_CONSTITUTION, AT);

    expect(finished?.outcome).toBe('applied');
    expect(board.overseerState()).toBe('running');
    expect(board.pipelineSetup()).toBeNull();
  });

  test('the Overseer\'s start leaves alone a record whose draft is not the stored pipeline, or whose base it still is', () => {
    const { board, setupId } = firstSetupAtApply();
    expect(board.finishHalfAppliedSetup(MAIN_CONSTITUTION, AT)).toBeNull();

    const { board: updateBoard } = boardFixture({ pipeline: STORED_PIPELINE });
    updateBoard.openSetup({ ...FIRST_SETUP, mode: 'update' }, AT);
    expect(updateBoard.finishHalfAppliedSetup(null, AT)).toBeNull();
    expect(board.pipelineSetup()?.setupId).toBe(setupId);
  });
});
