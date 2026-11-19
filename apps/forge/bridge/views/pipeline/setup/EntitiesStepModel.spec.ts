/**
 * The entities step's model. What matters: the mode is a fact of the record and of User's press, never a stored choice: an empty draft
 * waits for the proposal until User removed entities, which is single mode; a proposal is accepted by the press, by User's own edit of an
 * entity or by a done step. The rows leave the root to its own place, which defaults to kept for a person. Every gesture is edits on the
 * entities a gesture saw: a rename moves the entity whole and every list that named it follows, a removal takes its references with it,
 * an entity keeps one home, a key the field codec cannot address is refused, a declined proposal leaves the draft with no entity at all,
 * and the edits go out as the fields the command names. Continue waits for a decision and for every refusal.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineSetup }                          from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { PipelineDraftEditUtil }                       from '../../../../src/lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import { ENTITIES_STEP_ENTITIES, entitiesStepDraftOf } from '../../../testing/EntitiesStepFixture.ts';
import { EntitiesStepModel }                           from './EntitiesStepModel.ts';

const draft = entitiesStepDraftOf();
const entities = ENTITIES_STEP_ENTITIES;

function recordWith(changes: Partial<Pick<PipelineSetup, 'edits' | 'stepStates'>> = {}): Pick<PipelineSetup, 'edits' | 'stepStates'> {
  return {
    edits:      [],
    stepStates: {
      billing: 'done', research: 'done', entities: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
    },
    ...changes,
  };
}

describe('the mode', () => {
  test('a draft with no entity waits for the proposal, and is single mode once User removed entities', () => {
    expect(EntitiesStepModel.modeOf(recordWith(), {}, false)).toBe('waiting');
    const removed = recordWith({
      edits: [{
        editId: 'E1', by: 'user', field: 'entity:web', summary: '', undone: false
      }]
    });
    expect(EntitiesStepModel.modeOf(removed, {}, false)).toBe('single');
  });

  test('a proposal is accepted by the press, by User\'s own edit of an entity, or by a done step; an agent\'s edit accepts nothing', () => {
    expect(EntitiesStepModel.modeOf(recordWith(), entities, false)).toBe('proposed');
    expect(EntitiesStepModel.modeOf(recordWith({
      edits: [{
        editId: 'E1', by: 'agent', field: 'entity:web', summary: '', undone: false
      }]
    }), entities, false))
      .toBe('proposed');
    expect(EntitiesStepModel.modeOf(recordWith(), entities, true)).toBe('accepted');
    expect(EntitiesStepModel.modeOf(recordWith({
      edits: [{
        editId: 'E1', by: 'user', field: 'entity:web/reach', summary: '', undone: false
      }]
    }), entities, false))
      .toBe('accepted');
    const done = recordWith({ stepStates: { ...recordWith().stepStates, entities: 'done' } });
    expect(EntitiesStepModel.modeOf(done, entities, false)).toBe('accepted');
  });
});

describe('the rows and the root', () => {
  test('each entity but the root is a row, its homes without the leading slash, what whitelists it and what it may still whitelist', () => {
    const rows = EntitiesStepModel.rowsOf(entities);
    expect(rows.map((row) => row.key)).toEqual(['web', 'admin', 'ui', 'config', 'docs']);
    const web = rows[0];
    expect(web?.homes).toEqual(['apps/web']);
    expect(web?.whitelist).toEqual([{ key: 'ui', refused: null }]);
    expect(web?.addablePackages).toEqual(['config', 'docs']);
    expect(web?.dependsOnText).toBe('ui');
    expect(rows[2]?.whitelistedBy).toEqual(['web']);
  });

  test('a whitelist entry that is no package, or one without review, is refused on its row', () => {
    const refused = { ...entities, web: { ...entities['web'], whitelist: ['config', 'admin'] } } as typeof entities;
    const web = EntitiesStepModel.rowsOf(refused)[0];
    expect(web?.whitelist).toEqual([{ key: 'config', refused: 'no review step' }, { key: 'admin', refused: 'not a package' }]);
    expect(web?.refusalNote).toBe('Whitelist names config: no review step');
  });

  test('the root is kept for a person by default; gated adds the root entity over the repository\'s root, and person removes it again', () => {
    expect(EntitiesStepModel.rootViewOf(entities)).toEqual({ key: 'root', choice: 'person', constitutionText: 'Not needed' });
    const gated = EntitiesStepModel.rootChoiceEditsOf(entities, 'gated');
    expect(gated).toEqual([{ target: 'entity', entityKey: 'root', value: { kind: 'root', home: ['/'] } }]);
    const withRoot = EntitiesStepModel.entitiesAfterEdits(draft, gated);
    expect(EntitiesStepModel.rootViewOf(withRoot).choice).toBe('gated');
    expect(EntitiesStepModel.rowsOf(withRoot)).toHaveLength(5);
    expect(Object.keys(EntitiesStepModel.entitiesAfterEdits(entitiesStepDraftOf(withRoot), EntitiesStepModel.rootChoiceEditsOf(withRoot, 'person'))))
      .not.toContain('root');
  });
});

describe('the gestures', () => {
  test('a rename moves the entity whole, last in the draft, and every whitelist and depends-on that named it follows', () => {
    const edits = EntitiesStepModel.renameEditsOf(entities, 'ui', 'components');
    if (edits === null) throw new Error('the rename makes edits');
    const after = EntitiesStepModel.entitiesAfterEdits(draft, edits);
    expect(Object.keys(after)).toEqual(['web', 'admin', 'config', 'docs', 'components']);
    expect(after['components']).toEqual({ ...entities['ui'] } as never);
    expect(after['web']?.whitelist).toEqual(['components']);
    expect(after['admin']?.dependsOn).toEqual(['components']);
  });

  test('a rename to a blank key, another entity\'s key or the root\'s makes no edit', () => {
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', '  ')).toBeNull();
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', 'web')).toBeNull();
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', 'root')).toBeNull();
  });

  test('a key that holds the field codec\'s scope separator is refused with its reason, so neither a rename nor an addition makes an edit', () => {
    expect(EntitiesStepModel.keyRefusalOf(entities, 'shop/web', 'web')).toBe('A key cannot hold "/"');
    expect(EntitiesStepModel.renameEditsOf(entities, 'web', 'shop/web')).toBeNull();
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'shared/ui', kind: 'package', homeFolder: 'packages/shared' })).toBeNull();
    expect(EntitiesStepModel.keyRefusalOf(entities, 'ui', null)).toBe('Another entity has this key');
    expect(EntitiesStepModel.keyRefusalOf(entities, 'root', null)).toBe('The root entity has this key');
    expect([EntitiesStepModel.keyRefusalOf(entities, ' ', null), EntitiesStepModel.keyRefusalOf(entities, 'ui', 'ui')]).toEqual([null, null]);
  });

  test('a removed entity takes every whitelist and depends-on entry that named it, and a list it empties goes', () => {
    const after = EntitiesStepModel.entitiesAfterEdits(draft, EntitiesStepModel.entityRemovedEditsOf(entities, 'ui'));
    expect(Object.keys(after)).toEqual(['web', 'admin', 'config', 'docs']);
    expect(after['web']?.whitelist).toBeUndefined();
    expect(after['admin']?.dependsOn).toBeUndefined();
  });

  test('an entity keeps one home at least, and an added folder is stored leading with a slash', () => {
    expect(EntitiesStepModel.homeRemovedEditOf(entities, 'docs', 'docs')).toBeNull();
    const added = EntitiesStepModel.homeAddedEditOf(entities, 'docs', 'handbook/');
    expect(added).toEqual({ target: 'entity', entityKey: 'docs', value: { kind: 'package', home: ['/docs', '/handbook'], summary: 'The handbook, in Markdown' } });
    expect(EntitiesStepModel.homeAddedEditOf(entities, 'docs', '/docs')).toBeNull();
  });

  test('a new entity needs a key no entity has and a home folder', () => {
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'shared', kind: 'package', homeFolder: 'packages/shared' }))
      .toEqual({ target: 'entity', entityKey: 'shared', value: { kind: 'package', home: ['/packages/shared'] } });
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'shared', kind: 'package', homeFolder: ' ' })).toBeNull();
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'ui', kind: 'package', homeFolder: 'packages/other' })).toBeNull();
  });

  test('staying in single mode removes every entity, so the draft holds none', () => {
    const declined = EntitiesStepModel.declineEditsOf(entities);
    expect(EntitiesStepModel.entitiesAfterEdits(draft, declined)).toEqual({});
    expect(declined.map(PipelineDraftEditUtil.fieldOf)).toEqual(['entity:web', 'entity:admin', 'entity:ui', 'entity:config', 'entity:docs']);
  });

  test('the edits go out typed, a list inside its entity and an emptied list as null', () => {
    const edits = [EntitiesStepModel.whitelistRemovedEditOf(entities, 'web', 'ui'), EntitiesStepModel.reachAddedEditOf(entities, 'web', 'turbo.json')];
    expect(edits).toEqual([
      { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'reach', value: ['/package.json', '/bun.lock', '/turbo.json'] } },
    ]);
  });
});

describe('the footer', () => {
  test('Continue waits for a decision, then for every refusal and every held change', () => {
    expect(EntitiesStepModel.continueBlockOf('waiting', 0, 0)).toBe('Wait for the proposal, or stay in single mode');
    expect(EntitiesStepModel.continueBlockOf('proposed', 0, 0)).toBe('Accept monorepo mode first, or stay in single mode');
    expect(EntitiesStepModel.continueBlockOf('accepted', 1, 0)).toBe('Resolve the refusal first');
    expect(EntitiesStepModel.continueBlockOf('accepted', 0, 2)).toBe('Resolve the refusal first');
    expect(EntitiesStepModel.continueBlockOf('accepted', 0, 0)).toBeNull();
    expect(EntitiesStepModel.continueBlockOf('single', 0, 0)).toBeNull();
  });

  test('the summary counts the entities with the root, the refusals and the open questions', () => {
    expect(EntitiesStepModel.footerSummaryOf(entities, 0, 1)).toBe('6 entities · no refusal · 1 question open');
    expect(EntitiesStepModel.entityCountTextOf(entities)).toBe('6 entities · 5 proposed entities, and the root');
  });
});
