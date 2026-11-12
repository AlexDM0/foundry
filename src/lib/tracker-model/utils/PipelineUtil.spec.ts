/**
 * The pipeline hash a row records of the pipeline it is judged by. What matters: the hash of a stored pipeline never changes, since a
 * changed hash makes every recorded row stale. The frozen hashes were taken from the implementation that first read version 2 of the
 * format; retake them only in a change that means to invalidate every recorded row, by printing `pipelineHashOf` for each pipeline below.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline } from '../@types/Pipeline.ts';
import { PipelineUtil }  from './PipelineUtil.ts';

const ONE_STEP_ONE_GATE: Pipeline = {
  version: 2,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'verify', run: 'bun run verify' }],
  phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
};

const FROZEN_PIPELINE_HASHES: readonly [string, Pipeline, string][] = [
  ['no gates', {
    version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  }, '6d35e8d7a5cf39ff'],
  ['one prepare step and one gate', ONE_STEP_ONE_GATE, '8eec878315b151ef'],
  [
    'two prepare steps, a gate in a folder with every key, an Overseer gate, a review with its reviewer and a constitution',
    {
      version: 2,
      prepare: [{ name: 'install', run: 'bun install' }, { name: 'generate', run: 'bun run generate' }],
      gates:   [
        {
          name: 'tests', run: 'bun test', in: 'service', fix: 'bun test --update', network: ['registry.example.com'], writes: ['~/.cache/example'],
        },
        { name: 'lint', run: 'bun run lint', overseerOnly: true },
      ],
      phases:       { build: ['tests', 'lint'], review: ['tests'], merge: ['lint', 'tests'] },
      review:       { name: 'review', reReview: { thresholdLines: 750 } },
      airlock:      { reReview: { thresholdLines: 300 } },
      constitution: { path: 'CLAUDE.md' },
      agents:       { reviewer: { model: 'opus', effort: 'medium', instructions: [{ kind: 'constitution' }, { kind: 'file', path: 'docs/review.md' }] } },
    },
    'f23c1f7f2ff7f24f',
  ],
];

describe('the pipeline hash', () => {
  for (const [description, pipeline, frozenHash] of FROZEN_PIPELINE_HASHES) {
    test(`stays the frozen hash for ${description}`, () => {
      expect(PipelineUtil.pipelineHashOf(pipeline)).toBe(frozenHash);
    });
  }

  test('keeps its hash when a hand edit only reorders the keys', () => {
    const reordered = {
      phases:  { merge: ['verify'], review: ['verify'], build: ['verify'] },
      gates:   [{ run: 'bun run verify', name: 'verify' }],
      prepare: [{ run: 'bun install', name: 'install' }],
      version: 2,
    } as Pipeline;

    expect(PipelineUtil.pipelineHashOf(reordered)).toBe(PipelineUtil.pipelineHashOf(ONE_STEP_ONE_GATE));
  });

  test('keeps its hash when only the billing changes, as when only the approvals change', () => {
    const frozenHash = PipelineUtil.pipelineHashOf(ONE_STEP_ONE_GATE);

    expect(PipelineUtil.pipelineHashOf({ ...ONE_STEP_ONE_GATE, billing: { mode: 'subscription' } })).toBe(frozenHash);
    expect(PipelineUtil.pipelineHashOf({ ...ONE_STEP_ONE_GATE, billing: { mode: 'api' } })).toBe(frozenHash);
    expect(PipelineUtil.pipelineHashOf({ ...ONE_STEP_ONE_GATE, billing: { mode: 'api', maxBudgetUsd: 5 } })).toBe(frozenHash);
    expect(PipelineUtil.pipelineHashOf({ ...ONE_STEP_ONE_GATE, approvals: { tickets: false, merge: true } })).toBe(frozenHash);
  });

  test('changes when a gate moves between phases, though the gates stay the same', () => {
    const buildOnly: Pipeline = { ...ONE_STEP_ONE_GATE, phases: { build: ['verify'], review: [], merge: [] } };

    expect(PipelineUtil.pipelineHashOf(buildOnly)).not.toBe(PipelineUtil.pipelineHashOf(ONE_STEP_ONE_GATE));
  });
});
