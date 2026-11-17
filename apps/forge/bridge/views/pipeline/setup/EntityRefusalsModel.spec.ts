/**
 * The entities step's refusals. What matters: they are the shared validator's verdicts, the same check the stored pipeline gets, so
 * entities it takes show none; each verdict is worded in User's words on the entity whose row shows it; and where one gesture resolves it,
 * that gesture's edits leave entities the validator takes.
 */
import { describe, expect, test } from 'bun:test';

import type { EntityKey, PipelineEntity }              from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { ENTITIES_STEP_ENTITIES, entitiesStepDraftOf } from '../../../testing/EntitiesStepFixture.ts';
import { EntitiesStepModel }                           from './EntitiesStepModel.ts';
import { EntityRefusalsModel }                         from './EntityRefusalsModel.ts';

function entitiesWith(changes: Readonly<Record<EntityKey, Partial<PipelineEntity>>>): Record<EntityKey, PipelineEntity> {
  const entities = structuredClone(ENTITIES_STEP_ENTITIES) as Record<EntityKey, PipelineEntity>;
  for (const [key, change] of Object.entries(changes)) entities[key] = { ...entities[key], ...change } as PipelineEntity;
  return entities;
}

function resolvedByItsFix(entities: Record<EntityKey, PipelineEntity>): boolean {
  const fix = EntityRefusalsModel.refusalsOf(entities)[0]?.fix ?? null;
  if (fix === null) throw new Error('the refusal has a fix');
  return EntityRefusalsModel.refusalsOf(EntitiesStepModel.entitiesAfterEdits(entitiesStepDraftOf(entities), fix.edits)).length === 0;
}

describe('the refusals', () => {
  test('entities the validator takes show no refusal', () => {
    expect(EntityRefusalsModel.refusalsOf(ENTITIES_STEP_ENTITIES)).toEqual([]);
  });

  test('a whitelist that names no entity is worded on the app, and taking it off resolves it', () => {
    const entities = entitiesWith({ admin: { whitelist: ['shared'] } });
    const [refusal] = EntityRefusalsModel.refusalsOf(entities);
    expect(refusal?.text).toBe('admin\'s whitelist names shared, which is not an entity. Take it off, or add shared as a package.');
    expect(refusal?.entityKey).toBe('admin');
    expect(refusal?.fix?.label).toBe('Take shared off');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a whitelisted package without review is resolved by giving it a review step', () => {
    const entities = entitiesWith({ admin: { whitelist: ['config'] } });
    expect(EntityRefusalsModel.refusalsOf(entities)[0]?.text)
      .toBe('admin\'s whitelist names config, which has no review step. A package that tickets cross into needs one.');
    expect(EntityRefusalsModel.refusalsOf(entities)[0]?.fix?.label).toBe('Give config a review step');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a whitelisted app is no package, and taking it off resolves it', () => {
    const entities = entitiesWith({ web: { whitelist: ['admin'] } });
    expect(EntityRefusalsModel.refusalsOf(entities)[0]?.text).toBe('web\'s whitelist names admin, which is not a package. A ticket crosses only into a package.');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('two entities with one home folder are worded with the folder, and the last one gives it up when it keeps another', () => {
    const entities = entitiesWith({ docs: { home: ['/docs', '/packages/ui'] } });
    const [refusal] = EntityRefusalsModel.refusalsOf(entities);
    expect(refusal?.text).toBe('ui and docs have the same home folder packages/ui. A folder belongs to one entity.');
    expect(refusal?.fix?.label).toBe('Remove packages/ui from docs');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a circle of dependencies names its entities and has no one-gesture fix', () => {
    const entities = entitiesWith({ config: { dependsOn: ['ui'] } });
    const [refusal] = EntityRefusalsModel.refusalsOf(entities);
    expect(refusal?.text).toBe('ui and config depend on each other in a circle. A change could then never finish its gates.');
    expect(refusal?.fix).toBeNull();
  });

  test('an unknown dependency is removed from what the entity depends on', () => {
    const entities = entitiesWith({ docs: { dependsOn: ['theme'] } });
    expect(EntityRefusalsModel.refusalsOf(entities)[0]?.text).toBe('docs depends on theme, which is not an entity.');
    expect(resolvedByItsFix(entities)).toBe(true);
  });

  test('a list of keys reads as a sentence', () => {
    expect(EntityRefusalsModel.listTextOf(['web'])).toBe('web');
    expect(EntityRefusalsModel.listTextOf(['web', 'admin', 'docs'])).toBe('web, admin and docs');
  });
});
