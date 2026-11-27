/**
 * The model of Apply changes on a running board, pure: the title, the version line, one row per change, the in-flight note and the
 * `pipeline-apply` command, which never resumes the board. Over entities the rows group by level, the forge first.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardAppliedPipelineDocument,
  BoardPipelineChangeDocument,
  BoardPipelineFlowDocument,
  BoardSetupRecordDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardChangeKind }                   from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                          from '../../../../shared/utils/CountTextUtil.ts';
import { ChangeGroupModel, type ChangeGroupView } from '../entities/ChangeGroupModel.ts';
import { ChangeListModel }                        from './ChangeListModel.ts';

export interface ApplyChangeRowView {
  readonly field:    BoardPipelineChangeDocument['field'];
  readonly change:   BoardChangeKind;
  readonly title:    string;
  /** Where the change is and its kind, so the row never reads by its colour alone. */
  readonly location: string;
}

const GATE_PREFIX = 'gate:';

const CONSTITUTION_LOCATION = 'CONSTITUTION.md · committed to main on Apply';

/** "Apply 4 changes", the button's label. */
function applyLabelOf(changeCount: number): string {
  return `Apply ${CountTextUtil.countedPhrase(changeCount, 'change', 'changes')}`;
}

/** "Apply 4 changes?" */
function titleOf(changeCount: number): string {
  return `${applyLabelOf(changeCount)}?`;
}

/** The revision Apply replaces; null for a pipeline that only the `gate` verbs wrote, which no Apply numbered. */
function appliedRevisionOf(pipeline: BoardAppliedPipelineDocument | undefined): number | null {
  if (pipeline?.readingVerdict !== 'readable') return null;
  return pipeline.application?.appliedRevision ?? null;
}

/** "Version 1 becomes version 2. Everything else stays as it is." */
function versionLineOf(appliedRevision: number | null): string {
  const becomes = appliedRevision === null ? 'The pipeline becomes version 1.' : `Version ${appliedRevision} becomes version ${appliedRevision + 1}.`;
  return `${becomes} Everything else stays as it is.`;
}

function changeRowsOf(changeList: readonly BoardPipelineChangeDocument[], flow: BoardPipelineFlowDocument | null): ApplyChangeRowView[] {
  return changeList.map((change) => {
    const words = ChangeListModel.fieldWordsOf(change.field);
    if (change.field === 'constitution') return {
      field: change.field, change: change.changeKind, title: words.title, location: CONSTITUTION_LOCATION
    };
    const place = change.field.startsWith(GATE_PREFIX) ? ChangeListModel.gateLocationOf(words.title, flow) : words.place;
    return {
      field: change.field, change: change.changeKind, title: words.title, location: `${place} · ${change.changeKind}`,
    };
  });
}

/** The record and the stored pipeline a grouped list reads: whether either holds entities, and the draft's order of them. */
export interface LevelGroupingFacts {
  readonly record:   Pick<BoardSetupRecordDocument, 'draft' | 'edits'>;
  readonly pipeline: BoardAppliedPipelineDocument | undefined;
}

/** The entities in the draft's order, else the stored pipeline's; none in single mode. */
function entityOrderOf({ record, pipeline }: LevelGroupingFacts): string[] {
  const storedEntities = pipeline?.readingVerdict === 'readable' ? pipeline.pipeline.entities : undefined;
  return Object.keys(record.draft?.entities ?? storedEntities ?? {});
}

/** The rows grouped by level over entities, the forge's constitution as committed to main on Apply; null in single mode. */
function levelGroupsOf(changeList: readonly BoardPipelineChangeDocument[], { record, pipeline }: LevelGroupingFacts): ChangeGroupView[] | null {
  const draftEntities = record.draft?.entities ?? null;
  const storedEntities = pipeline?.readingVerdict === 'readable' ? pipeline.pipeline.entities : null;
  if (draftEntities === null && storedEntities === null) return null;
  const groups = ChangeGroupModel.groupsOf(changeList, record.edits, Object.keys(draftEntities ?? storedEntities ?? {}));
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => (item.itemKind === 'edit' && item.row.field === 'constitution'
      ? { itemKind: 'edit', row: { ...item.row, location: CONSTITUTION_LOCATION } }
      : item)),
  }));
}

/** "2 tickets are in flight." */
function inFlightLeadOf(ticketCount: number): string {
  return CountTextUtil.countedPhrase(ticketCount, 'ticket is in flight.', 'tickets are in flight.');
}

/** "Each takes version 2 at its next gate run; a run already started finishes on version 1." */
function inFlightTextOf(appliedRevision: number | null): string {
  if (appliedRevision === null) return 'Each takes the new pipeline at its next gate run; a run already started finishes on the current one.';
  return `Each takes version ${appliedRevision + 1} at its next gate run; a run already started finishes on version ${appliedRevision}.`;
}

function applyCommandOf(record: BoardSetupRecordDocument): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-apply', setupId: record.setupId, draftRevision: record.draftRevision, resumesBoard: false,
  };
}

export const ApplyChangesDialogModel = Object.freeze({
  titleOf,
  applyLabelOf,
  appliedRevisionOf,
  versionLineOf,
  changeRowsOf,
  levelGroupsOf,
  entityOrderOf,
  inFlightLeadOf,
  inFlightTextOf,
  applyCommandOf,
});
