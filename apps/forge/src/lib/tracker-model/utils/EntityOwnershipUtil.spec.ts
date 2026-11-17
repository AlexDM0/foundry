/**
 * Ownership of a pipeline's entities. What matters: a path in no home is the root entity's (E1), named by its key when the pipeline holds a
 * root entity and `root` when it does not; a deeper home wins over the one around it (E2), whatever order the entities come in, and a home
 * holds only whole folder names; a file moved across a border is a change of both entities (E5). A change reaches every consumer, also
 * through another, and a change of the root entity reaches every entity. Package stages run a package before the packages that consume it.
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
