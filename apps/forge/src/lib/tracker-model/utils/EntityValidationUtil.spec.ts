/**
 * The one check of a pipeline's entities that the pipeline file and the Bridge share. What matters: a valid layout has no refusal, a home
 * inside another home among it; each refusal comes with the keys it names: two entities with the same home (a trailing slash ignored), an
 * unknown key in a whitelist or in `dependsOn`, a whitelisted entity that is not a package (the root entity included) or has no review,
 * and a circle in `dependsOn`, a self-dependency and a root entity that names a dependency included.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineEntity }   from '../@types/Pipeline.ts';
import type { PipelineEntities } from './EntityOwnershipUtil.ts';
import { EntityValidationUtil }  from './EntityValidationUtil.ts';

function entityOf(kind: PipelineEntity['kind'], home: string[], fields: Partial<PipelineEntity> = {}): PipelineEntity {
  return {
    kind, home, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...fields
  };
}

const VALID_ENTITIES: PipelineEntities = {
  'shop':          entityOf('app', ['/apps/shop'], { whitelist: ['design-system'], dependsOn: ['design-system', 'root'] }),
  'design-system': entityOf('package', ['/packages/design-system'], { review: { name: 'Review' } }),
  'tokens':        entityOf('package', ['/packages/design-system/tokens']),
};

test('a valid layout has no refusal, a home inside another and a named root dependency among it', () => {
  expect(EntityValidationUtil.refusalsOf(VALID_ENTITIES)).toEqual([]);
  expect(EntityValidationUtil.refusalsOf({})).toEqual([]);
});

describe('a refusal', () => {
  test('names two entities with the same home, a trailing slash ignored', () => {
    const entities: PipelineEntities = { ...VALID_ENTITIES, 'shop-legacy': entityOf('app', ['/apps/legacy', '/apps/shop/']) };
    expect(EntityValidationUtil.refusalsOf(entities)).toEqual([{ reason: 'equal-homes', home: '/apps/shop', entityKeys: ['shop', 'shop-legacy'] }]);
  });

  test('names an unknown key in a whitelist', () => {
    const entities: PipelineEntities = { ...VALID_ENTITIES, 'admin': entityOf('app', ['/apps/admin'], { whitelist: ['charts'] }) };
    expect(EntityValidationUtil.refusalsOf(entities)).toEqual([{ reason: 'unknown-whitelist-key', entityKey: 'admin', unknownKey: 'charts' }]);
  });

  test('names an unknown key in dependsOn', () => {
    const entities: PipelineEntities = { ...VALID_ENTITIES, 'admin': entityOf('app', ['/apps/admin'], { dependsOn: ['charts'] }) };
    expect(EntityValidationUtil.refusalsOf(entities)).toEqual([{ reason: 'unknown-dependency-key', entityKey: 'admin', unknownKey: 'charts' }]);
  });

  test('names a whitelisted entity that is not a package, the root entity included', () => {
    const entities: PipelineEntities = { ...VALID_ENTITIES, 'admin': entityOf('app', ['/apps/admin'], { whitelist: ['shop', 'root'] }) };
    expect(EntityValidationUtil.refusalsOf(entities)).toEqual([
      { reason: 'whitelisted-entity-not-package', entityKey: 'admin', whitelistedKey: 'shop' },
      { reason: 'whitelisted-entity-not-package', entityKey: 'admin', whitelistedKey: 'root' },
    ]);
  });

  test('names a whitelisted package without review', () => {
    const entities: PipelineEntities = { ...VALID_ENTITIES, 'admin': entityOf('app', ['/apps/admin'], { whitelist: ['tokens'] }) };
    expect(EntityValidationUtil.refusalsOf(entities))
      .toEqual([{ reason: 'whitelisted-package-without-review', entityKey: 'admin', whitelistedKey: 'tokens' }]);
  });

  test('names a circle in dependsOn by its keys from the first one met', () => {
    const entities: PipelineEntities = {
      'alpha': entityOf('package', ['/packages/alpha'], { dependsOn: ['beta'] }),
      'beta':  entityOf('package', ['/packages/beta'], { dependsOn: ['gamma'] }),
      'gamma': entityOf('package', ['/packages/gamma'], { dependsOn: ['alpha'] }),
    };
    expect(EntityValidationUtil.refusalsOf(entities)).toEqual([{ reason: 'dependency-circle', entityKeys: ['alpha', 'beta', 'gamma'] }]);
  });

  test('names an entity that depends on itself as a circle', () => {
    const entities: PipelineEntities = { 'alpha': entityOf('package', ['/packages/alpha'], { dependsOn: ['alpha'] }) };
    expect(EntityValidationUtil.circlesOf(entities)).toEqual([['alpha']]);
  });

  test('names a root entity that depends on another entity as a circle, since every entity depends on the root entity', () => {
    const entities: PipelineEntities = { ...VALID_ENTITIES, 'root': entityOf('root', [], { dependsOn: ['tokens'] }) };
    expect(EntityValidationUtil.circlesOf(entities)).toEqual([['root', 'tokens']]);
  });

  test('comes in a fixed order and all at once', () => {
    const entities: PipelineEntities = {
      'alpha': entityOf('app', ['/apps/alpha'], { dependsOn: ['alpha', 'missing'], whitelist: ['beta'] }),
      'beta':  entityOf('app', ['/apps/alpha']),
    };
    expect(EntityValidationUtil.refusalsOf(entities).map((refusal) => refusal.reason))
      .toEqual(['equal-homes', 'whitelisted-entity-not-package', 'unknown-dependency-key', 'dependency-circle']);
  });
});
