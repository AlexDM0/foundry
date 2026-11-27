/**
 * The Changes list grouped by level: the forge first, then the entities in the rail's order; a copy's edits stand as one batch row with
 * one `pipeline-draft-undo` with `wholeBatch` per level while each change keeps its Undo; and how a change inside an entity is worded.
 */
import { describe, expect, test }                                   from 'bun:test';
import type { BoardPipelineChangeDocument, BoardSetupEditDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ChangeGroupModel }                                         from './ChangeGroupModel.ts';
import { FORGE_LEVEL, PipelineLevelModel }                          from './PipelineLevelModel.ts';

function edit(editId: string, field: BoardSetupEditDocument['field'], summary: string, batch?: string): BoardSetupEditDocument {
  return {
    editId, by: 'user', field, summary, undone: false, batch: batch ?? null,
  };
}

const CHANGES: readonly BoardPipelineChangeDocument[] = [
  { field: 'entity:admin/gate:lint', changeKind: 'new', editId: 'E3' },
  { field: 'approval:merge', changeKind: 'changed', editId: 'E1' },
  { field: 'entity:web/gate:typecheck', changeKind: 'changed', editId: 'E2' },
  { field: 'entity:admin/gate:test', changeKind: 'new', editId: 'E4' },
  { field: 'entity:admin/whitelist', changeKind: 'new', editId: 'E6' },
  { field: 'entity:admin/gate:typecheck', changeKind: 'changed', editId: 'E5' },
];

const EDITS: readonly BoardSetupEditDocument[] = [
  edit('E1', 'approval:merge', 'Example: a green ticket waits for Merge.'),
  edit('E2', 'entity:web/gate:typecheck', 'Example: typecheck bails early.'),
  edit('E3', 'entity:admin/gate:lint', 'Copied gates from web', 'E3'),
  edit('E4', 'entity:admin/gate:test', 'Copied gates from web', 'E3'),
  edit('E5', 'entity:admin/gate:typecheck', 'Copied gates from web', 'E3'),
  edit('E6', 'entity:admin/whitelist', ''),
];

describe('the groups', () => {
  test('the forge first, then the entities in the rail\'s order, each with its count', () => {
    const groups = ChangeGroupModel.groupsOf(CHANGES, EDITS, ['web', 'admin']);
    expect(groups.map((group) => [group.name, group.changeCount, group.headName])).toEqual([
      ['Forge', 1, 'Forge, 1 change'], ['web', 1, 'web, 1 change'], ['admin', 4, 'admin, 4 changes'],
    ]);
    expect(groups[0]?.level).toEqual(FORGE_LEVEL);
    expect(groups[2]?.level).toEqual(PipelineLevelModel.entityLevelOf('admin'));
  });

  test('a level with no change has no group, and an entity the rail does not hold still gets one after the others', () => {
    const groups = ChangeGroupModel.groupsOf(CHANGES, EDITS, ['admin', 'design-system']);
    expect(groups.map((group) => group.name)).toEqual(['Forge', 'admin', 'web']);
  });
});

describe('a copy\'s set', () => {
  test('stands as one batch row in the place of its first change, with its sentence, count and every edit its undo takes back', () => {
    const admin = ChangeGroupModel.groupsOf(CHANGES, EDITS, ['web', 'admin'])[2];
    expect(admin?.items.map((item) => item.itemKind)).toEqual(['batch', 'edit']);
    const batchItem = admin?.items[0];
    if (batchItem?.itemKind !== 'batch') throw new Error('no batch row');
    expect(batchItem.batch).toMatchObject({
      batchId: 'E3', title: 'Copied gates from web', editCountText: '3 edits', undoLabel: 'Undo all 3', undoEditIds: ['E3', 'E4', 'E5'],
    });
    expect(batchItem.batch.rows.map((row) => [row.title, row.location, row.undoEditId])).toEqual([
      ['lint', 'gate · new', 'E3'], ['test', 'gate · new', 'E4'], ['typecheck', 'gate · changed', 'E5'],
    ]);
    expect(ChangeGroupModel.disclosureLabelOf(batchItem.batch, false)).toBe('Show the 3 edits');
    expect(ChangeGroupModel.disclosureLabelOf(batchItem.batch, true)).toBe('Hide the 3 edits');
  });

  test('a set down to one change is an ordinary row', () => {
    const groups = ChangeGroupModel.groupsOf(CHANGES.filter((change) => change.editId !== 'E4' && change.editId !== 'E5'), EDITS, ['admin']);
    expect(groups.find((group) => group.name === 'admin')?.items.map((item) => item.itemKind)).toEqual(['edit', 'edit']);
  });
});

describe('the words of a change inside an entity', () => {
  test('a field a single pipeline holds reads as it does there, and keeps its scoped field', () => {
    const [row] = ChangeGroupModel.changeRowsOf([{ field: 'entity:web/role:builder', changeKind: 'changed', editId: 'E2' }], EDITS);
    expect(row).toMatchObject({
      field: 'entity:web/role:builder', title: 'Builder', location: 'agent step · changed', note: 'User: Example: typecheck bails early.'
    });
  });

  test('the fields only an entity has, and its definition, get their own words', () => {
    const rows = ChangeGroupModel.changeRowsOf([
      { field: 'entity:web/whitelist', changeKind: 'new', editId: null },
      { field: 'entity:web/reach', changeKind: 'changed', editId: null },
      { field: 'entity:web/depends-on', changeKind: 'removed', editId: null },
      { field: 'entity:web/concurrency', changeKind: 'changed', editId: null },
      { field: 'entity:web', changeKind: 'new', editId: null },
    ], []);
    expect(rows.map((row) => [row.title, row.location])).toEqual([
      ['Whitelist', 'packages it may cross into · new'],
      ['Reach', 'root files its builder may change · changed'],
      ['Depends on', 'entities · removed'],
      ['Job cap', 'jobs at once · changed'],
      ['web', 'entity · new'],
    ]);
  });

  test('a copy to two entities gives each entity\'s group its own set, counted and undone by that entity\'s edits alone', () => {
    const copyChanges: readonly BoardPipelineChangeDocument[] = [
      { field: 'entity:api/gate:lint', changeKind: 'new', editId: 'E1' },
      { field: 'entity:api/gate:test', changeKind: 'new', editId: 'E2' },
      { field: 'entity:docs/gate:lint', changeKind: 'new', editId: 'E3' },
      { field: 'entity:docs/gate:test', changeKind: 'new', editId: 'E4' },
    ];
    const copyEdits = copyChanges.map((change) => edit(change.editId ?? '', change.field, 'Copied gates from web', 'E1'));

    const groups = ChangeGroupModel.groupsOf(copyChanges, copyEdits, ['api', 'docs']);

    expect(groups.map((group) => {
      const item = group.items[0];
      if (item?.itemKind !== 'batch') throw new Error(`no batch row for ${group.name}`);
      return [group.name, item.batch.undoLabel, item.batch.undoEditIds, ChangeGroupModel.batchUndoCommandOf('S1', item.batch)];
    })).toEqual([
      ['api', 'Undo all 2', ['E1', 'E2'], {
        boardCommandVersion: 3, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1', wholeBatch: true
      }],
      ['docs', 'Undo all 2', ['E3', 'E4'], {
        boardCommandVersion: 3, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E3', wholeBatch: true
      }],
    ]);
  });

  test('the set\'s one Undo sends pipeline-draft-undo with wholeBatch for the set\'s first edit', () => {
    const batch = {
      batchId: 'E3', title: 'Copied gates from web', editCountText: '2 edits', undoLabel: 'Undo all 2', rows: [], undoEditIds: ['E3', 'E4'],
    };
    expect(ChangeGroupModel.batchUndoCommandOf('S1', batch)).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E3', wholeBatch: true
    });
  });
});
