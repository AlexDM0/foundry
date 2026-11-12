/**
 * The change list's model against the proposal fixture. What matters: every row of the facts' change list becomes one row, in order, so
 * the Changes tab counts what the list shows; each field is worded by what it names and its kind is in the words, never only in a colour;
 * a row an edit made carries that edit's sentence with its author and an Undo of that edit, and a row no edit made has neither. While an
 * applied pipeline is edited (A6 as drawn), a gate is placed by its phases with its run lines, Human code review says what it switched
 * and what a reviewed ticket then does (decision 9's sentence), and only a new gate offers a benchmark, in its last phase, worded from its
 * newest profile run.
 */
import { describe, expect, test } from 'bun:test';

import type { GateProfileRunFacts, PipelineFlowFacts, PipelineSetupFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineDraftField }                                         from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { pipelineBoardStateOf }                                            from '../../../testing/PipelineFixture.ts';
import { PipelineEditingModel }                                            from '../editing/PipelineEditingModel.ts';
import { ChangeListModel }                                                 from './ChangeListModel.ts';

function proposal(): { readonly flow: PipelineFlowFacts; readonly setup: PipelineSetupFacts } {
  const board = pipelineBoardStateOf('A2');
  const flow = board.pipelineFlow ?? null;
  const setup = board.pipelineSetup ?? null;
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
});

function drawnEditingRows(profileRuns: readonly GateProfileRunFacts[] = []) {
  const board = { ...pipelineBoardStateOf('A6-drawn-changes'), profileRuns: [...profileRuns] };
  const editing = PipelineEditingModel.changeListEditingOf(board);
  const flow = board.pipelineFlow ?? null;
  const setup = board.pipelineSetup ?? null;
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
    const runOf = (state: GateProfileRunFacts['state'], elapsedMilliseconds: number | null): GateProfileRunFacts => ({
      profileRunId: 'P1', gateName: 'a11y', phase: 'merge', state, elapsedMilliseconds,
    });
    const benchmarkAfter = (run: GateProfileRunFacts) => drawnEditingRows([run]).find((row) => row.field === 'gate:a11y')?.benchmark;
    expect(benchmarkAfter(runOf('running', 12_000))).toMatchObject({ statusText: 'Benchmarking in the merge phase…', measuring: true });
    expect(benchmarkAfter(runOf('passed', 41_000))).toMatchObject({ statusText: 'Takes 41 s in the merge phase', measuring: false });
  });

  test('the benchmark sends gate-profile-start for the gate in its phase', () => {
    const benchmark = drawnEditingRows().find((row) => row.field === 'gate:a11y')?.benchmark ?? null;
    if (benchmark === null) throw new Error('a11y offers no benchmark');
    expect(ChangeListModel.benchmarkCommandOf('S2', benchmark)).toEqual({
      kind: 'gate-profile-start', setupId: 'S2', gateName: 'a11y', phase: 'merge',
    });
  });
});

describe('the field words', () => {
  test('word every kind of field by what it names', () => {
    const fields: PipelineDraftField[] = [
      'prepare:install',
      'phase-order:merge',
      'prepare-order',
      'role:conflictReReviewer',
      'review',
      'airlock',
      'approval:tickets',
      'approval:merge',
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
      { title: 'Constitution', place: 'CONSTITUTION.md' },
    ]);
  });
});

describe('Undo', () => {
  test('sends pipeline-draft-undo with the setup and the edit', () => {
    expect(ChangeListModel.undoCommandOf('S1', 'E2')).toEqual({ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2' });
  });
});
