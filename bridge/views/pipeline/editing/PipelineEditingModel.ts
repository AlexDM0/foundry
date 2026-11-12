/**
 * The model of editing an applied pipeline (A6Editing), pure: the footer's count of the changes with the version they make, the note
 * that the board keeps its version until Apply, what a change card reads from the applied and the draft pipeline, and the commands of
 * Ask the pipeline agent to check and Discard.
 */
import type { ControlCommandBody } from '../../../api/CommandClient.ts';
import { ChatTurnWordingUtil }     from '../../../conversation/ChatTurnWordingUtil.ts';
import type { PipelineViewFacts }  from '../PipelineViewModel.ts';
import type { ChangeListEditing }  from '../apply/ChangeListModel.ts';

/** "4 changes · version 2 → 3"; only the count for a pipeline that no Apply numbered. */
function footerSummaryOf(changeCount: number, appliedRevision: number | null): string {
  const countText = ChatTurnWordingUtil.countTextOf(changeCount, 'change', 'changes');
  return appliedRevision === null ? countText : `${countText} · version ${appliedRevision} → ${appliedRevision + 1}`;
}

/** "The board keeps running on version 2 until Apply." */
function boardNoteOf(appliedRevision: number | null): string {
  const version = appliedRevision === null ? 'the applied pipeline' : `version ${appliedRevision}`;
  return `The board keeps running on ${version} until Apply.`;
}

/** What the change cards read beside the change list: the flow, the applied pipeline, the draft and the profile runs. */
function changeListEditingOf(facts: PipelineViewFacts): ChangeListEditing | null {
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  return {
    flow,
    base:        facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null,
    draft:       facts.pipelineSetup?.record.draft ?? null,
    profileRuns: facts.profileRuns ?? [],
  };
}

function checkCommandOf(setupId: string): ControlCommandBody {
  return { kind: 'pipeline-check', setupId };
}

function discardCommandOf(setupId: string): ControlCommandBody {
  return { kind: 'pipeline-draft-discard', setupId };
}

export const PipelineEditingModel = Object.freeze({
  footerSummaryOf,
  boardNoteOf,
  changeListEditingOf,
  checkCommandOf,
  discardCommandOf,
});
