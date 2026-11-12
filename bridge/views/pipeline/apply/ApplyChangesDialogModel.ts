/**
 * The model of Apply changes on a running board (A6b), pure: the title that counts the changes, the version line from the applied
 * revision, one row per change worded by what it names, where it is and its kind (a gate by the phases that run it, the constitution as
 * committed to main on Apply), the in-flight note, and the `pipeline-apply` command, which never resumes the board.
 */
import type {
  AppliedPipelineFacts,
  PipelineChange,
  PipelineChangeKind,
  PipelineFlowFacts
} from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetup }      from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody } from '../../../api/CommandClient.ts';
import { ChatTurnWordingUtil }     from '../../../conversation/ChatTurnWordingUtil.ts';
import { ChangeListModel }         from './ChangeListModel.ts';

export interface ApplyChangeRowView {
  readonly field:    PipelineChange['field'];
  readonly change:   PipelineChangeKind;
  readonly title:    string;
  /** Where the change is and its kind, so the row never reads by its colour alone. */
  readonly location: string;
}

const GATE_PREFIX = 'gate:';

const CONSTITUTION_LOCATION = 'CONSTITUTION.md · committed to main on Apply';

/** "Apply 4 changes", the button's label. */
function applyLabelOf(changeCount: number): string {
  return `Apply ${ChatTurnWordingUtil.countTextOf(changeCount, 'change', 'changes')}`;
}

/** "Apply 4 changes?" */
function titleOf(changeCount: number): string {
  return `${applyLabelOf(changeCount)}?`;
}

/** The revision Apply replaces; null for a pipeline that only the `gate` verbs wrote, which no Apply numbered. */
function appliedRevisionOf(pipeline: AppliedPipelineFacts | undefined): number | null {
  if (pipeline?.readingVerdict !== 'readable') return null;
  return pipeline.application?.appliedRevision ?? null;
}

/** "Version 1 becomes version 2. Everything else stays as it is." */
function versionLineOf(appliedRevision: number | null): string {
  const becomes = appliedRevision === null ? 'The pipeline becomes version 1.' : `Version ${appliedRevision} becomes version ${appliedRevision + 1}.`;
  return `${becomes} Everything else stays as it is.`;
}

function changeRowsOf(changeList: readonly PipelineChange[], flow: PipelineFlowFacts | null): ApplyChangeRowView[] {
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

/** "2 tickets are in flight." */
function inFlightLeadOf(ticketCount: number): string {
  return ticketCount === 1 ? '1 ticket is in flight.' : `${ticketCount} tickets are in flight.`;
}

/** "Each takes version 2 at its next gate run; a run already started finishes on version 1." */
function inFlightTextOf(appliedRevision: number | null): string {
  if (appliedRevision === null) return 'Each takes the new pipeline at its next gate run; a run already started finishes on the current one.';
  return `Each takes version ${appliedRevision + 1} at its next gate run; a run already started finishes on version ${appliedRevision}.`;
}

function applyCommandOf(record: PipelineSetup): ControlCommandBody {
  return {
    kind: 'pipeline-apply', setupId: record.setupId, draftRevision: record.draftRevision, resumesBoard: false,
  };
}

export const ApplyChangesDialogModel = Object.freeze({
  titleOf,
  applyLabelOf,
  appliedRevisionOf,
  versionLineOf,
  changeRowsOf,
  inFlightLeadOf,
  inFlightTextOf,
  applyCommandOf,
});
