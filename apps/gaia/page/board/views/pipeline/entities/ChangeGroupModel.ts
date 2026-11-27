/**
 * The Changes list grouped by level, pure: the forge first, then each entity in the rail's order. The edits sharing a `batch` stand as one
 * row whose undo takes back the copy's edits at that level only; a change inside an entity is worded as the same field of a single pipeline.
 */
import { PAGE_CONTRACT_VERSIONS }                                   from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                                from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardPipelineChangeDocument, BoardSetupEditDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardChangeKind }                                     from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                            from '../../../../shared/utils/CountTextUtil.ts';
import { ChangeListModel, type ChangeRowView, type FieldWords }     from '../apply/ChangeListModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel }      from './PipelineLevelModel.ts';

/** The changes one copy made, undone at once or one by one. */
export interface ChangeBatchView {
  readonly batchId:       string;
  /** The copy's own sentence, from the set's first edit. */
  readonly title:         string;
  readonly editCountText: string;
  readonly undoLabel:     string;
  readonly rows:          readonly ChangeRowView[];
  /** The edits the set's undo takes back, in the order made. */
  readonly undoEditIds:   readonly string[];
}

export type ChangeGroupItem =
  | { readonly itemKind: 'edit'; readonly row: ChangeRowView }
  | { readonly itemKind: 'batch'; readonly batch: ChangeBatchView };

export interface ChangeGroupView {
  readonly level:       PipelineLevel;
  readonly name:        string;
  readonly changeCount: number;
  /** The head's name for a screen reader: "admin, 4 changes". */
  readonly headName:    string;
  readonly items:       readonly ChangeGroupItem[];
}

type EntityOnlyField = Exclude<string, string>;

const ENTITY_ONLY_FIELD_WORDS: Readonly<Record<EntityOnlyField, FieldWords>> = Object.freeze({
  'whitelist':   { title: 'Whitelist', place: 'packages it may cross into' },
  'reach':       { title: 'Reach', place: 'root files its builder may change' },
  'depends-on':  { title: 'Depends on', place: 'entities' },
  'concurrency': { title: 'Job cap', place: 'jobs at once' },
});

const CHANGE_WORDS: Readonly<Record<BoardChangeKind, string>> = Object.freeze({ changed: 'changed', new: 'new', removed: 'removed' });

const ENTITY_DEFINITION_PLACE = 'entity';

const BATCH_TITLE_WITHOUT_SENTENCE = 'A copy from another entity';

const SMALLEST_BATCH_CHANGE_COUNT = 2;

function isEntityOnlyField(field: string | string): field is EntityOnlyField {
  return Object.hasOwn(ENTITY_ONLY_FIELD_WORDS, field);
}

/** The words of a field only an entity has, or of its definition; `null` for a field a single pipeline also holds. */
function entityFieldWordsOf(field: string): FieldWords | null {
  const fieldWithinEntity = PipelineLevelModel.fieldWithinEntityOf(field);
  const level = PipelineLevelModel.levelOfField(field);
  if (fieldWithinEntity === null) return { title: PipelineLevelModel.levelNameOf(level), place: ENTITY_DEFINITION_PLACE };
  return level.kind === 'entity' && isEntityOnlyField(fieldWithinEntity) ? ENTITY_ONLY_FIELD_WORDS[fieldWithinEntity] : null;
}

/** Each change worded as its field inside the entity, then the fields only an entity has worded on their own. */
function changeRowsOf(changes: readonly BoardPipelineChangeDocument[], edits: readonly BoardSetupEditDocument[]): ChangeRowView[] {
  const changesWithinLevel = changes.map((change) => {
    const fieldWithinEntity = PipelineLevelModel.fieldWithinEntityOf(change.field);
    return fieldWithinEntity === null || isEntityOnlyField(fieldWithinEntity) ? change : { ...change, field: fieldWithinEntity };
  });
  return ChangeListModel.changeRowsOf(changesWithinLevel, edits).map((row, i) => {
    const change = changes[i];
    if (change === undefined) return row;
    const words = entityFieldWordsOf(change.field);
    const reworded = words === null ? row : { ...row, title: words.title, location: `${words.place} · ${CHANGE_WORDS[change.changeKind]}` };
    return { ...reworded, field: change.field };
  });
}

function batchOf(change: BoardPipelineChangeDocument, edits: readonly BoardSetupEditDocument[]): string | null {
  if (change.editId === null) return null;
  return edits.find((edit) => edit.editId === change.editId)?.batch ?? null;
}

function batchTitleOf(batchId: string, edits: readonly BoardSetupEditDocument[]): string {
  const firstEdit = edits.find((edit) => edit.batch === batchId);
  const sentence = firstEdit?.summary.trim() ?? '';
  return sentence === '' ? BATCH_TITLE_WITHOUT_SENTENCE : sentence;
}

function batchViewOf(batchId: string, rows: readonly ChangeRowView[], edits: readonly BoardSetupEditDocument[]): ChangeBatchView {
  return {
    batchId,
    title:         batchTitleOf(batchId, edits),
    editCountText: `${rows.length} edits`,
    undoLabel:     `Undo all ${rows.length}`,
    rows,
    undoEditIds:   rows.flatMap((row) => (row.undoEditId === null ? [] : [row.undoEditId])),
  };
}

function itemsOf(changes: readonly BoardPipelineChangeDocument[], edits: readonly BoardSetupEditDocument[]): ChangeGroupItem[] {
  const rows = changeRowsOf(changes, edits);
  const batches = changes.map((change) => batchOf(change, edits));
  const items: ChangeGroupItem[] = [];
  rows.forEach((row, i) => {
    const batchId = batches[i] ?? null;
    const batchRows = batchId === null ? [] : rows.filter((candidate) => batches[rows.indexOf(candidate)] === batchId);
    if (batchId === null || batchRows.length < SMALLEST_BATCH_CHANGE_COUNT) {
      items.push({ itemKind: 'edit', row });
      return;
    }
    if (batches.indexOf(batchId) === i) items.push({ itemKind: 'batch', batch: batchViewOf(batchId, batchRows, edits) });
  });
  return items;
}

/** The levels in their order: the forge, then the entities in the rail's order, then any other entity a change names, as first named. */
function levelsInOrderOf(changes: readonly BoardPipelineChangeDocument[], entityKeysInOrder: readonly string[]): PipelineLevel[] {
  const namedKeys = changes.flatMap((change) => {
    const level = PipelineLevelModel.levelOfField(change.field);
    return level.kind === 'entity' ? [level.key] : [];
  });
  const keys = [...new Set([...entityKeysInOrder.filter((key) => namedKeys.includes(key)), ...namedKeys])];
  return [FORGE_LEVEL, ...keys.map((key) => PipelineLevelModel.entityLevelOf(key))];
}

function groupsOf(changes: readonly BoardPipelineChangeDocument[], edits: readonly BoardSetupEditDocument[], entityKeysInOrder: readonly string[]): ChangeGroupView[] {
  return levelsInOrderOf(changes, entityKeysInOrder).flatMap((level) => {
    const levelChanges = changes.filter((change) => PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(change.field), level));
    if (levelChanges.length === 0) return [];
    return [{
      level,
      name:        PipelineLevelModel.levelNameOf(level),
      changeCount: levelChanges.length,
      headName:    `${PipelineLevelModel.levelNameOf(level)}, ${CountTextUtil.countedPhrase(levelChanges.length, 'change', 'changes')}`,
      items:       itemsOf(levelChanges, edits),
    }];
  });
}

/** "Show the 4 edits" while the set is folded, "Hide the 4 edits" while it is open. */
function disclosureLabelOf(batch: ChangeBatchView, isOpen: boolean): string {
  return `${isOpen ? 'Hide' : 'Show'} the ${batch.rows.length} edits`;
}

/**
 * The set's one Undo, named by the set's first edit at this level: Hephaestus undoes every edit of the copy at that level that still
 * stands, at one revision, so a copy to several entities is undone one entity at a time.
 */
function batchUndoCommandOf(setupId: string, batch: ChangeBatchView): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-draft-undo', setupId, editId: batch.undoEditIds[0] ?? batch.batchId, wholeBatch: true,
  };
}

export const ChangeGroupModel = Object.freeze({
  groupsOf, changeRowsOf, disclosureLabelOf, batchUndoCommandOf,
});
