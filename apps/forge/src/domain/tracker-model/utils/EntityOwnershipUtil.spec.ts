/**
 * Ownership of a pipeline's entities: a path in no home is the root entity's, a deeper home wins, a move across a border changes both; a
 * change reaches every consumer and gates them; packages stage before their consumers; and a ticket's work stays within its entity, its
 * whitelisted packages and its `reach`.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineEntity }                                         from '../@types/Pipeline.ts';
import { EntityOwnershipUtil, type PipelineEntities, ROOT_ENTITY_KEY } from './EntityOwnershipUtil.ts';

function entityOf(kind: PipelineEntity['kind'], home: string[], dependsOn?: string[]): PipelineEntity {
  return {
    kind,
    home,
    prepare: [],
    gates:   [],
    phases:  { build: [], review: [], merge: [] },
    ...(dependsOn === undefined ? {} : { dependsOn }),
  };
}

const EXAMPLE_ENTITIES: PipelineEntities = {
  'shop':          entityOf('app', ['/apps/shop', '/packages/shop-private'], ['design-system']),
  'admin':         entityOf('app', ['/apps/admin'], ['tokens']),
  'design-system': entityOf('package', ['/packages/design-system'], ['tokens']),
  'tokens':        entityOf('package', ['/packages/design-system/tokens/']),
};

describe('the owner of a path', () => {
  test('is the root entity for a path in no home (E1)', () => {
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/bun.lock')).toBe(ROOT_ENTITY_KEY);
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/scripts/release.ts')).toBe('root');
    expect(EntityOwnershipUtil.ownerOf({}, '/apps/shop/index.ts')).toBe('root');
  });

  test('is the pipeline\'s own root entity by its key when it holds one', () => {
    const entities: PipelineEntities = { ...EXAMPLE_ENTITIES, 'repository': entityOf('root', []) };
    expect(EntityOwnershipUtil.ownerOf(entities, '/bun.lock')).toBe('repository');
    expect(EntityOwnershipUtil.rootEntityKeyOf(entities)).toBe('repository');
  });

  test('is the entity whose home holds it, any of its homes, the home folder itself included', () => {
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/apps/shop/src/Main.ts')).toBe('shop');
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/packages/shop-private/index.ts')).toBe('shop');
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/apps/admin')).toBe('admin');
  });

  test('is never an entity whose home only starts the same text', () => {
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/apps/shopping/index.ts')).toBe('root');
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/packages/design-system-extra/a.ts')).toBe('root');
  });

  test('is the entity of the deeper home when one home holds another (E2), in either order, a trailing slash ignored', () => {
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/packages/design-system/tokens/colour.ts')).toBe('tokens');
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/packages/design-system/tokens')).toBe('tokens');
    expect(EntityOwnershipUtil.ownerOf(EXAMPLE_ENTITIES, '/packages/design-system/Button.tsx')).toBe('design-system');
    const reversed: PipelineEntities = Object.fromEntries(Object.entries(EXAMPLE_ENTITIES).reverse());
    expect(EntityOwnershipUtil.ownerOf(reversed, '/packages/design-system/tokens/colour.ts')).toBe('tokens');
    expect(EntityOwnershipUtil.ownerOf(reversed, '/packages/design-system/Button.tsx')).toBe('design-system');
  });
});

describe('the paths by owner', () => {
  test('groups each path under its owner, owners in the order of their first path, paths in the order given', () => {
    const pathsByOwner = EntityOwnershipUtil.pathsByOwnerOf(EXAMPLE_ENTITIES, [
      '/apps/shop/a.ts', '/bun.lock', '/packages/design-system/tokens/b.ts', '/apps/shop/c.ts',
    ]);
    expect([...pathsByOwner]).toEqual([
      ['shop', ['/apps/shop/a.ts', '/apps/shop/c.ts']],
      ['root', ['/bun.lock']],
      ['tokens', ['/packages/design-system/tokens/b.ts']],
    ]);
  });

  test('names both entities for a file moved across a border (E5)', () => {
    const pathsByOwner = EntityOwnershipUtil.pathsByOwnerOf(EXAMPLE_ENTITIES, ['/apps/shop/Button.tsx', '/packages/design-system/Button.tsx']);
    expect([...pathsByOwner.keys()]).toEqual(['shop', 'design-system']);
  });

  test('is empty for no paths', () => {
    expect(EntityOwnershipUtil.pathsByOwnerOf(EXAMPLE_ENTITIES, []).size).toBe(0);
  });
});

describe('the dependents of a change', () => {
  test('are the entities that consume a changed one, directly or through another, in the pipeline\'s order', () => {
    expect(EntityOwnershipUtil.dependentsOf(EXAMPLE_ENTITIES, ['tokens'])).toEqual(['shop', 'admin', 'design-system']);
    expect(EntityOwnershipUtil.dependentsOf(EXAMPLE_ENTITIES, ['design-system'])).toEqual(['shop']);
  });

  test('leave out the changed entities themselves', () => {
    expect(EntityOwnershipUtil.dependentsOf(EXAMPLE_ENTITIES, ['tokens', 'design-system'])).toEqual(['shop', 'admin']);
  });

  test('are none for an entity nothing consumes', () => {
    expect(EntityOwnershipUtil.dependentsOf(EXAMPLE_ENTITIES, ['shop'])).toEqual([]);
  });

  test('are every entity for a change of the root entity, which every entity consumes without naming it', () => {
    expect(EntityOwnershipUtil.dependentsOf(EXAMPLE_ENTITIES, ['root'])).toEqual(['shop', 'admin', 'design-system', 'tokens']);
    expect(EntityOwnershipUtil.dependenciesOf(EXAMPLE_ENTITIES, 'tokens')).toEqual(['root']);
    expect(EntityOwnershipUtil.dependenciesOf(EXAMPLE_ENTITIES, 'root')).toEqual([]);
  });
});

describe('the entities a landing gates', () => {
  test('are the entities the changed paths are in and the entities that consume them, in the pipeline\'s order (E60)', () => {
    expect(EntityOwnershipUtil.gatedEntitiesOf(EXAMPLE_ENTITIES, ['/packages/design-system/Button.tsx'])).toEqual(['shop', 'design-system']);
    expect(EntityOwnershipUtil.gatedEntitiesOf(EXAMPLE_ENTITIES, ['/apps/admin/Main.ts', '/apps/shop/Main.ts'])).toEqual(['shop', 'admin']);
  });

  test('are only the changed entity when nothing consumes it', () => {
    expect(EntityOwnershipUtil.gatedEntitiesOf(EXAMPLE_ENTITIES, ['/packages/shop-private/index.ts'])).toEqual(['shop']);
  });

  test('are every entity for a root-owned path, such as a reach path at the root (E4)', () => {
    expect(EntityOwnershipUtil.gatedEntitiesOf(EXAMPLE_ENTITIES, ['/bun.lock'])).toEqual(['shop', 'admin', 'design-system', 'tokens']);
    const entities: PipelineEntities = { 'repository': entityOf('root', []), ...EXAMPLE_ENTITIES };
    expect(EntityOwnershipUtil.gatedEntitiesOf(entities, ['/package.json'])).toEqual(['repository', 'shop', 'admin', 'design-system', 'tokens']);
  });

  test('are both sides and their consumers for a file moved across a border (E5)', () => {
    expect(EntityOwnershipUtil.gatedEntitiesOf(EXAMPLE_ENTITIES, ['/apps/admin/Colour.ts', '/packages/design-system/tokens/Colour.ts']))
      .toEqual(['shop', 'admin', 'design-system', 'tokens']);
  });

  test('are none when no path changed', () => {
    expect(EntityOwnershipUtil.gatedEntitiesOf(EXAMPLE_ENTITIES, [])).toEqual([]);
  });
});

describe('the stage order of crossed packages', () => {
  test('runs a package before the packages that consume it, whatever order they are given in', () => {
    expect(EntityOwnershipUtil.stageOrderOf(EXAMPLE_ENTITIES, ['design-system', 'tokens'])).toEqual(['tokens', 'design-system']);
    expect(EntityOwnershipUtil.stageOrderOf(EXAMPLE_ENTITIES, ['tokens', 'design-system'])).toEqual(['tokens', 'design-system']);
  });

  test('orders through a consumer that is not crossed', () => {
    const entities: PipelineEntities = {
      'charts':  entityOf('package', ['/packages/charts'], ['widgets']),
      'widgets': entityOf('package', ['/packages/widgets'], ['icons']),
      'icons':   entityOf('package', ['/packages/icons']),
    };
    expect(EntityOwnershipUtil.stageOrderOf(entities, ['charts', 'icons'])).toEqual(['icons', 'charts']);
  });

  test('keeps the order given for packages that do not consume each other, and for a circle', () => {
    const entities: PipelineEntities = {
      'alpha': entityOf('package', ['/packages/alpha'], ['beta']),
      'beta':  entityOf('package', ['/packages/beta'], ['alpha']),
      'gamma': entityOf('package', ['/packages/gamma']),
    };
    expect(EntityOwnershipUtil.stageOrderOf(entities, ['gamma', 'beta', 'alpha'])).toEqual(['gamma', 'beta', 'alpha']);
    expect(EntityOwnershipUtil.stageOrderOf(entities, [])).toEqual([]);
  });
});

describe('the paths outside an entity', () => {
  const entities: PipelineEntities = {
    ...EXAMPLE_ENTITIES,
    'shop': { ...entityOf('app', ['/apps/shop', '/packages/shop-private']), whitelist: ['design-system'], reach: ['/bun.lock', '/config/shared/'] },
  };

  test('are the paths that neither the entity nor a package it whitelists owns, outside its reach (E85)', () => {
    expect(EntityOwnershipUtil.pathsOutsideEntityOf(entities, 'shop', [
      '/apps/shop/index.ts',
      '/packages/shop-private/a.ts',
      '/packages/design-system/Button.ts',
      '/bun.lock',
      '/config/shared/a.json',
      '/apps/admin/index.ts',
      '/scripts/release.ts',
      '/config/other.json',
    ])).toEqual(['/apps/admin/index.ts', '/scripts/release.ts', '/config/other.json']);
  });

  test('hold a deeper home of another entity, also inside a whitelisted package', () => {
    expect(EntityOwnershipUtil.pathsOutsideEntityOf(entities, 'shop', ['/packages/design-system/tokens/colour.ts'])).toEqual(['/packages/design-system/tokens/colour.ts']);
  });

  test('of the root entity, which the pipeline need not name, are every path another entity owns', () => {
    expect(EntityOwnershipUtil.pathsOutsideEntityOf(entities, ROOT_ENTITY_KEY, ['/scripts/release.ts', '/apps/shop/index.ts'])).toEqual(['/apps/shop/index.ts']);
  });
});
