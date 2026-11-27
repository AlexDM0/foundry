/**
 * The editing model against the applied-pipeline fixture: the footer's count and version, the agent tab's status, the board note, the
 * change cards, and the commands of Ask the pipeline agent to check and Discard; over entities, the levels counted and grouped.
 */
import { describe, expect, test } from 'bun:test';

import { pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { PipelineEditingModel } from './PipelineEditingModel.ts';

describe('the footer', () => {
  test('counts the changes with the version they make', () => {
    expect(PipelineEditingModel.footerSummaryOf(4, 1)).toBe('4 changes · version 1 → 2');
    expect(PipelineEditingModel.footerSummaryOf(1, null)).toBe('1 change');
  });

  test('names the version the board keeps until Apply', () => {
    expect(PipelineEditingModel.boardNoteOf(1)).toBe('The board keeps running on version 1 until Apply.');
    expect(PipelineEditingModel.boardNoteOf(null)).toBe('The board keeps running on the applied pipeline until Apply.');
  });
});

describe('the panel head', () => {
  test('names the version step, and none for a pipeline that no Apply numbered', () => {
    expect(PipelineEditingModel.versionStepTextOf(2)).toBe('Version 2 → 3');
    expect(PipelineEditingModel.versionStepTextOf(null)).toBeNull();
  });

  test('says whether the agent runs, and that forge did not launch it rather than Running', () => {
    expect(PipelineEditingModel.agentStatusOf('stopped')).toEqual({ tone: 'idle', text: 'Not running' });
    expect(PipelineEditingModel.agentStatusOf('running')).toEqual({ tone: 'working', text: 'Running' });
    expect(PipelineEditingModel.agentStatusOf('not-launched')).toEqual({ tone: 'failed', text: 'Not launched' });
  });
});

describe('the change cards', () => {
  test('read the applied pipeline and the draft of the facts', () => {
    const board = pipelineBoardStateOf('A6-drawn-changes');
    const editing = PipelineEditingModel.changeListEditingOf(board);
    if (board.pipeline.applied.readingVerdict !== 'readable') throw new Error('the fixture A6-drawn-changes has no readable pipeline');
    expect(editing?.base).toBe(board.pipeline.applied.pipeline);
    expect(editing?.draft).toBe(board.pipeline.setup?.record.draft);
    expect(editing?.draft).not.toBe(editing?.base);
    expect(PipelineEditingModel.changeListEditingOf({ ...board, pipeline: { ...board.pipeline, flow: null } })).toBeNull();
  });
});

describe('the commands', () => {
  test('Ask the pipeline agent to check and Discard name the setup', () => {
    expect(PipelineEditingModel.checkCommandOf('S2')).toEqual({ boardCommandVersion: 3, kind: 'pipeline-check', setupId: 'S2' });
    expect(PipelineEditingModel.discardCommandOf('S2')).toEqual({ boardCommandVersion: 3, kind: 'pipeline-draft-discard', setupId: 'S2' });
  });
});

describe('a draft over entities', () => {
  test('the footer counts the changes and the levels they are in', () => {
    expect(PipelineEditingModel.levelsFooterSummaryOf(4, 3, 1)).toBe('4 changes in 3 levels · version 1 → 2');
    expect(PipelineEditingModel.levelsFooterSummaryOf(1, 1, null)).toBe('1 change in 1 level');
  });

  test('the changes group by level, the forge first, and the check names the entities the draft touches', () => {
    const groups = PipelineEditingModel.levelGroupsOf(pipelineBoardStateOf('mono-editing'));
    expect(groups.map((group) => [group.name, group.changeCount])).toEqual([['Forge', 1], ['web', 1], ['design-system', 2]]);
    expect(PipelineEditingModel.checkCoverageTextOf(groups)).toBe('The check covers web and design-system: the entities this draft touches.');
    expect(PipelineEditingModel.checkCoverageTextOf(groups.slice(0, 2))).toBe('The check covers web: the entity this draft touches.');
    expect(PipelineEditingModel.checkCoverageTextOf(groups.slice(0, 1))).toBeNull();
  });
});
