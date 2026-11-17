/**
 * The entities step's refusals. What matters: they are the shared validator's verdicts, the same check the stored pipeline gets, so
 * entities it takes show none; each verdict is the sentence the Overseer's API carries for the `pipeline-draft-invalid` refusal of that
 * edit, shown on the entity whose row shows it, a reach inside another entity's home among them (E9); and where one gesture resolves it,
 * that gesture's edits leave entities the validator takes.
 */
import { describe, expect, test } from 'bun:test';

import { OperationRefusalWordingUtil }                 from '../../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import type { EntityKey, PipelineEntity }              from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { EntityValidationUtil }                        from '../../../../src/lib/tracker-model/utils/EntityValidationUtil.ts';
import { OperationRefusal }                            from '../../../../src/shared/OperationRefusal.ts';
import { ENTITIES_STEP_ENTITIES, entitiesStepDraftOf } from '../../../testing/EntitiesStepFixture.ts';
import { EntitiesStepModel }                           from './EntitiesStepModel.ts';
import { EntityRefusalsModel, type EntityRefusalView } from './EntityRefusalsModel.ts';

function entitiesWith(changes: Readonly<Record<EntityKey, Partial<PipelineEntity>>>): Record<EntityKey, PipelineEntity> {
  const entities = structuredClone(ENTITIES_STEP_ENTITIES) as Record<EntityKey, PipelineEntity>;
  for (const [key, change] of Object.entries(changes)) entities[key] = { ...entities[key], ...change } as PipelineEntity;
  return entities;
}

const SETUP_ID = 'S1';

function apiSentenceOf(reason: string): string {
  return `The edit would leave pipeline setup ${SETUP_ID}'s draft a pipeline that cannot be stored: ${reason}. Nothing was written.`;
}

function refusalsOf(entities: Readonly<Record<EntityKey, PipelineEntity>>): EntityRefusalView[] {
  return EntityRefusalsModel.refusalsOf(SETUP_ID, entities);
}

function resolvedByItsFix(entities: Record<EntityKey, PipelineEntity>): boolean {
  const fix = refusalsOf(entities)[0]?.fix ?? null;
  if (fix === null) throw new Error('the refusal has a fix');
  return refusalsOf(EntitiesStepModel.entitiesAfterEdits(entitiesStepDraftOf(entities), fix.edits)).length === 0;
}

describe('the refusals', () => {
  test('entities the validator takes show no refusal', () => {
    expect(refusalsOf(ENTITIES_STEP_ENTITIES)).toEqual([]);
  });

  test('a whitelist that names no entity is worded on the app, and taking it off resolves it', () => {
    const entities = entitiesWith({ admin: { whitelist: ['shared'] } });
    const [refusal] = refusalsOf(entities);
    expect(refusal?.text).toBe(apiSentenceOf('entities.admin.whitelist names "shared", which is not an entity'));
    expect(refusal?.entityKey).toBe('admin');
    expect(refusal?.fix?.label).toBe('Take shared off');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a whitelisted package without review is resolved by giving it a review step', () => {
    const entities = entitiesWith({ admin: { whitelist: ['config'] } });
    expect(refusalsOf(entities)[0]?.text).toBe(apiSentenceOf('entities.admin.whitelist names "config", a package without a review'));
    expect(refusalsOf(entities)[0]?.fix?.label).toBe('Give config a review step');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a whitelisted app is no package, and taking it off resolves it', () => {
    const entities = entitiesWith({ web: { whitelist: ['admin'] } });
    expect(refusalsOf(entities)[0]?.text).toBe(apiSentenceOf('entities.web.whitelist names "admin", which is not a package'));
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('two entities with one home folder are worded with the folder, and the last one gives it up when it keeps another', () => {
    const entities = entitiesWith({ docs: { home: ['/docs', '/packages/ui'] } });
    const [refusal] = refusalsOf(entities);
    expect(refusal?.text).toBe(apiSentenceOf('the entities ui, docs share the home "/packages/ui"'));
    expect(refusal?.fix?.label).toBe('Remove packages/ui from docs');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a circle of dependencies names its entities and has no one-gesture fix', () => {
    const entities = entitiesWith({ config: { dependsOn: ['ui'] } });
    const [refusal] = refusalsOf(entities);
    expect(refusal?.text).toBe(apiSentenceOf('the entities ui -> config -> ui depend on each other in a circle'));
    expect(refusal?.fix).toBeNull();
  });

  test('an unknown dependency is removed from what the entity depends on', () => {
    const entities = entitiesWith({ docs: { dependsOn: ['theme'] } });
    expect(refusalsOf(entities)[0]?.text).toBe(apiSentenceOf('entities.docs.dependsOn names "theme", which is not an entity'));
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('E9: a reach path inside another entity\'s home is worded on the entity that names it, and taking it off resolves it', () => {
    const entities = entitiesWith({ admin: { reach: ['/bun.lock', '/packages/ui/generated/'] } });
    const [refusal] = refusalsOf(entities);
    expect(refusal?.text)
      .toBe(apiSentenceOf('entities.admin.reach names "/packages/ui/generated/", which reaches into the home of the entity ui; reach names only paths the root entity owns'));
    expect(refusal?.entityKey).toBe('admin');
    expect(refusal?.fix?.label).toBe('Take /packages/ui/generated/ off admin\'s reach');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('each sentence is the API sentence of the pipeline-draft-invalid refusal the Overseer would send for that verdict', () => {
    const entities = entitiesWith({ admin: { whitelist: ['shared', 'config'], dependsOn: ['theme'] }, config: { dependsOn: ['ui'] } });
    const sentences = EntityValidationUtil.refusalsOf(entities).map((refusal) => {
      const reason = OperationRefusalWordingUtil.entityRefusalReasonOf(refusal);
      return OperationRefusalWordingUtil.apiMessageOf(new OperationRefusal('refused', { kind: 'pipeline-draft-invalid', setupId: SETUP_ID, reason }));
    });
    expect(sentences.length).toBeGreaterThan(2);
    expect(refusalsOf(entities).map((refusal) => refusal.text)).toEqual(sentences);
  });
});
