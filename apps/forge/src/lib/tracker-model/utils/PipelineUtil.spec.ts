/**
 * The hashes of a pipeline, the gates of each phase and the instructions a role reads. What matters: a stored pipeline's hashes never
 * change, since a changed hash makes recorded greens stale; a phase hash moves only with the prepare steps and that phase's gates, so an
 * edit of agent settings, instructions, the constitution, re-review, approvals, billing or reach never regates a ticket; the content hash
 * moves with every key but `billing`, and a pipeline with no key version 3 added hashes as version 2 did. The phase hashes were taken from the
 * implementation that first computed them, a version 2 pipeline's content hash from version 2's (`db64ed0a`) and a version 3 one's from
 * version 3's, since the content hash covers the version; retake them only in a change that means to invalidate every recorded row, by
 * printing each hash for each pipeline below. The format version names the earliest that holds a pipeline, and only entities make it 4.
 * An entity reads as an ordinary single pipeline: its own steps, gates and roles with the forge's merge train, approvals, billing and
 * forge-level roles, so its phase hashes are those of the same single pipeline; a key the pipeline has no entity for gives none. A gate
 * run of entities stamps the forge's own phase hash untouched and each gated entity's beside it.
 */
import { describe, expect, test } from 'bun:test';

import type { GatePhase }                                  from '../@types/GatePhase.ts';
import { GATE_PHASES }                                     from '../@types/GatePhase.ts';
import type { InstructionEntry, Pipeline, PipelineEntity } from '../@types/Pipeline.ts';
import { PipelineUtil }                                    from './PipelineUtil.ts';

const ONE_STEP_ONE_GATE: Pipeline = {
  version: 3,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'verify', run: 'bun run verify' }],
  phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
};

const FULL_VERSION_TWO_PIPELINE: Pipeline = {
  version: 3,
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

const FULL_PIPELINE: Pipeline = { ...FULL_VERSION_TWO_PIPELINE, reach: ['/packages/shared', '/bun.lock'] };

const EXAMPLE_APP_ENTITY: PipelineEntity = {
  kind:         'app',
  home:         ['/apps/example'],
  summary:      'The example app.',
  constitution: { path: '/apps/example/CONSTITUTION.md' },
  prepare:      [{ name: 'install', run: 'bun install', in: '/' }],
  gates:        [{ name: 'verify', run: 'bun run gate:example', in: '/' }],
  phases:       { build: ['verify'], review: ['verify'], merge: ['verify'] },
  review:       { name: 'review' },
  agents:       { builder: { model: 'opus', effort: 'high' } },
  whitelist:    ['shared'],
  reach:        ['/bun.lock'],
  dependsOn:    ['shared'],
  concurrency:  2,
};

const SHARED_PACKAGE_ENTITY: PipelineEntity = {
  kind: 'package', home: ['/packages/shared'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, review: { name: 'review' },
};

const ENTITIES_PIPELINE: Pipeline = {
  version:   3,
  prepare:   [],
  gates:     [],
  phases:    { build: [], review: [], merge: [] },
  airlock:   { reReview: { thresholdLines: 300 } },
  agents:    { productOwner: { model: 'opus', effort: 'high' }, builder: { model: 'sonnet' } },
  approvals: { merge: true },
  billing:   { mode: 'subscription' },
  entities:  { 'example': EXAMPLE_APP_ENTITY, 'shared': SHARED_PACKAGE_ENTITY },
};

const FULL_PHASE_HASHES: Record<GatePhase, string> = { build: '0496db2e5271e410', review: '3a8acba95f67264e', merge: '056057fab8c449a0' };

const FROZEN_PHASE_AND_CONTENT_HASHES: readonly [string, Pipeline, Record<GatePhase, string>, string][] = [
  ['the minimal pipeline', {
    version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  }, { build: '146c3b4ca0984372', review: '146c3b4ca0984372', merge: '146c3b4ca0984372' }, '80e97fa2e7bddedf'],
  ['a pipeline with every key version 2 has', FULL_VERSION_TWO_PIPELINE, FULL_PHASE_HASHES, '818a3f6ee909b924'],
  ['a pipeline with every key', FULL_PIPELINE, FULL_PHASE_HASHES, '7a065b9d0f0f4fff'],
];

const EDITS_OUTSIDE_THE_GATES: readonly [string, Pipeline][] = [
  ['an agent setting', { ...FULL_PIPELINE, agents: { builder: { model: 'sonnet', effort: 'high' }, reviewer: { instructions: [] } } }],
  ['an instruction list', { ...FULL_PIPELINE, agents: { builder: { model: 'opus', effort: 'high', instructions: [{ kind: 'file', path: 'docs/build.md' }] } } }],
  ['the constitution', { ...FULL_PIPELINE, constitution: { path: 'docs/constitution.md' } }],
  ['the review re-review', { ...FULL_PIPELINE, review: { name: 'review' } }],
  ['the merge train re-review', { ...FULL_PIPELINE, airlock: { reReview: { thresholdLines: 500 } } }],
  ['the approvals', { ...FULL_PIPELINE, approvals: { tickets: false } }],
  ['the billing', { ...FULL_PIPELINE, billing: { mode: 'subscription' } }],
  ['the reach', { ...FULL_PIPELINE, reach: ['/packages/shared'] }],
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
      version: 3,
    } as Pipeline;

    for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(reordered, phase)).toBe(PipelineUtil.phaseHashOf(ONE_STEP_ONE_GATE, phase));
  });

  test('changes in every phase when a prepare step gains a folder, and stays as before for a step without one', () => {
    const inFolder: Pipeline = { ...ONE_STEP_ONE_GATE, prepare: [{ name: 'install', run: 'bun install', in: '/' }] };

    for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(inFolder, phase)).not.toBe(PipelineUtil.phaseHashOf(ONE_STEP_ONE_GATE, phase));
  });

  test('is the hash a gate run of that phase stamps, beside the phase', () => {
    for (const phase of GATE_PHASES) {
      expect(PipelineUtil.gateRunStampOf(FULL_PIPELINE, phase)).toEqual({ phase, phaseHash: PipelineUtil.phaseHashOf(FULL_PIPELINE, phase) });
    }
  });
});

describe('the format version', () => {
  test('is 2 for a pipeline holding no key version 3 added, a gate folder of the project included', () => {
    expect(PipelineUtil.formatVersionOf(PipelineUtil.minimalPipelineOf())).toBe(2);
    expect(PipelineUtil.formatVersionOf(FULL_VERSION_TWO_PIPELINE)).toBe(2);
  });

  test('is 3 for a reach, a prepare step\'s folder or a gate folder from the repository\'s root', () => {
    expect(PipelineUtil.formatVersionOf(FULL_PIPELINE)).toBe(3);
    expect(PipelineUtil.formatVersionOf({ ...ONE_STEP_ONE_GATE, reach: [] })).toBe(3);
    expect(PipelineUtil.formatVersionOf({ ...ONE_STEP_ONE_GATE, prepare: [{ name: 'install', run: 'bun install', in: 'packages/example' }] })).toBe(3);
    expect(PipelineUtil.formatVersionOf({ ...ONE_STEP_ONE_GATE, gates: [{ name: 'verify', run: 'bun run verify', in: '/' }] })).toBe(3);
  });

  test('is 4 for a pipeline with entities, an empty entity record included, whatever else it holds', () => {
    expect(PipelineUtil.formatVersionOf(ENTITIES_PIPELINE)).toBe(4);
    expect(PipelineUtil.formatVersionOf({ ...PipelineUtil.minimalPipelineOf(), entities: {} })).toBe(4);
    expect(PipelineUtil.formatVersionOf({ ...FULL_PIPELINE, entities: {} })).toBe(4);
  });

  test('is never 4 for a pipeline without entities', () => {
    for (const [description, pipeline] of FROZEN_PHASE_AND_CONTENT_HASHES) expect(PipelineUtil.formatVersionOf(pipeline), description).not.toBe(4);
    for (const [description, pipeline] of EDITS_OUTSIDE_THE_GATES) expect(PipelineUtil.formatVersionOf(pipeline), description).not.toBe(4);
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

  test('changes when an entity changes, and keeps its hash when only the order of the entities changes', () => {
    const baseHash = PipelineUtil.contentHashOf(ENTITIES_PIPELINE);
    const reordered: Pipeline = { ...ENTITIES_PIPELINE, entities: { 'shared': SHARED_PACKAGE_ENTITY, 'example': EXAMPLE_APP_ENTITY } };

    expect(PipelineUtil.contentHashOf(reordered)).toBe(baseHash);
    expect(PipelineUtil.contentHashOf({ ...ENTITIES_PIPELINE, entities: { 'example': { ...EXAMPLE_APP_ENTITY, concurrency: 1 }, 'shared': SHARED_PACKAGE_ENTITY } }))
      .not.toBe(baseHash);
    expect(PipelineUtil.contentHashOf({ ...ENTITIES_PIPELINE, entities: { 'example': EXAMPLE_APP_ENTITY } })).not.toBe(baseHash);
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

describe('the pipeline of an entity', () => {
  test('is the entity\'s own steps, gates, phases, review, constitution and reach, with the forge\'s merge train, approvals and billing', () => {
    expect(PipelineUtil.pipelineOfEntity(ENTITIES_PIPELINE, 'example')).toEqual({
      version:      3,
      prepare:      EXAMPLE_APP_ENTITY.prepare,
      gates:        EXAMPLE_APP_ENTITY.gates,
      phases:       EXAMPLE_APP_ENTITY.phases,
      review:       { name: 'review' },
      airlock:      { reReview: { thresholdLines: 300 } },
      constitution: { path: '/apps/example/CONSTITUTION.md' },
      agents:       { productOwner: { model: 'opus', effort: 'high' }, builder: { model: 'opus', effort: 'high' } },
      approvals:    { merge: true },
      billing:      { mode: 'subscription' },
      reach:        ['/bun.lock'],
    });
  });

  test('takes the forge-level roles from the forge and never a top-level builder, and leaves out what neither sets', () => {
    expect(PipelineUtil.pipelineOfEntity(ENTITIES_PIPELINE, 'shared')).toEqual({
      version:   3,
      prepare:   [],
      gates:     [],
      phases:    { build: [], review: [], merge: [] },
      review:    { name: 'review' },
      airlock:   { reReview: { thresholdLines: 300 } },
      agents:    { productOwner: { model: 'opus', effort: 'high' } },
      approvals: { merge: true },
      billing:   { mode: 'subscription' },
    });
    const {
      agents: _agents, airlock: _airlock, approvals: _approvals, billing: _billing, ...bare
    } = ENTITIES_PIPELINE;
    expect(Object.keys(PipelineUtil.pipelineOfEntity(bare, 'shared') ?? {})).toEqual(['version', 'prepare', 'gates', 'phases', 'review']);
  });

  test('has the phase hashes of the same single pipeline, so an entity\'s gate greens follow its own gates alone', () => {
    const entityPipeline = PipelineUtil.pipelineOfEntity(ENTITIES_PIPELINE, 'example');
    const singlePipeline: Pipeline = {
      version: 3, prepare: EXAMPLE_APP_ENTITY.prepare, gates: EXAMPLE_APP_ENTITY.gates, phases: EXAMPLE_APP_ENTITY.phases
    };

    for (const phase of GATE_PHASES) expect(entityPipeline === null ? null : PipelineUtil.phaseHashOf(entityPipeline, phase)).toBe(PipelineUtil.phaseHashOf(singlePipeline, phase));
  });

  test('is none for a key with no entity, an inherited name included, and for a pipeline without entities', () => {
    expect(PipelineUtil.pipelineOfEntity(ENTITIES_PIPELINE, 'unknown')).toBeNull();
    expect(PipelineUtil.pipelineOfEntity(ENTITIES_PIPELINE, 'toString')).toBeNull();
    expect(PipelineUtil.pipelineOfEntity(FULL_PIPELINE, 'example')).toBeNull();
  });
});

describe('the gate run stamp of entities', () => {
  test('carries the forge\'s own phase hash and each named entity\'s phase hash, leaving out a key with no entity', () => {
    const singlePipeline: Pipeline = {
      version: 3, prepare: EXAMPLE_APP_ENTITY.prepare, gates: EXAMPLE_APP_ENTITY.gates, phases: EXAMPLE_APP_ENTITY.phases
    };

    expect(PipelineUtil.entitiesGateRunStampOf(ENTITIES_PIPELINE, 'merge', ['example', 'unknown'])).toEqual({
      ...PipelineUtil.gateRunStampOf(ENTITIES_PIPELINE, 'merge'),
      entityPhaseHashes: { example: PipelineUtil.phaseHashOf(singlePipeline, 'merge') },
    });
    expect(PipelineUtil.entityPhaseHashOf(ENTITIES_PIPELINE, 'example', 'build')).toBe(PipelineUtil.phaseHashOf(singlePipeline, 'build'));
    expect(PipelineUtil.entityPhaseHashOf(ENTITIES_PIPELINE, 'unknown', 'build')).toBeNull();
  });

  test('carries an empty record when no entity was gated', () => {
    expect(PipelineUtil.entitiesGateRunStampOf(ENTITIES_PIPELINE, 'review', []).entityPhaseHashes).toEqual({});
  });
});
