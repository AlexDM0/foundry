/**
 * The level a monorepo route holds. What matters: `#pipeline/forge/<item>` and `#pipeline/entity/<key>/<item>` read as their level and
 * the screen's own item, and writing them back gives the same route; an entity named `forge` keeps its own level; a single-mode item
 * reads with no level and unchanged; moving to another level keeps the screen. A draft field belongs to the entity its scope names, and
 * every other field to the forge. An entity's summary leads a page as a sentence of its own.
 */
import { describe, expect, test } from 'bun:test';

import { FORGE_LEVEL, PipelineLevelModel } from './PipelineLevelModel.ts';

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

describe('a level in the route', () => {
  test('the forge and an entity lead the item, and the screen\'s own item follows', () => {
    expect(PipelineLevelModel.leveledItemOf('forge/setup/design')).toEqual({ level: FORGE_LEVEL, item: 'setup/design' });
    expect(PipelineLevelModel.leveledItemOf('entity/web/edit/constitution')).toEqual({ level: WEB_LEVEL, item: 'edit/constitution' });
    expect(PipelineLevelModel.leveledItemOf('forge')).toEqual({ level: FORGE_LEVEL, item: null });
    expect(PipelineLevelModel.leveledItemOf('entity/web')).toEqual({ level: WEB_LEVEL, item: null });
  });

  test('an entity named forge is an entity, not the forge level', () => {
    expect(PipelineLevelModel.leveledItemOf('entity/forge/setup/design')).toEqual({ level: PipelineLevelModel.entityLevelOf('forge'), item: 'setup/design' });
  });

  test('a single-mode item has no level and keeps its item', () => {
    expect(PipelineLevelModel.leveledItemOf('setup/design')).toEqual({ level: null, item: 'setup/design' });
    expect(PipelineLevelModel.leveledItemOf(null)).toEqual({ level: null, item: null });
    expect(PipelineLevelModel.leveledItemOf('entity')).toEqual({ level: null, item: 'entity' });
    expect(PipelineLevelModel.itemWithinLevelOf('edit/constitution')).toBe('edit/constitution');
  });

  test('a written level reads back as itself', () => {
    for (const level of [FORGE_LEVEL, WEB_LEVEL]) {
      for (const item of [null, 'setup/design']) {
        expect(PipelineLevelModel.leveledItemOf(PipelineLevelModel.itemAtLevel(level, item))).toEqual({ level, item });
      }
    }
    expect(PipelineLevelModel.routeAtLevel(WEB_LEVEL, 'setup/design')).toEqual({ tab: 'pipeline', item: 'entity/web/setup/design' });
  });

  test('moving to another level keeps the screen, from a single-mode route too', () => {
    expect(PipelineLevelModel.routeMovedTo({ tab: 'pipeline', item: 'forge/setup/design' }, WEB_LEVEL))
      .toEqual({ tab: 'pipeline', item: 'entity/web/setup/design' });
    expect(PipelineLevelModel.routeMovedTo({ tab: 'pipeline', item: null }, WEB_LEVEL)).toEqual({ tab: 'pipeline', item: 'entity/web' });
  });

  test('levels compare by kind and key, and the forge is named Forge', () => {
    expect(PipelineLevelModel.levelsAreEqual(WEB_LEVEL, PipelineLevelModel.entityLevelOf('web'))).toBe(true);
    expect(PipelineLevelModel.levelsAreEqual(WEB_LEVEL, PipelineLevelModel.entityLevelOf('admin'))).toBe(false);
    expect(PipelineLevelModel.levelsAreEqual(FORGE_LEVEL, PipelineLevelModel.entityLevelOf('forge'))).toBe(false);
    expect(PipelineLevelModel.levelNameOf(FORGE_LEVEL)).toBe('Forge');
    expect(PipelineLevelModel.levelNameOf(WEB_LEVEL)).toBe('web');
  });
});

describe('the level of a draft field', () => {
  test('an entity-scoped field and an entity\'s definition are the entity\'s; every other field is the forge\'s', () => {
    expect(PipelineLevelModel.levelOfField('entity:web/gate:lint')).toEqual(WEB_LEVEL);
    expect(PipelineLevelModel.levelOfField('entity:web')).toEqual(WEB_LEVEL);
    expect(PipelineLevelModel.levelOfField('approval:merge')).toEqual(FORGE_LEVEL);
    expect(PipelineLevelModel.levelOfField('gate:lint')).toEqual(FORGE_LEVEL);
  });

  test('the field inside its entity, none for a definition, and a forge field as it is', () => {
    expect(PipelineLevelModel.fieldWithinEntityOf('entity:web/gate:lint')).toBe('gate:lint');
    expect(PipelineLevelModel.fieldWithinEntityOf('entity:web/whitelist')).toBe('whitelist');
    expect(PipelineLevelModel.fieldWithinEntityOf('entity:web')).toBeNull();
    expect(PipelineLevelModel.fieldWithinEntityOf('airlock')).toBe('airlock');
  });
});

describe('an entity\'s summary in a page\'s lead', () => {
  test('a phrase gains its full stop, and a sentence keeps its own', () => {
    expect(PipelineLevelModel.summarySentenceOf('Next.js storefront ')).toBe('Next.js storefront.');
    expect(PipelineLevelModel.summarySentenceOf('The Example Agency components.')).toBe('The Example Agency components.');
  });
});
