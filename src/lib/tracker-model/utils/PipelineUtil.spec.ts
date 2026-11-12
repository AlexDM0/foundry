/**
 * The hashes of a pipeline, the gates of each phase and the instructions a role reads. What matters: a stored pipeline's hashes never
 * change, since a changed hash makes recorded greens stale; a phase hash moves only with the prepare steps and that phase's gates, so an
 * edit of agent settings, instructions, the constitution, re-review, approvals or billing never regates a ticket; the content hash moves
 * with every key but `billing`. The phase and content hashes were taken from the implementation that first computed them; retake them only
 * in a change that means to invalidate every recorded row, by printing each hash for each pipeline below.
 */
import { describe, expect, test } from 'bun:test';

import type { GatePhase }                  from '../@types/GatePhase.ts';
import { GATE_PHASES }                     from '../@types/GatePhase.ts';
import type { InstructionEntry, Pipeline } from '../@types/Pipeline.ts';
import { PipelineUtil }                    from './PipelineUtil.ts';

const ONE_STEP_ONE_GATE: Pipeline = {
  version: 2,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'verify', run: 'bun run verify' }],
  phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
};

const FULL_PIPELINE: Pipeline = {
  version: 2,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [
    { name: 'lint', run: 'bun run lint', writes: ['~/.cache/lint'] },
    {
      name: 'tests', run: 'bun test', in: 'service', writes: ['~/.cache/tests', '~/.cache/lint']
    },
    { name: 'smoke', run: 'bun run smoke' },
  ],
  phases:       { build: ['tests', 'lint'], review: ['lint'], merge: ['lint', 'tests', 'smoke'] },
  review:       { name: 'review', reReview: { thresholdLines: 750 } },
  airlock:      { reReview: { thresholdLines: 300 } },
  constitution: { path: 'CONSTITUTION.md' },
  agents:       { builder: { model: 'opus', effort: 'high' }, reviewer: { instructions: [] } },
  approvals:    { tickets: true, merge: true },
  billing:      { mode: 'api', maxBudgetUsd: 5 },
};

const FROZEN_PHASE_AND_CONTENT_HASHES: readonly [string, Pipeline, Record<GatePhase, string>, string][] = [
  ['the minimal pipeline', {
    version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  }, { build: '146c3b4ca0984372', review: '146c3b4ca0984372', merge: '146c3b4ca0984372' }, '80e97fa2e7bddedf'],
  ['a pipeline with every key', FULL_PIPELINE, { build: '0496db2e5271e410', review: '3a8acba95f67264e', merge: '056057fab8c449a0' }, '818a3f6ee909b924'],
];

const EDITS_OUTSIDE_THE_GATES: readonly [string, Pipeline][] = [
  ['an agent setting', { ...FULL_PIPELINE, agents: { builder: { model: 'sonnet', effort: 'high' }, reviewer: { instructions: [] } } }],
  ['an instruction list', { ...FULL_PIPELINE, agents: { builder: { model: 'opus', effort: 'high', instructions: [{ kind: 'file', path: 'docs/build.md' }] } } }],
  ['the constitution', { ...FULL_PIPELINE, constitution: { path: 'docs/constitution.md' } }],
  ['the review re-review', { ...FULL_PIPELINE, review: { name: 'review' } }],
  ['the merge train re-review', { ...FULL_PIPELINE, airlock: { reReview: { thresholdLines: 500 } } }],
  ['the approvals', { ...FULL_PIPELINE, approvals: { tickets: false } }],
  ['the billing', { ...FULL_PIPELINE, billing: { mode: 'subscription' } }],
];

describe('the phase hash', () => {
  for (const [description, pipeline, frozenPhaseHashes] of FROZEN_PHASE_AND_CONTENT_HASHES) {
    test(`stays the frozen hash of each phase for ${description}`, () => {
      for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(pipeline, phase)).toBe(frozenPhaseHashes[phase]);
    });
  }

  for (const [description, edited] of EDITS_OUTSIDE_THE_GATES) {
    test(`stays equal in every phase when only ${description} changes`, () => {
      for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(edited, phase)).toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, phase));
    });
  }

  test('changes only in the phases whose gates change order', () => {
    const reordered: Pipeline = { ...FULL_PIPELINE, phases: { ...FULL_PIPELINE.phases, build: ['lint', 'tests'] } };

    expect(PipelineUtil.phaseHashOf(reordered, 'build')).not.toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'build'));
    expect(PipelineUtil.phaseHashOf(reordered, 'review')).toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'review'));
    expect(PipelineUtil.phaseHashOf(reordered, 'merge')).toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'merge'));
  });

  test('changes only in the phases that run a gate whose definition changes', () => {
    const edited: Pipeline = { ...FULL_PIPELINE, gates: FULL_PIPELINE.gates.map((gate) => (gate.name === 'smoke' ? { ...gate, fix: 'bun run smoke --fix' } : gate)) };

    expect(PipelineUtil.phaseHashOf(edited, 'merge')).not.toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'merge'));
    expect(PipelineUtil.phaseHashOf(edited, 'build')).toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'build'));
    expect(PipelineUtil.phaseHashOf(edited, 'review')).toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'review'));
  });

  test('changes in every phase when a prepare step changes', () => {
    const edited: Pipeline = { ...FULL_PIPELINE, prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }] };

    for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(edited, phase)).not.toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, phase));
  });

  test('keeps its hash when a hand edit only reorders a gate\'s keys or writes an option out as its default', () => {
    const handEdited: Pipeline = {
      ...FULL_PIPELINE,
      gates: FULL_PIPELINE.gates.map((gate) => (gate.name === 'smoke' ? { run: 'bun run smoke', network: [], name: 'smoke' } : gate)),
    };

    expect(PipelineUtil.phaseHashOf(handEdited, 'merge')).toBe(PipelineUtil.phaseHashOf(FULL_PIPELINE, 'merge'));
  });

  test('keeps its hash in every phase when a hand edit only reorders the keys of the file', () => {
    const reordered = {
      phases:  { merge: ['verify'], review: ['verify'], build: ['verify'] },
      gates:   [{ run: 'bun run verify', name: 'verify' }],
      prepare: [{ run: 'bun install', name: 'install' }],
      version: 2,
    } as Pipeline;

    for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(reordered, phase)).toBe(PipelineUtil.phaseHashOf(ONE_STEP_ONE_GATE, phase));
  });
});

describe('the content hash', () => {
  for (const [description, pipeline, , frozenContentHash] of FROZEN_PHASE_AND_CONTENT_HASHES) {
    test(`stays the frozen hash for ${description}`, () => {
      expect(PipelineUtil.contentHashOf(pipeline)).toBe(frozenContentHash);
    });
  }

  for (const [description, edited] of EDITS_OUTSIDE_THE_GATES.filter(([description]) => description !== 'the billing')) {
    test(`changes when only ${description} changes`, () => {
      expect(PipelineUtil.contentHashOf(edited)).not.toBe(PipelineUtil.contentHashOf(FULL_PIPELINE));
    });
  }

  test('changes when a gate, a phase order or a prepare step changes', () => {
    const baseHash = PipelineUtil.contentHashOf(FULL_PIPELINE);

    expect(PipelineUtil.contentHashOf({ ...FULL_PIPELINE, gates: [...FULL_PIPELINE.gates, { name: 'audit', run: 'bun audit' }] })).not.toBe(baseHash);
    expect(PipelineUtil.contentHashOf({ ...FULL_PIPELINE, phases: { ...FULL_PIPELINE.phases, review: [] } })).not.toBe(baseHash);
    expect(PipelineUtil.contentHashOf({ ...FULL_PIPELINE, prepare: [] })).not.toBe(baseHash);
  });

  test('keeps its hash when only the billing changes', () => {
    const { billing: _billing, ...unbilled } = FULL_PIPELINE;

    expect(PipelineUtil.contentHashOf(unbilled)).toBe(PipelineUtil.contentHashOf(FULL_PIPELINE));
    expect(PipelineUtil.contentHashOf({ ...FULL_PIPELINE, billing: { mode: 'subscription' } })).toBe(PipelineUtil.contentHashOf(FULL_PIPELINE));
  });
});

describe('the gates of a phase and the gate catalogue', () => {
  test('gives a phase\'s gates in that phase\'s run order, not the definition order', () => {
    expect(PipelineUtil.gatesOfPhase(FULL_PIPELINE, 'build').map((gate) => gate.name)).toEqual(['tests', 'lint']);
    expect(PipelineUtil.gatesOfPhase(FULL_PIPELINE, 'merge').map((gate) => gate.name)).toEqual(['lint', 'tests', 'smoke']);
  });

  test('gives no gates for an empty phase', () => {
    expect(PipelineUtil.gatesOfPhase({ ...FULL_PIPELINE, phases: { ...FULL_PIPELINE.phases, review: [] } }, 'review')).toEqual([]);
  });

  test('lists every gate once, in definition order, with the phases that run it', () => {
    expect(PipelineUtil.gateCatalogueOf(FULL_PIPELINE).map(({ gate, phases }) => [gate.name, phases])).toEqual([
      ['lint', ['build', 'review', 'merge']],
      ['tests', ['build', 'merge']],
      ['smoke', ['merge']],
    ]);
  });

  test('gives every folder the gates write, each once, whatever phase runs the gate', () => {
    expect(PipelineUtil.writablePathsOf(FULL_PIPELINE)).toEqual(['~/.cache/lint', '~/.cache/tests']);
  });
});

describe('the instructions a role reads', () => {
  test('gives the default list of a role with no settings or no list', () => {
    expect(PipelineUtil.resolvedInstructionsOf(null, 'reReviewer')).toEqual([
      { kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'reReviewer' },
    ]);
    expect(PipelineUtil.resolvedInstructionsOf(FULL_PIPELINE, 'builder')).toEqual([{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }]);
    expect(PipelineUtil.resolvedInstructionsOf(FULL_PIPELINE, 'assistant')).toEqual([{ kind: 'default-brief', role: 'assistant' }]);
  });

  test('keeps an explicit empty list empty, for the caller to replace with the built-in brief', () => {
    expect(PipelineUtil.resolvedInstructionsOf(FULL_PIPELINE, 'reviewer')).toEqual([]);
  });

  test('gives an explicit list as written, in its order', () => {
    const instructions: InstructionEntry[] = [{ kind: 'file', path: 'docs/intake.md' }, { kind: 'default-brief', role: 'productOwner' }];
    const listed: Pipeline = { ...FULL_PIPELINE, agents: { productOwner: { instructions } } };

    expect(PipelineUtil.resolvedInstructionsOf(listed, 'productOwner')).toEqual(instructions);
  });
});
