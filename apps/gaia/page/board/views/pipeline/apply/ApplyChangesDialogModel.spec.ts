/**
 * The model of Apply changes against the editing fixture. What matters: the title and the button count the changes; the version line
 * names the applied revision and the next, or version 1 for a pipeline that no Apply numbered; each row names where the change is and its
 * kind, a gate by the phases whose rows hold it and a changed constitution as committed to main on Apply; the in-flight words follow the
 * revision; the command never resumes the board.
 */
import { describe, expect, test }         from 'bun:test';
import type { BoardPipelineFlowDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }           from '../../../testing/PipelineFixture.ts';
import { ApplyChangesDialogModel }        from './ApplyChangesDialogModel.ts';

function editing() {
  const board = pipelineBoardStateOf('A6b');
  const flow = board.pipeline.flow ?? null;
  const setup = board.pipeline.setup ?? null;
  if (flow === null || setup === null) throw new Error('the fixture A6b has no flow or no setup');
  return { board, flow, setup };
}

describe('the title and the version line', () => {
  test('count the changes and name the applied revision and the next', () => {
    expect(ApplyChangesDialogModel.titleOf(4)).toBe('Apply 4 changes?');
    expect(ApplyChangesDialogModel.applyLabelOf(1)).toBe('Apply 1 change');
    expect(ApplyChangesDialogModel.appliedRevisionOf(editing().board.pipeline.applied)).toBe(2);
    expect(ApplyChangesDialogModel.versionLineOf(1)).toBe('Version 1 becomes version 2. Everything else stays as it is.');
  });

  test('a pipeline no Apply numbered becomes version 1', () => {
    expect(ApplyChangesDialogModel.appliedRevisionOf(pipelineBoardStateOf('A7-human-code-review-without-review').pipeline.applied)).toBeNull();
    expect(ApplyChangesDialogModel.versionLineOf(null)).toBe('The pipeline becomes version 1. Everything else stays as it is.');
  });
});

describe('the rows', () => {
  test('name where each change is and its kind', () => {
    const { flow } = editing();
    expect(ApplyChangesDialogModel.changeRowsOf(flow.changeList, flow)).toEqual([
      {
        field: 'role:reviewer', change: 'changed', title: 'Review', location: 'agent step · changed',
      },
      {
        field: 'gate:browser-tests', change: 'new', title: 'browser-tests', location: 'merge gate · new',
      },
      {
        field: 'gate:lint', change: 'removed', title: 'lint', location: 'build and review gate · removed',
      },
      {
        field: 'constitution', change: 'changed', title: 'Constitution', location: 'CONSTITUTION.md · committed to main on Apply',
      },
    ]);
  });

  test('a gate that no row holds is a plain gate, and three phases read as a list', () => {
    const { flow } = editing();
    const noRows: BoardPipelineFlowDocument = { ...flow, gateRows: { build: [], review: [], merge: [] } };
    expect(ApplyChangesDialogModel.changeRowsOf([{ field: 'gate:lint', changeKind: 'removed', editId: null }], noRows)[0]?.location)
      .toBe('gate · removed');
    const row = flow.gateRows.merge.find((candidate) => candidate.rowKind === 'gate');
    if (row === undefined) throw new Error('the fixture A6b has no merge gate row');
    const everyPhase: BoardPipelineFlowDocument = { ...flow, gateRows: { build: [row], review: [row], merge: [row] } };
    expect(ApplyChangesDialogModel.changeRowsOf([{ field: `gate:${row.name}`, changeKind: 'changed', editId: null }], everyPhase)[0]?.location)
      .toBe('build, review and merge gate · changed');
  });
});

describe('the in-flight words and the command', () => {
  test('the in-flight words follow the revision', () => {
    expect(ApplyChangesDialogModel.inFlightLeadOf(1)).toBe('1 ticket is in flight.');
    expect(ApplyChangesDialogModel.inFlightTextOf(1)).toBe('Each takes version 2 at its next gate run; a run already started finishes on version 1.');
  });

  test('the command never resumes the board', () => {
    expect(ApplyChangesDialogModel.applyCommandOf(editing().setup.record)).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-apply', setupId: 'S2', draftRevision: 7, resumesBoard: false,
    });
  });
});
