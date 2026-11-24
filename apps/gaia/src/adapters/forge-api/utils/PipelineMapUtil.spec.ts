/**
 * The pipeline mapper against its own contract, on parts the recorded board does not hold. What matters: every typed draft edit a refusal's
 * fix may carry keeps its target and values, an edit within an entity included; a pipeline's absent parts stay absent rather than taking a
 * forge default; billing by an API key keeps its budget; every history entry keeps its kind and fields; the recorded pipeline maps; and a
 * pipeline in the spec-then-plan route keeps its route and the documents its builder reads, which a pipeline without them never gains.
 */
import { describe, expect, test }         from 'bun:test';
import type { PipelineDraftEditDocument } from 'forge-contracts/BoardPipelineDocuments';
import type { ForgeBoardDocument }        from 'forge-contracts/ForgeBoardDocument';

import type { BoardDraftEdit }               from '../../../shared/@types/board/BoardPipeline.ts';
import { recordedBoardDocumentOf }           from '../testing/BoardDocuments.ts';
import { recordedSpecThenPlanBoardDocument } from '../testing/TicketDocumentsRecordings.ts';
import { PipelineMapUtil }                   from './PipelineMapUtil.ts';

async function recordedDocument(): Promise<ForgeBoardDocument> {
  return structuredClone(await recordedBoardDocumentOf('board-at-work')) as ForgeBoardDocument;
}

describe('draftEditOf', () => {
  const EDITS: readonly { readonly edit: PipelineDraftEditDocument; readonly expected: BoardDraftEdit }[] = [
    {
      edit:     { target: 'gate', name: 'unit', value: { name: 'unit', run: 'bun test', in: 'apps/web' } },
      expected: {
        target: 'gate',
        name:   'unit',
        value:  {
          name: 'unit', run: 'bun test', fix: null, runsIn: 'apps/web', network: [], writes: []
        }
      },
    },
    { edit: { target: 'gate', name: 'unit', value: null }, expected: { target: 'gate', name: 'unit', value: null } },
    { edit: { target: 'phase-order', phase: 'review', names: ['unit'] }, expected: { target: 'phase-order', phase: 'review', names: ['unit'] } },
    {
      edit:     { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install' } },
      expected: { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install', runsIn: null } },
    },
    { edit: { target: 'prepare-order', names: ['install'] }, expected: { target: 'prepare-order', names: ['install'] } },
    {
      edit:     { target: 'review', value: { name: 'review', reReview: { thresholdLines: 100 } } },
      expected: { target: 'review', value: { name: 'review', reReview: { thresholdLines: 100 } } },
    },
    { edit: { target: 'constitution', value: { path: 'CONSTITUTION.md' } }, expected: { target: 'constitution', constitutionPath: 'CONSTITUTION.md' } },
    {
      edit:     { target: 'role', role: 'assistant', value: { model: 'opus' } },
      expected: { target: 'role', role: 'assistant', value: { model: 'opus', effort: null, instructions: null } },
    },
    { edit: { target: 'airlock', value: {} }, expected: { target: 'airlock', value: { reReview: null } } },
    { edit: { target: 'approval', approval: 'merge', value: true }, expected: { target: 'approval', approval: 'merge', value: true } },
    { edit: { target: 'entity', entityKey: 'web', value: null }, expected: { target: 'entity', entityKey: 'web', value: null } },
    {
      edit:     { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'builder', value: { instructions: [{ kind: 'file', path: 'BUILD.md' }] } } },
      expected: {
        target:    'within-entity',
        entityKey: 'web',
        edit:      { target: 'role', role: 'builder', value: { model: null, effort: null, instructions: [{ kind: 'file', path: 'BUILD.md' }] } },
      },
    },
    {
      edit:     { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: ['api'] } },
      expected: { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: ['api'] } },
    },
    {
      edit:     { target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: 2 } },
      expected: { target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: 2 } },
    },
    {
      edit:     { target: 'within-entity', entityKey: 'web', edit: { target: 'prepare-order', names: [] } },
      expected: { target: 'within-entity', entityKey: 'web', edit: { target: 'prepare-order', names: [] } },
    },
  ];

  for (const { edit, expected } of EDITS) {
    test(`keeps a ${edit.target === 'within-entity' ? `within-entity ${edit.edit.target}` : edit.target} edit`, () => {
      expect(PipelineMapUtil.draftEditOf(edit)).toEqual(expected);
    });
  }
});

describe('pipelineFactsOf', () => {
  test('keeps a pipeline\'s absent parts absent, and an API billing\'s budget', async () => {
    const document = await recordedDocument();
    const pipeline = {
      version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, billing: { mode: 'api', maxBudgetUsd: 2.5 }
    } as const;
    const applied = {
      readingVerdict: 'readable', pipeline, contentHash: 'example-hash', fileText: '{}', application: null, entityPipelines: {}
    } as const;
    expect(PipelineMapUtil.pipelineFactsOf({ ...document, pipeline: applied }).applied).toEqual({
      readingVerdict: 'readable',
      pipeline:       {
        version:          5,
        prepare:          [],
        gates:            [],
        phases:           { build: [], review: [], merge: [] },
        review:           null,
        airlock:          null,
        constitutionPath: null,
        agents:           {},
        approvals:        {},
        billing:          { mode: 'api', maximumBudgetDollars: 2.5 },
        reach:            [],
        entities:         null,
      },
      contentHash:     'example-hash',
      fileText:        '{}',
      application:     null,
      entityPipelines: {},
    });
  });

  test('keeps a stored pipeline the forge cannot read, with its reason', async () => {
    const document = await recordedDocument();
    const applied = { readingVerdict: 'malformed', reason: 'example reason', fileText: 'example' } as const;
    expect(PipelineMapUtil.pipelineFactsOf({ ...document, pipeline: applied }).applied).toEqual(applied);
  });

  test('keeps every history entry\'s kind and fields', async () => {
    const document = await recordedDocument();
    const at = '2026-11-21T01:00:00+01:00';
    const history = [
      { kind: 'pipeline-gate-added', at, fields: { name: 'unit', run: 'bun test' } },
      { kind: 'pipeline-gate-removed', at, fields: { name: 'unit' } },
      { kind: 'pipeline-gates-none', at },
      { kind: 'pipeline-gates-ordered', at, fields: { phase: 'build', names: ['unit'] } },
      { kind: 'pipeline-prepare-step-set', at, fields: { name: 'install', run: 'bun install' } },
      { kind: 'pipeline-approval-set', at, fields: { approval: 'merge', state: 'on' } },
      { kind: 'pipeline-assistant-set', at, fields: { state: 'off' } },
      {
        kind: 'pipeline-setup-opened', at, setupId: 'S1', fields: { mode: 'setup', replacesUnreadablePipeline: false }
      },
      {
        kind: 'pipeline-draft-discarded', at, setupId: 'S1', fields: { revision: 3 }
      },
      { kind: 'pipeline-setup-discarded', at, setupId: 'S1' },
      { kind: 'hephaestus-set', at, fields: { state: 'paused' } },
    ] as const;
    expect(PipelineMapUtil.pipelineFactsOf({ ...document, pipelineHistory: history }).history).toEqual([
      {
        kind: 'pipeline-gate-added', at, name: 'unit', run: 'bun test'
      },
      { kind: 'pipeline-gate-removed', at, name: 'unit' },
      { kind: 'pipeline-gates-none', at },
      {
        kind: 'pipeline-gates-ordered', at, phase: 'build', names: ['unit']
      },
      {
        kind: 'pipeline-prepare-step-set', at, name: 'install', run: 'bun install'
      },
      {
        kind: 'pipeline-approval-set', at, approval: 'merge', state: 'on'
      },
      { kind: 'pipeline-assistant-set', at, state: 'off' },
      {
        kind: 'pipeline-setup-opened', at, setupId: 'S1', mode: 'setup', replacesUnreadablePipeline: false
      },
      {
        kind: 'pipeline-draft-discarded', at, setupId: 'S1', revision: 3
      },
      { kind: 'pipeline-setup-discarded', at, setupId: 'S1' },
      { kind: 'hephaestus-set', at, state: 'paused' },
    ]);
  });

  test('maps the recorded pipeline facts: the flow, the profile run and the pipeline agent\'s defaults', async () => {
    const facts = PipelineMapUtil.pipelineFactsOf(await recordedDocument());
    expect(facts.flow?.nodes[0]).toMatchObject({
      nodeId: 'ticket-creation', nodeKind: 'ticket-creation', role: 'productOwner', settings: { model: 'opus', effort: 'medium' }
    });
    expect(facts.flow?.edges[0]).not.toHaveProperty('edgeId');
    expect(facts.profileRuns).toEqual([{
      profileRunId: 'P1', entity: 'web', gateName: 'unit', phase: 'build', state: 'passed', elapsedMilliseconds: expect.any(Number), cacheReport: null
    }]);
    expect(facts.agentDefaults).toEqual({ model: 'opus', effort: 'high' });
    expect(facts.entityAssignment).toMatchObject({ jobId: 'J2', jobState: 'running' });
  });
});

describe('a pipeline in the spec-then-plan route', () => {
  test('keeps its route and the documents its builder reads, and a pipeline without them gains neither key', async () => {
    const specThenPlan = PipelineMapUtil.pipelineFactsOf(await recordedSpecThenPlanBoardDocument() as ForgeBoardDocument);
    if (specThenPlan.applied.readingVerdict !== 'readable') throw new Error('The spec-then-plan pipeline does not read.');
    expect(specThenPlan.applied.pipeline.ticketWriting).toBe('spec-then-plan');
    expect(specThenPlan.applied.pipeline.agents.builder?.documents).toEqual({ plan: 'if-person-approved' });
    const oneTicket = PipelineMapUtil.pipelineFactsOf(await recordedDocument());
    if (oneTicket.applied.readingVerdict !== 'readable') throw new Error('The recorded pipeline does not read.');
    expect(Object.hasOwn(oneTicket.applied.pipeline, 'ticketWriting')).toBe(false);
    expect(Object.values(oneTicket.applied.pipeline.agents).some((settings) => Object.hasOwn(settings, 'documents'))).toBe(false);
  });
});
