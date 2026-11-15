/**
 * The live pipeline's footer and toast. What matters: the footer names the applied version, its time and User, the content hash, and the
 * constitution commit only when the newest Apply made one; an Apply counts as landed only once the facts carry a newer applied version;
 * the toast says "Board resumed" only for an Apply that resumed the board.
 */
import { describe, expect, test } from 'bun:test';

import type { AppliedPipelineFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { pipelineBoardStateOf }      from '../../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }  from '../../../testing/TimestampSlicesFixture.ts';
import { LivePipelineModel }         from './LivePipelineModel.ts';

const FORMAT = { todayCalendarDate: '2026-11-12', slices: EXAMPLE_TIMESTAMP_SLICES };

function appliedPipeline(): Extract<AppliedPipelineFacts, { readingVerdict: 'readable' }> {
  const { pipeline } = pipelineBoardStateOf('A5');
  if (pipeline?.readingVerdict !== 'readable') throw new Error('A5 has no readable pipeline');
  return pipeline;
}

describe('footerOf', () => {
  test('the version, its time and User, the content hash and the constitution commit', () => {
    expect(LivePipelineModel.footerOf(appliedPipeline(), FORMAT)).toEqual({
      versionText: 'Version 2 · applied 10:30 by User',
      hashText:    'content hash example-',
      commitText:  'CONSTITUTION.md 2222222',
      fileText:    appliedPipeline().fileText,
    });
  });

  test('no constitution commit, no commit text; no slices, no time', () => {
    const pipeline = appliedPipeline();
    const withoutCommit = { ...pipeline, application: { ...pipeline.application, constitutionCommit: null } } as AppliedPipelineFacts;
    expect(LivePipelineModel.footerOf(withoutCommit, null)).toMatchObject({ versionText: 'Version 2 · applied by User', commitText: null });
  });

  test('a pipeline the gate verbs wrote has no version, and an unreadable one no footer', () => {
    expect(LivePipelineModel.footerOf({ ...appliedPipeline(), application: null }, FORMAT)?.versionText).toBe('Set with the gate verbs, never applied here');
    expect(LivePipelineModel.footerOf({ readingVerdict: 'absent' }, FORMAT)).toBeNull();
  });
});

describe('landedRevisionOf', () => {
  test('an Apply lands once the applied version is newer than before it', () => {
    expect(LivePipelineModel.landedRevisionOf(null, appliedPipeline())).toBe(2);
    expect(LivePipelineModel.landedRevisionOf(1, appliedPipeline())).toBe(2);
    expect(LivePipelineModel.landedRevisionOf(2, appliedPipeline())).toBeNull();
    expect(LivePipelineModel.landedRevisionOf(null, { readingVerdict: 'absent' })).toBeNull();
  });
});

describe('toastOf', () => {
  test('"Board resumed" only when the Apply resumed the board', () => {
    expect(LivePipelineModel.toastOf(true, 1)).toEqual({ title: 'Pipeline applied', text: 'Board resumed · Version 1 is live.' });
    expect(LivePipelineModel.toastOf(false, 3)).toEqual({ title: 'Pipeline applied', text: 'Version 3 is live.' });
  });
});
