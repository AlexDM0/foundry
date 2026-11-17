/**
 * The facts of one entity's level and the scope of its edits. What matters: an entity's screen draws the entity's flow, single pipeline,
 * questions, profile runs and cache marks, never another entity's or the forge's; its changes read as single-pipeline fields and its own
 * definition or entity-only fields are not on its flow; an edit there is scoped to the entity, while a field the forge sets for every
 * entity, and one already scoped, stays as it is; an entity the facts do not hold draws an empty flow, not the forge's.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineDraftField } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { pipelineBoardStateOf }    from '../../../testing/PipelineFixture.ts';
import type { PipelineViewFacts }  from '../PipelineViewModel.ts';
import { EntityLevelFactsModel }   from './EntityLevelFactsModel.ts';

function monorepoFacts(): PipelineViewFacts {
  const facts = pipelineBoardStateOf('mono-design');
  const flow = facts.pipelineFlow ?? null;
  return {
    ...facts,
    ...(flow === null
      ? {}
      : {
        pipelineFlow: {
          ...flow,
          changeList: [
            { field: 'entity:web/gate:typecheck', changeKind: 'changed', editId: 'E1' },
            { field: 'entity:web/whitelist', changeKind: 'changed', editId: 'E2' },
            { field: 'entity:web', changeKind: 'changed', editId: 'E3' },
            { field: 'entity:design-system/gate:typecheck', changeKind: 'changed', editId: 'E4' },
            { field: 'approval:merge', changeKind: 'changed', editId: 'E5' },
          ],
        },
      }),
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
  };
}

describe('the facts at an entity', () => {
  test('draw the entity\'s flow, single pipeline, questions, profile runs and cache marks', () => {
    const facts = EntityLevelFactsModel.factsAtEntityOf(monorepoFacts(), 'web');
    expect(facts.pipelineFlow?.gateRows.build.map((row) => row.name)).toEqual(['install', 'typecheck', 'unit-tests']);
    expect(facts.pipelineFlow?.entityFlows).toBeUndefined();
    expect(facts.pipelineSetup?.record.draft?.gates.map((gate) => gate.name)).toEqual(['typecheck', 'unit-tests']);
    expect(facts.pipelineSetup?.record.draft?.entities).toBeUndefined();
    expect(facts.pipelineSetup?.record.questions.map((question) => question.questionId)).toEqual(['Q4']);
    expect(facts.pipelineSetup?.record.agentJobId).toBe('J5');
    expect(facts.pipelineSetup?.openQuestionCount).toBe(1);
    expect(facts.profileRuns?.map((run) => run.profileRunId)).toEqual(['P1']);
    expect(facts.gateCacheMarks).toEqual([]);
  });

  test('read the entity\'s changes as single-pipeline fields, leaving its definition and entity-only fields off its flow', () => {
    const facts = EntityLevelFactsModel.factsAtEntityOf(monorepoFacts(), 'web');
    expect(facts.pipelineFlow?.changeList).toEqual([{ field: 'gate:typecheck', changeKind: 'changed', editId: 'E1' }]);
  });

  test('draw an empty flow for an entity the facts do not hold, never the forge\'s', () => {
    const facts = EntityLevelFactsModel.factsAtEntityOf(monorepoFacts(), 'admin');
    expect(facts.pipelineFlow?.nodes).toEqual([]);
    expect(facts.pipelineFlow?.gateRows).toEqual({ build: [], review: [], merge: [] });
    expect(facts.pipelineSetup?.record.draft).toBeNull();
    expect(facts.pipelineSetup?.record.questions).toEqual([]);
  });
});

describe('an edit at an entity', () => {
  test('goes scoped to the entity', () => {
    expect(EntityLevelFactsModel.editsScopedTo([
      { field: 'gate:lint', value: null },
      { field: 'phase-order:build', value: [] },
      { field: 'role:builder', value: {} },
      { field: 'review', value: null },
    ], 'web').map((edit) => edit.field)).toEqual(['entity:web/gate:lint', 'entity:web/phase-order:build', 'entity:web/role:builder', 'entity:web/review']);
  });

  test('keeps a field the forge sets for every entity, and one already scoped, as it is', () => {
    const fields: PipelineDraftField[] = ['approval:merge', 'airlock', 'role:productOwner', 'entity:admin/gate:lint'];
    expect(fields.map((field) => EntityLevelFactsModel.scopedFieldOf(field, 'web'))).toEqual(fields);
  });

  test('is worded as the field a single pipeline names', () => {
    expect(EntityLevelFactsModel.fieldAsASinglePipelineNamesIt('entity:web/gate:lint')).toBe('gate:lint');
    expect(EntityLevelFactsModel.fieldAsASinglePipelineNamesIt('entity:web/whitelist')).toBe('entity:web/whitelist');
    expect(EntityLevelFactsModel.fieldAsASinglePipelineNamesIt('approval:merge')).toBe('approval:merge');
  });
});
