/**
 * The gate run on a merged tree when `pipeline.json` cannot be read. What matters: an older or a malformed file never passes the tree
 * as a pipeline with no gates; the run ends `cannot-run`, which opens `gate-cannot-run` and holds the merge, and names the file and why.
 * A readable file, or none, is gated as before.
 */
import { describe, expect, test } from 'bun:test';

import { unreadablePipelineGateOf } from './UnreadablePipelineGate.ts';

describe('a merged-tree gate run on a pipeline.json it cannot read', () => {
  test('an older file ends the run cannot-run, naming the file, with no stamp', () => {
    expect(unreadablePipelineGateOf({ verdict: 'older' })).toEqual({
      outcome: 'cannot-run', step: 'pipeline.json', output: 'older', stamp: null
    });
  });

  test('a malformed file ends the run cannot-run with the reason it is malformed', () => {
    expect(unreadablePipelineGateOf({ verdict: 'malformed', reason: 'gates is not a list' }))
      .toEqual({
        outcome: 'cannot-run', step: 'pipeline.json', output: 'gates is not a list', stamp: null
      });
  });

  test('a readable file, or no file, runs its gates as before', () => {
    expect(unreadablePipelineGateOf({ verdict: 'absent' })).toBeNull();
    expect(unreadablePipelineGateOf({
      verdict:  'readable',
      pipeline: {
        version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
      }
    } as Parameters<typeof unreadablePipelineGateOf>[0])).toBeNull();
  });
});
