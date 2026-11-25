/**
 * The entities step's model. What matters: the mode is a fact of the record and of User's press, never a stored choice: an empty draft
 * waits for the proposal until User removed entities, which is single mode; a proposal is accepted by the press, by User's own edit of an
 * entity or by a done step. The rows leave the root to its own place, which defaults to kept for a person. Every gesture is edits on the
 * entities a gesture saw: a rename moves the entity whole and every list that named it follows, a removal takes its references with it,
 * an entity keeps one home, a key another entity or the root holds is refused, a declined proposal removes every entity, and the edits go
 * out typed. The step holds no edit: a gesture's edits go to the forge at once, even when the draft they leave holds a refusal, one
 * gesture at a time. A refusal is the one the forge serves: its sentence shows on the row it names, a whitelist entry it names is marked,
 * nothing is predicted, and Continue waits for a decision and while a served refusal stands.
 */
import { describe, expect, test }                                                            from 'bun:test';
import type { BoardDraftEditDocument, BoardEntityRefusalDocument, BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ENTITIES_STEP_ENTITIES, entitiesStepBoardOf }                                       from '../../../testing/EntitiesStepFixture.ts';
import { exampleEntity }                                                                     from '../../../testing/PipelineFixture.ts';
import { EntitiesStepModel }                                                                 from './EntitiesStepModel.ts';
import { EntityRefusalsModel }                                                               from './EntityRefusalsModel.ts';

const entities = ENTITIES_STEP_ENTITIES;

/** The refusal the forge serves for web's whitelist naming config, which has no review step, with a sentence as forge words it. */
const SERVED_REVIEW_REFUSAL: BoardEntityRefusalDocument = {
  reason:     'whitelisted-package-without-review',
  entityKeys: ['web', 'config'],
  shownOn:    'web',
  text:       'Example: web whitelists config, which has no review step. Continue and Apply wait until it is fixed.',
  fix:        {
    label: 'Give config a review step',
    edits: [{ target: 'within-entity', entityKey: 'config', edit: { target: 'review', value: { name: 'review', reReview: null } } }],
  },
};

const SERVED_NOT_A_PACKAGE_REFUSAL: BoardEntityRefusalDocument = {
  reason:     'whitelisted-entity-not-package',
  entityKeys: ['web', 'admin'],
  shownOn:    'web',
  text:       'Example: web whitelists admin, which is not a package. Continue and Apply wait until it is fixed.',
  fix:        null,
};

function recordWith(changes: Partial<Pick<BoardSetupRecordDocument, 'edits' | 'stepStates'>> = {}): Pick<BoardSetupRecordDocument, 'edits' | 'stepStates'> {
  return {
    edits:      [],
    stepStates: {
      agent: 'done', billing: 'done', research: 'done', entities: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
    },
    ...changes,
  };
}

function editOf(by: 'user' | 'agent', field: string): BoardSetupRecordDocument['edits'][number] {
  return {
    editId: 'E1', by, field, summary: '', undone: false, batch: null,
  };
}

describe('the mode', () => {
  test('a draft with no entity waits for the proposal, and is single mode once User removed entities', () => {
    expect(EntitiesStepModel.modeOf(recordWith(), {}, false)).toBe('waiting');
    expect(EntitiesStepModel.modeOf(recordWith({ edits: [editOf('user', 'entity:web')] }), {}, false)).toBe('single');
  });

  test('a proposal is accepted by the press, by User\'s own edit of an entity, or by a done step; an agent\'s edit accepts nothing', () => {
    expect(EntitiesStepModel.modeOf(recordWith(), entities, false)).toBe('proposed');
    expect(EntitiesStepModel.modeOf(recordWith({ edits: [editOf('agent', 'entity:web')] }), entities, false)).toBe('proposed');
    expect(EntitiesStepModel.modeOf(recordWith(), entities, true)).toBe('accepted');
    expect(EntitiesStepModel.modeOf(recordWith({ edits: [editOf('user', 'entity:web/reach')] }), entities, false)).toBe('accepted');
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

  test('a whitelist entry a served refusal names is marked, and the row shows the forge\'s sentence of the first refusal on it', () => {
    const refused = { ...entities, web: { ...entities['web'], whitelist: ['config', 'admin'] } } as typeof entities;
    const web = EntitiesStepModel.rowsOf(refused, [SERVED_REVIEW_REFUSAL, SERVED_NOT_A_PACKAGE_REFUSAL])[0];
    expect(web?.whitelist).toEqual([{ key: 'config', refused: 'no review step' }, { key: 'admin', refused: 'not a package' }]);
    expect(web?.refusalNote).toBe(SERVED_REVIEW_REFUSAL.text);
  });

  test('a whitelist the forge serves no refusal for is marked nowhere: nothing is predicted', () => {
    const refused = { ...entities, web: { ...entities['web'], whitelist: ['config', 'admin'] } } as typeof entities;
    const web = EntitiesStepModel.rowsOf(refused, [])[0];
    expect(web?.whitelist).toEqual([{ key: 'config', refused: null }, { key: 'admin', refused: null }]);
    expect(web?.refusalNote).toBeNull();
  });

  test('the root is kept for a person by default; gated adds the root entity over the repository\'s root, and person removes it again', () => {
    expect(EntitiesStepModel.rootViewOf(entities)).toEqual({ key: 'root', choice: 'person', constitutionText: 'Not needed' });
    const gated = EntitiesStepModel.rootChoiceEditsOf(entities, 'gated');
    expect(gated).toEqual([{ target: 'entity', entityKey: 'root', value: { kind: 'root', home: ['/'], summary: null } }]);
    const withRoot = { ...entities, root: exampleEntity('root', ['/']) };
    expect(EntitiesStepModel.rootViewOf(withRoot).choice).toBe('gated');
    expect(EntitiesStepModel.rowsOf(withRoot)).toHaveLength(5);
    expect(EntitiesStepModel.rootChoiceEditsOf(withRoot, 'person')).toEqual([{ target: 'entity', entityKey: 'root', value: null }]);
  });

  test('a root the draft holds under another key is the root, as its kind says', () => {
    const withRoot = { ...entities, base: exampleEntity('root', ['/']) };
    expect(EntitiesStepModel.rootViewOf(withRoot)).toMatchObject({ key: 'base', choice: 'gated' });
  });
});

describe('the gestures', () => {
  test('a rename moves the entity whole, and every whitelist and depends-on that named it follows', () => {
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', 'components')).toEqual([
      { target: 'entity', entityKey: 'ui', value: null },
      { target: 'entity', entityKey: 'components', value: { kind: 'package', home: ['/packages/ui'], summary: 'React components' } },
      { target: 'within-entity', entityKey: 'components', edit: { target: 'review', value: { name: 'review', reReview: null } } },
      { target: 'within-entity', entityKey: 'components', edit: { target: 'depends-on', value: ['config'] } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: ['components'] } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: ['components'] } },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'depends-on', value: ['components'] } },
    ]);
  });

  test('a rename to a blank key, another entity\'s key or the root\'s makes no edit', () => {
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', '  ')).toBeNull();
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', 'web')).toBeNull();
    expect(EntitiesStepModel.renameEditsOf(entities, 'ui', 'root')).toBeNull();
  });

  test('a key another entity or the root holds is refused with its reason, a blank key or the entity\'s own makes no edit and needs none', () => {
    expect(EntitiesStepModel.keyRefusalOf(entities, 'ui', null)).toBe('Another entity has this key');
    expect(EntitiesStepModel.keyRefusalOf(entities, 'root', null)).toBe('The root entity has this key');
    expect([EntitiesStepModel.keyRefusalOf(entities, ' ', null), EntitiesStepModel.keyRefusalOf(entities, 'ui', 'ui')]).toEqual([null, null]);
  });

  test('a removed entity takes every whitelist and depends-on entry that named it, and a list it empties goes', () => {
    expect(EntitiesStepModel.entityRemovedEditsOf(entities, 'ui')).toEqual([
      { target: 'entity', entityKey: 'ui', value: null },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: null } },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'depends-on', value: null } },
    ]);
  });

  test('an entity keeps one home at least, and an added folder is stored leading with a slash', () => {
    expect(EntitiesStepModel.homeRemovedEditOf(entities, 'docs', 'docs')).toBeNull();
    const added = EntitiesStepModel.homeAddedEditOf(entities, 'docs', 'handbook/');
    expect(added).toEqual({ target: 'entity', entityKey: 'docs', value: { kind: 'package', home: ['/docs', '/handbook'], summary: 'The handbook, in Markdown' } });
    expect(EntitiesStepModel.homeAddedEditOf(entities, 'docs', '/docs')).toBeNull();
  });

  test('a new entity needs a key no entity has and a home folder', () => {
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'shared', kind: 'package', homeFolder: 'packages/shared' }))
      .toEqual({ target: 'entity', entityKey: 'shared', value: { kind: 'package', home: ['/packages/shared'], summary: null } });
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'shared', kind: 'package', homeFolder: ' ' })).toBeNull();
    expect(EntitiesStepModel.entityAddedEditOf(entities, { key: 'ui', kind: 'package', homeFolder: 'packages/other' })).toBeNull();
  });

  test('staying in single mode removes every entity, so the draft holds none', () => {
    expect(EntitiesStepModel.declineEditsOf(entities)).toEqual(['web', 'admin', 'ui', 'config', 'docs'].map((entityKey) => ({ target: 'entity', entityKey, value: null })));
  });

  test('the edits go out typed, a list inside its entity and an emptied list as null', () => {
    const edits = [EntitiesStepModel.whitelistRemovedEditOf(entities, 'web', 'ui'), EntitiesStepModel.reachAddedEditOf(entities, 'web', 'turbo.json')];
    expect(edits).toEqual([
      { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'reach', value: ['/package.json', '/bun.lock', '/turbo.json'] } },
    ]);
  });
});

describe('sending a gesture', () => {
  test('the step shows the draft the forge stores, refused or not, and holds no edit of its own', () => {
    const board = entitiesStepBoardOf();
    expect(EntitiesStepModel.draftEntitiesOf(board.pipeline.setup?.record ?? { draft: null })).toEqual(entities);
    expect(EntitiesStepModel.draftEntitiesOf({ draft: null })).toEqual({});
  });

  test('sends a gesture\'s edits at once, even when the draft they leave holds a refusal', () => {
    const refusedWhitelist: BoardDraftEditDocument[] = [{ target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: ['ui', 'admin'] } }];
    expect(EntitiesStepModel.sentEditsOf(refusedWhitelist, true)).toEqual(refusedWhitelist);
  });

  test('sends nothing while another gesture is in flight, or for a gesture that makes no edit', () => {
    expect(EntitiesStepModel.sentEditsOf([{ target: 'entity', entityKey: 'docs', value: null }], false)).toBeNull();
    expect(EntitiesStepModel.sentEditsOf([], true)).toBeNull();
  });
});

describe('the footer', () => {
  test('Continue waits for a decision, then while a served refusal stands', () => {
    expect(EntitiesStepModel.continueBlockOf('waiting', 0)).toBe('Wait for the proposal, or stay in single mode');
    expect(EntitiesStepModel.continueBlockOf('proposed', 0)).toBe('Accept monorepo mode first, or stay in single mode');
    expect(EntitiesStepModel.continueBlockOf('accepted', 1)).toBe('Resolve the refusal first');
    expect(EntitiesStepModel.continueBlockOf('accepted', 0)).toBeNull();
    expect(EntitiesStepModel.continueBlockOf('single', 0)).toBeNull();
  });

  test('Continue is disabled while the forge serves a refusal of the stored draft, and not before it serves one', () => {
    const refused = entitiesStepBoardOf({}, { entityRefusals: [SERVED_REVIEW_REFUSAL] }).pipeline.setup;
    const clean = entitiesStepBoardOf().pipeline.setup;
    if (refused === null || clean === null) throw new Error('the entities step board holds a setup');
    expect(EntitiesStepModel.continueBlockOf('accepted', EntityRefusalsModel.refusalsOf(refused).length)).toBe('Resolve the refusal first');
    expect(EntitiesStepModel.continueBlockOf('accepted', EntityRefusalsModel.refusalsOf(clean).length)).toBeNull();
  });

  test('the summary counts the entities with the root, the refusals and the open questions', () => {
    expect(EntitiesStepModel.footerSummaryOf(entities, 0, 1)).toBe('6 entities · no refusal · 1 question open');
    expect(EntitiesStepModel.entityCountTextOf(entities)).toBe('6 entities · 5 proposed entities, and the root');
  });
});
