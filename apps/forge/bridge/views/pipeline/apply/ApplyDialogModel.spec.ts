/**
 * The first Apply's model. What matters: the "Resume the board" line counts the pending tickets and names the concurrency limit only when
 * the facts carry one; the constitution note shows only while the draft holds a constitution; the command carries the record, its draft
 * revision and the checkbox's value as given.
 */
import { describe, expect, test } from 'bun:test';

import { pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { ApplyDialogModel }     from './ApplyDialogModel.ts';

function record() {
  const setup = pipelineBoardStateOf('A4').pipelineSetup ?? null;
  if (setup === null) throw new Error('the fixture A4 has no setup');
  return setup.record;
}

describe('Resume the board', () => {
  test('counts the pending tickets and names the limit when the facts carry one', () => {
    expect(ApplyDialogModel.resumeTextOf(3, 2)).toBe('The 3 pending tickets start building, 2 at a time.');
    expect(ApplyDialogModel.resumeTextOf(1, 2)).toBe('The pending ticket starts building, 2 at a time.');
    expect(ApplyDialogModel.resumeTextOf(0, null)).toBe('No ticket is pending yet. New tickets start building.');
  });
});

describe('the constitution note and the command', () => {
  test('the note shows only while the draft holds a constitution', () => {
    expect(ApplyDialogModel.constitutionNoteOf(record())).toBe('Apply commits CONSTITUTION.md to main, then stores the pipeline.');
    expect(ApplyDialogModel.constitutionNoteOf({ ...record(), constitution: null })).toBeNull();
  });

  test('the command carries the record, its draft revision and resumesBoard as given', () => {
    expect(ApplyDialogModel.applyCommandOf(record(), false)).toEqual({
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 7, resumesBoard: false,
    });
  });
});
