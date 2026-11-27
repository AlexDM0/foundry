/**
 * The facts of one entity's level and the scope of its edits: an entity's screen draws only the entity's own facts, its edits are scoped
 * to it unless the forge sets the field for every entity, and an entity the facts do not hold draws an empty flow.
 */
import { describe, expect, test }                             from 'bun:test';
import type { BoardDraftEditDocument }                        from '../../../../@types/board/BoardPipelineDocuments.ts';
import { exampleGate, examplePipeline, pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import type { PipelineViewFacts }                             from '../PipelineViewModel.ts';
import { EntityLevelFactsModel }                              from './EntityLevelFactsModel.ts';

function monorepoFacts(): PipelineViewFacts {
  const facts = pipelineBoardStateOf('mono-design');
  const { flow } = facts.pipeline;
  if (flow === null) throw new Error('the fixture mono-design holds a flow');
  return {
    ...facts,
    pipeline: {
      ...facts.pipeline,
      flow: {
        ...flow,
        changeList: [
          { field: 'entity:web/gate:typecheck', changeKind: 'changed', editId: 'E1' },
          { field: 'entity:web/whitelist', changeKind: 'changed', editId: 'E2' },
          { field: 'entity:web', changeKind: 'changed', editId: 'E3' },
          { field: 'entity:design-system/gate:typecheck', changeKind: 'changed', editId: 'E4' },
          { field: 'approval:merge', changeKind: 'changed', editId: 'E5' },
        ],
      },
      profileRuns: [
        {
          profileRunId: 'P1', entity: 'web', gateName: 'typecheck', phase: 'build', state: 'passed', elapsedMilliseconds: 1, cacheReport: null,
        },
        {
          profileRunId: 'P2', entity: 'design-system', gateName: 'typecheck', phase: 'build', state: 'passed', elapsedMilliseconds: 1, cacheReport: null,
        },
      ],
      gateCacheMarks: [{
        entity: 'design-system', gateName: 'typecheck', phase: 'build', cacheReport: 'hit'
      }],
    },
  };
}

describe('the facts at an entity', () => {
  test('draw the entity\'s flow, single pipeline, questions, profile runs and cache marks', () => {
    const facts = EntityLevelFactsModel.factsAtEntityOf(monorepoFacts(), 'web');
    expect(facts.pipeline.flow?.gateRows.build.map((row) => row.name)).toEqual(['install', 'typecheck', 'unit-tests']);
    expect(facts.pipeline.flow?.entityFlows).toBeNull();
    expect(facts.pipeline.setup?.record.draft?.gates.map((gate) => gate.name)).toEqual(['typecheck', 'unit-tests']);
    expect(facts.pipeline.setup?.record.draft?.entities).toBeNull();
    expect(facts.pipeline.setup?.record.questions.map((question) => question.questionId)).toEqual(['Q4']);
    expect(facts.pipeline.setup?.record.agentJobId).toBe('J5');
    expect(facts.pipeline.setup?.openQuestionCount).toBe(1);
    expect(facts.pipeline.profileRuns.map((run) => run.profileRunId)).toEqual(['P1']);
    expect(facts.pipeline.gateCacheMarks).toEqual([]);
  });

  test('take the entity\'s single pipeline as the forge serves it, the draft\'s and the applied one alike, never one joined here', () => {
    const base = monorepoFacts();
    const { setup } = base.pipeline;
    if (setup === null) throw new Error('the fixture mono-design holds a setup');
    const servedWeb = examplePipeline({ gates: [exampleGate('served-gate', 'bun run served')], phases: { build: ['served-gate'], review: [], merge: [] } });
    const served = {
      ...base,
      pipeline: {
        ...base.pipeline,
        setup:   { ...setup, draftEntities: { web: { effectivePipeline: servedWeb, dependentEntityKeys: [] } } },
        applied: pipelineBoardStateOf('mono-live').pipeline.applied,
      },
    };
    const facts = EntityLevelFactsModel.factsAtEntityOf(served, 'web');
    expect(facts.pipeline.setup?.record.draft?.gates.map((gate) => gate.name)).toEqual(['served-gate']);
    const { applied } = facts.pipeline;
    const servedApplied = served.pipeline.applied;
    if (applied.readingVerdict !== 'readable' || servedApplied.readingVerdict !== 'readable') throw new Error('the fixture mono-live holds a readable pipeline');
    expect(applied.pipeline).toEqual(servedApplied.entityPipelines['web'] ?? examplePipeline());
  });

  test('read the entity\'s changes as single-pipeline fields, leaving its definition and entity-only fields off its flow', () => {
    const facts = EntityLevelFactsModel.factsAtEntityOf(monorepoFacts(), 'web');
    expect(facts.pipeline.flow?.changeList).toEqual([{ field: 'gate:typecheck', changeKind: 'changed', editId: 'E1' }]);
  });

  test('draw an empty flow for an entity the facts do not hold, never the forge\'s', () => {
    const facts = EntityLevelFactsModel.factsAtEntityOf(monorepoFacts(), 'admin');
    expect(facts.pipeline.flow?.nodes).toEqual([]);
    expect(facts.pipeline.flow?.gateRows).toEqual({ build: [], review: [], merge: [] });
    expect(facts.pipeline.setup?.record.draft).toBeNull();
    expect(facts.pipeline.setup?.record.questions).toEqual([]);
  });
});

describe('an edit at an entity', () => {
  test('goes scoped to the entity', () => {
    const scoped = EntityLevelFactsModel.editsScopedTo([
      { target: 'gate', name: 'lint', value: null },
      { target: 'phase-order', phase: 'build', names: [] },
      { target: 'role', role: 'builder', value: null },
      { target: 'review', value: null },
    ], 'web');
    expect(scoped).toEqual([
      { target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'lint', value: null } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'phase-order', phase: 'build', names: [] } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'builder', value: null } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'review', value: null } },
    ]);
  });

  test('keeps an edit the forge sets for every entity, and one already scoped, as it is', () => {
    const edits: BoardDraftEditDocument[] = [
      { target: 'approval', approval: 'merge', value: true },
      { target: 'airlock', value: null },
      { target: 'role', role: 'productOwner', value: null },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'gate', name: 'lint', value: null } },
    ];
    expect(EntityLevelFactsModel.editsScopedTo(edits, 'web')).toEqual(edits);
  });

  test('keeps a field the forge sets for every entity, and one already scoped, as it is', () => {
    const fields: string[] = ['approval:merge', 'airlock', 'role:productOwner', 'entity:admin/gate:lint'];
    expect(fields.map((field) => EntityLevelFactsModel.scopedFieldOf(field, 'web'))).toEqual(fields);
  });

  test('is worded as the field a single pipeline names', () => {
    expect(EntityLevelFactsModel.fieldAsASinglePipelineNamesIt('entity:web/gate:lint')).toBe('gate:lint');
    expect(EntityLevelFactsModel.fieldAsASinglePipelineNamesIt('entity:web/whitelist')).toBe('entity:web/whitelist');
    expect(EntityLevelFactsModel.fieldAsASinglePipelineNamesIt('approval:merge')).toBe('approval:merge');
  });
});
