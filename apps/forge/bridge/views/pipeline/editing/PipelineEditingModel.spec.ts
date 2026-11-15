/**
 * The editing model against the A6 fixture. What matters: the footer counts the changes with the version they make, and only the count
 * for a pipeline that no Apply numbered, and the panel head the version step; the agent tab's status follows its job; the board note
 * names the version that runs until Apply; the change cards read the applied pipeline and the draft of the facts, and nothing without a
 * flow; Ask the pipeline agent to check and Discard send their commands with the setup.
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

  test('says whether the agent runs', () => {
    expect(PipelineEditingModel.agentStatusOf(null)).toEqual({ tone: 'idle', text: 'Not running' });
    expect(PipelineEditingModel.agentStatusOf('running')).toEqual({ tone: 'working', text: 'Running' });
  });
});

describe('the change cards', () => {
  test('read the applied pipeline and the draft of the facts', () => {
    const board = pipelineBoardStateOf('A6-drawn-changes');
    const editing = PipelineEditingModel.changeListEditingOf(board);
    if (board.pipeline?.readingVerdict !== 'readable') throw new Error('the fixture A6-drawn-changes has no readable pipeline');
    expect(editing?.base).toBe(board.pipeline.pipeline);
    expect(editing?.draft).toBe(board.pipelineSetup?.record.draft);
    expect(editing?.draft).not.toBe(editing?.base);
    expect(PipelineEditingModel.changeListEditingOf({ ...board, pipelineFlow: null })).toBeNull();
  });
});

describe('the commands', () => {
  test('Ask the pipeline agent to check and Discard name the setup', () => {
    expect(PipelineEditingModel.checkCommandOf('S2')).toEqual({ kind: 'pipeline-check', setupId: 'S2' });
    expect(PipelineEditingModel.discardCommandOf('S2')).toEqual({ kind: 'pipeline-draft-discard', setupId: 'S2' });
  });
});
