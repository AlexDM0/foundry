/**
 * The pipeline hash a row records of the pipeline it is judged by. What matters: the hash of a stored pipeline never changes, since a
 * changed hash makes every recorded row stale. The frozen hashes were taken from the implementation before the steps stayed structured;
 * retake them only in a change that means to invalidate every recorded row, by printing `pipelineHashOf` for each pipeline below.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline } from '../@types/Pipeline.ts';
import { PipelineUtil }  from './PipelineUtil.ts';

const FROZEN_PIPELINE_HASHES: readonly [string, Pipeline, string][] = [
  ['no gates', { prepare: [], gates: [] }, '9fe6829d68c379f4'],
  [
    'one prepare step and one gate',
    { prepare: [{ name: 'install', run: 'bun install' }], gates: [{ name: 'verify', run: 'bun run verify' }] },
    '50750a799adf8ffb',
  ],
  [
    'two prepare steps, a gate in a folder with every key, an Overseer gate, a review and a constitution',
    {
      prepare: [{ name: 'install', run: 'bun install' }, { name: 'generate', run: 'bun run generate' }],
      gates:   [
        {
          name: 'tests', run: 'bun test', in: 'service', fix: 'bun test --update', network: ['registry.example.com'], writes: ['~/.cache/example'],
        },
        { name: 'lint', run: 'bun run lint', overseerOnly: true },
      ],
      review:       { name: 'review', model: 'opus', effort: 'medium' },
      constitution: ['CLAUDE.md'],
    },
    'a49eb5703e7d031f',
  ],
];

describe('the pipeline hash', () => {
  for (const [description, pipeline, frozenHash] of FROZEN_PIPELINE_HASHES) {
    test(`stays the frozen hash for ${description}`, () => {
      expect(PipelineUtil.pipelineHashOf(pipeline)).toBe(frozenHash);
    });
  }

  test('keeps its hash when a hand edit only reorders the keys', () => {
    const reordered = { gates: [{ run: 'bun run verify', name: 'verify' }], prepare: [{ run: 'bun install', name: 'install' }] } as Pipeline;

    expect(PipelineUtil.pipelineHashOf(reordered)).toBe('50750a799adf8ffb');
  });

  test('keeps its hash when only the billing changes, as when only the approvals change', () => {
    const pipeline: Pipeline = { prepare: [{ name: 'install', run: 'bun install' }], gates: [{ name: 'verify', run: 'bun run verify' }] };

    expect(PipelineUtil.pipelineHashOf({ ...pipeline, billing: { mode: 'subscription' } })).toBe('50750a799adf8ffb');
    expect(PipelineUtil.pipelineHashOf({ ...pipeline, billing: { mode: 'api' } })).toBe('50750a799adf8ffb');
    expect(PipelineUtil.pipelineHashOf({ ...pipeline, billing: { mode: 'api', maxBudgetUsd: 5 } })).toBe('50750a799adf8ffb');
  });
});
