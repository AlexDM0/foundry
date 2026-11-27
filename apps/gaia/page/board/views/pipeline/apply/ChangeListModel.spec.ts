/**
 * The change list's model against the proposal fixture: one row per change, in order, its kind in words and never only in a colour, an
 * edit's sentence and Undo; and while an applied pipeline is edited, the gate placement, the Human code review line and the benchmark offer.
 */
import { describe, expect, test }                                                                  from 'bun:test';
import type { BoardGateProfileRunDocument, BoardPipelineFlowDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                                                    from '../../../testing/PipelineFixture.ts';
import { PipelineEditingModel }                                                                    from '../editing/PipelineEditingModel.ts';
import { ChangeListModel }                                                                         from './ChangeListModel.ts';

function proposal(): { readonly flow: BoardPipelineFlowDocument; readonly setup: BoardPipelineSetupDocument } {
  const board = pipelineBoardStateOf('A2');
  const flow = board.pipeline.flow ?? null;
  const setup = board.pipeline.setup ?? null;
  if (flow === null || setup === null) throw new Error('the fixture A2 has no flow or no setup');
  return { flow, setup };
}

describe('the rows', () => {
  test('one row per change, in the facts\' order', () => {
    const { flow, setup } = proposal();
    const rows = ChangeListModel.changeRowsOf(flow.changeList, setup.record.edits);
    expect(rows.map((row) => row.field)).toEqual(flow.changeList.map((change) => change.field));
  });

  test('a row an edit made carries its sentence, its author and its Undo; another has neither', () => {
    const { flow, setup } = proposal();
    const rows = ChangeListModel.changeRowsOf(flow.changeList, setup.record.edits);
    expect(rows.find((row) => row.field === 'gate:typecheck')).toEqual({
      field:      'gate:typecheck',
      change:     'new',
      title:      'typecheck',
      location:   'gate · new',
      note:       'Pipeline agent: Example: typecheck runs in every phase.',
      undoEditId: 'E1',
      before:     null,
      after:      null,
      benchmark:  null,
    });
    expect(rows.find((row) => row.field === 'role:reviewer')?.note).toBe('User: Example: the reviewer runs on opus.');
    expect(rows.find((row) => row.field === 'gate:lint')).toMatchObject({ note: null, undoEditId: null });
  });

  test('an edit with no sentence keeps its Undo and has no note, so no bare author shows', () => {
    const { flow, setup } = proposal();
    const edits = setup.record.edits.map((edit) => (edit.editId === 'E1' ? { ...edit, summary: '' } : edit));
    const rows = ChangeListModel.changeRowsOf(flow.changeList, edits);
    expect(rows.find((row) => row.field === 'gate:typecheck')).toMatchObject({ note: null, undoEditId: 'E1' });
  });
});

function drawnEditingRows(profileRuns: readonly BoardGateProfileRunDocument[] = []) {
  const base = pipelineBoardStateOf('A6-drawn-changes');
  const board = { ...base, pipeline: { ...base.pipeline, profileRuns: [...profileRuns] } };
  const editing = PipelineEditingModel.changeListEditingOf(board);
  const flow = board.pipeline.flow ?? null;
  const setup = board.pipeline.setup ?? null;
  if (flow === null || setup === null || editing === null) throw new Error('the fixture A6-drawn-changes has no flow or no setup');
  return ChangeListModel.changeRowsOf(flow.changeList, setup.record.edits, editing);
}

describe('while an applied pipeline is edited', () => {
  test('a gate is placed by its phases, with its run line before and after', () => {
    const rows = drawnEditingRows();
    expect(rows.find((row) => row.field === 'gate:typecheck')).toMatchObject({
      location: 'build, review and merge gate · changed', before: 'bun run typecheck', after: 'bun run typecheck --incremental', benchmark: null,
    });
    expect(rows.find((row) => row.field === 'gate:lint')).toMatchObject({
      location: 'build and review gate · removed', before: 'bun run lint', after: null, benchmark: null,
    });
  });

  test('Human code review says what it switched and what a reviewed ticket then does', () => {
    expect(drawnEditingRows().find((row) => row.field === 'approval:merge')).toMatchObject({
      location: 'switch · off → on',
      note:     'A reviewed ticket merges main in, passes the review gates again, then waits for User\'s Merge.',
    });
  });

  test('Human spec and plan review say what they switched, and the route what it moved from and to', () => {
    const base = pipelineBoardStateOf('A6-drawn-changes');
    const editing = PipelineEditingModel.changeListEditingOf(base);
    if (editing === null || editing.base === null || editing.draft === null) throw new Error('the fixture A6-drawn-changes has no editing');
    const specThenPlan = {
      ...editing,
      base:  { ...editing.base, approvals: { ...editing.base.approvals, spec: false, plan: true } },
      draft: { ...editing.draft, approvals: { ...editing.draft.approvals, plan: false }, ticketWriting: 'spec-then-plan' as const },
    };
    const changes = ['approval:spec', 'approval:plan', 'ticket-writing'].map((field) => ({ field, changeKind: 'changed' as const, editId: null }));
    expect(ChangeListModel.changeRowsOf(changes, [], specThenPlan).map((row) => row.location)).toEqual([
      'switch · off → on',
      'switch · on → off',
      'Ticket phase · One ticket → Spec, then plan',
    ]);
  });

  test('only a new gate offers a benchmark in its last phase, not benchmarked until User presses', () => {
    const rows = drawnEditingRows();
    expect(rows.filter((row) => row.benchmark !== null).map((row) => row.field)).toEqual(['gate:a11y']);
    expect(rows.find((row) => row.field === 'gate:a11y')).toMatchObject({
      location:  'merge gate · new',
      after:     'bun run a11y',
      note:      'Not benchmarked yet',
      benchmark: {
        gateName: 'a11y', phase: 'merge', label: 'Benchmark in the merge phase', statusText: 'Not benchmarked yet', measuring: false,
      },
    });
  });

  test('a benchmark under way takes no second press, and a finished one names its time', () => {
    const runOf = (state: BoardGateProfileRunDocument['state'], elapsedMilliseconds: number | null): BoardGateProfileRunDocument => ({
      profileRunId: 'P1', entity: null, gateName: 'a11y', phase: 'merge', state, elapsedMilliseconds, cacheReport: null,
    });
    const benchmarkAfter = (run: BoardGateProfileRunDocument) => drawnEditingRows([run]).find((row) => row.field === 'gate:a11y')?.benchmark;
    expect(benchmarkAfter(runOf('running', 12_000))).toMatchObject({ statusText: 'Benchmarking in the merge phase…', measuring: true });
    expect(benchmarkAfter(runOf('passed', 41_000))).toMatchObject({ statusText: 'Takes 41 s in the merge phase', measuring: false });
  });

  test('the benchmark sends gate-profile-start for the gate in its phase', () => {
    const benchmark = drawnEditingRows().find((row) => row.field === 'gate:a11y')?.benchmark ?? null;
    if (benchmark === null) throw new Error('a11y offers no benchmark');
    expect(ChangeListModel.benchmarkCommandOf('S2', benchmark)).toEqual({
      boardCommandVersion: 3, kind: 'gate-profile-start', setupId: 'S2', gateName: 'a11y', phase: 'merge', entity: null,
    });
  });
});

describe('the field words', () => {
  test('word every kind of field by what it names', () => {
    const fields: string[] = [
      'prepare:install',
      'phase-order:merge',
      'prepare-order',
      'role:conflictReReviewer',
      'review',
      'airlock',
      'approval:tickets',
      'approval:merge',
      'approval:spec',
      'approval:plan',
      'ticket-writing',
      'role:specAgent',
      'constitution',
    ];
    expect(fields.map((field) => ChangeListModel.fieldWordsOf(field))).toEqual([
      { title: 'install', place: 'prepare step' },
      { title: 'Merge gates', place: 'order' },
      { title: 'Prepare steps', place: 'order' },
      { title: 'Re-review after a conflict', place: 'agent step' },
      { title: 'Review', place: 'step' },
      { title: 'Merge train', place: 're-review' },
      { title: 'Human ticket review', place: 'switch' },
      { title: 'Human code review', place: 'switch' },
      { title: 'Human spec review', place: 'switch' },
      { title: 'Human plan review', place: 'switch' },
      { title: 'How a ticket is written', place: 'Ticket phase' },
      { title: 'Spec', place: 'agent step' },
      { title: 'Constitution', place: 'CONSTITUTION.md' },
    ]);
  });
});

describe('Undo', () => {
  test('sends pipeline-draft-undo with the setup and the edit', () => {
    expect(ChangeListModel.undoCommandOf('S1', 'E2')).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2', wholeBatch: false,
    });
  });
});
