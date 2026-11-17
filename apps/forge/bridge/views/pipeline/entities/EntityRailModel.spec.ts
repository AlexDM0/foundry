/**
 * The entity rail's rows. What matters: the forge row comes first and the entities follow in the groups Apps, Packages and Root, each in
 * the draft's order; each row has one mark, a gate profile under way before no gates before the default constitution, else its gate
 * count; a root without gates is kept for a person and never counted as needing a look; the counts of open questions and pending edits
 * belong to their own level only; the filter keeps the forge and the entities whose key or kind holds its text; the stored pipeline's
 * entities show while no record holds a draft.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline, PipelineEntity, PipelineEntityKind } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { pipelineBoardStateOf }                              from '../../../testing/PipelineFixture.ts';
import { EntityRailModel, type EntityRailFacts }             from './EntityRailModel.ts';
import { FORGE_LEVEL, PipelineLevelModel }                   from './PipelineLevelModel.ts';

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

const TYPECHECK_GATE = { name: 'typecheck', run: 'bun run typecheck' };

/** An entity with one gate and its own constitution, unless told it has no gates or keeps the default constitution. */
function entity(kind: PipelineEntityKind, shape: { readonly gateless?: boolean; readonly defaultConstitution?: boolean } = {}): PipelineEntity {
  const gates = shape.gateless === true ? [] : [TYPECHECK_GATE];
  const base: PipelineEntity = {
    kind, home: ['/example'], prepare: [], gates, phases: { build: gates.map((gate) => gate.name), review: [], merge: [] },
  };
  return shape.defaultConstitution === true ? base : { ...base, constitution: { path: '/example/CONSTITUTION.md' } };
}

function draftFacts(entities: Record<string, PipelineEntity>, changes: Partial<EntityRailFacts> = {}): EntityRailFacts {
  const draft: Pick<Pipeline, 'entities'> = { entities };
  return { pipelineSetup: { record: { draft, questions: [] } }, ...changes };
}

const ENTITIES: Record<string, PipelineEntity> = {
  'design-system': entity('package'),
  'web':           entity('app', { defaultConstitution: true }),
  'config':        entity('package', { gateless: true }),
  'root':          entity('root', { gateless: true, defaultConstitution: true }),
  'admin':         entity('app'),
};

describe('the rail\'s rows', () => {
  test('the forge first, then Apps, Packages and Root, each in the draft\'s order', () => {
    const rail = EntityRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, '');
    expect(rail.forgeRow).toMatchObject({
      name: 'Forge', kindText: 'Shared by every entity', status: null, selected: true
    });
    expect(rail.groups.map((group) => [group.label, group.rows.map((row) => row.name)])).toEqual([
      ['Apps', ['web', 'admin']],
      ['Packages', ['design-system', 'config']],
      ['Root', ['root']],
    ]);
    expect(EntityRailModel.rowsInOrderOf(rail).map((row) => row.name)).toEqual(['Forge', 'web', 'admin', 'design-system', 'config', 'root']);
  });

  test('each row has one mark: no gates, the default constitution, kept for a person, or its gate count', () => {
    const rows = EntityRailModel.rowsInOrderOf(EntityRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.status, row.statusText, row.kindText])).toEqual([
      ['Forge', null, null, 'Shared by every entity'],
      ['web', 'default-constitution', 'Default constitution', 'app'],
      ['admin', 'checked', '1 gate', 'app'],
      ['design-system', 'checked', '1 gate', 'package'],
      ['config', 'no-gates', 'No gates', 'package'],
      ['root', 'kept-for-a-person', 'For a person', 'every other path'],
    ]);
  });

  test('a gate profile under way marks its own entity before any other mark', () => {
    const facts = draftFacts(ENTITIES, { profileRuns: [{ entity: 'config', state: 'running' }, { entity: 'admin', state: 'passed' }] });
    const rows = EntityRailModel.rowsInOrderOf(EntityRailModel.railOf(facts, FORGE_LEVEL, ''));
    expect(rows.find((row) => row.name === 'config')?.status).toBe('gate-running');
    expect(rows.find((row) => row.name === 'admin')?.status).toBe('checked');
  });

  test('the attention line counts the apps and packages without gates or with the default constitution, never the root', () => {
    const rail = EntityRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, '');
    expect(rail.attentionText).toBe('1 entity has no gates · 1 entity has the default constitution');
    expect(rail.someEntityHasNoGates).toBe(true);
    const settled = EntityRailModel.railOf(draftFacts({ admin: entity('app'), root: entity('root', { gateless: true }) }), FORGE_LEVEL, '');
    expect(settled.attentionText).toBeNull();
    expect(settled.someEntityHasNoGates).toBe(false);
  });

  test('open questions and pending edits count at their own level, and the row names them for a screen reader', () => {
    const facts: EntityRailFacts = {
      pipelineSetup: {
        record:   { draft: { entities: ENTITIES }, questions: [{ answer: null }, { answer: { letters: ['a'], answeredAt: '2026-11-12T09:20:00' } }] },
        entities: { web: { openQuestionCount: 2 } },
      },
      pipelineFlow: { changeList: [{ field: 'entity:web/gate:lint' }, { field: 'entity:web' }, { field: 'approval:merge' }, { field: 'entity:admin/reach' }] },
    };
    const rows = EntityRailModel.rowsInOrderOf(EntityRailModel.railOf(facts, WEB_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.openQuestionCount, row.pendingEditCount])).toEqual([
      ['Forge', 1, 1], ['web', 2, 2], ['admin', 0, 1], ['design-system', 0, 0], ['config', 0, 0], ['root', 0, 0],
    ]);
    expect(rows[1]?.accessibleName).toBe('web, app, Default constitution, 2 open questions, 2 pending edits');
    expect(rows.filter((row) => row.selected).map((row) => row.name)).toEqual(['web']);
  });

  test('the filter keeps the forge and the entities whose key or kind holds its text, and says when none matches', () => {
    const byKey = EntityRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, ' ADM ');
    expect(EntityRailModel.rowsInOrderOf(byKey).map((row) => row.name)).toEqual(['Forge', 'admin']);
    const byKind = EntityRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, 'package');
    expect(byKind.groups.map((group) => group.label)).toEqual(['Packages']);
    const none = EntityRailModel.railOf(draftFacts(ENTITIES), FORGE_LEVEL, 'example-nothing');
    expect(none.groups).toEqual([]);
    expect(none.nothingMatches).toBe(true);
    expect(none.attentionText).toBe('1 entity has no gates · 1 entity has the default constitution');
  });

  test('the stored pipeline\'s entities show while no record holds a draft, with a running profile marked', () => {
    const rows = EntityRailModel.rowsInOrderOf(EntityRailModel.railOf(pipelineBoardStateOf('mono-live'), FORGE_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.status])).toEqual([
      ['Forge', null], ['web', 'gate-running'], ['design-system', 'checked'], ['root', 'kept-for-a-person'],
    ]);
  });

  test('a setup over entities reads its draft and each session\'s open questions', () => {
    const rows = EntityRailModel.rowsInOrderOf(EntityRailModel.railOf(pipelineBoardStateOf('mono-design'), FORGE_LEVEL, ''));
    expect(rows.map((row) => [row.name, row.openQuestionCount])).toEqual([['Forge', 0], ['web', 1], ['design-system', 0], ['root', 0]]);
  });
});
