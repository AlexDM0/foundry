/**
 * The merge step dialog's model, pure: its head for the merge it was opened from (before User's code review, or in the merge train), the
 * line beside its derived meter on who fixes the conflicts, and the edits a Save sends: the merge train's `reReview` and, while it is on,
 * the conflict re-reviewer's settings.
 */
import type { PipelineAirlock }                       from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { DerivedSettingsSource, MergePlacement } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { FlowDraftEdit }                         from '../flow/PipelineFlowModel.ts';
import { AgentStepDialogModel }                       from './AgentStepDialogModel.ts';
import { RereviewSettingsModel, type ReReviewForm }   from './RereviewSettingsModel.ts';

export interface MergeStepHead {
  readonly kicker:      string;
  readonly title:       string;
  readonly description: string;
}

const TITLE = 'Merge main into the tree';

const HEADS: Readonly<Record<Exclude<MergePlacement, 'before-review'>, MergeStepHead>> = Object.freeze({
  'airlock': {
    kicker:      'Merge · Merge train step',
    title:       TITLE,
    description: 'The Airlock merges the latest main into the ticket\'s tree, one ticket at a time, before the merge gates.',
  },
  'before-human-code-review': {
    kicker:      'Review · Merge step',
    title:       TITLE,
    description: 'Merges the latest main into the reviewed tree before User\'s code review; then its gates run again.',
  },
});

const CONFLICT_TEXTS: Readonly<Record<DerivedSettingsSource, string>> = Object.freeze({
  'last-worker': 'Conflicts go to the last worker on the code, resumed in the Airlock with its own model and effort. Change them on that step.',
  'builder':     'Conflicts go to the builder, since no review runs, resumed with its own model and effort. Change them on the Builder step.',
});

const CONFLICT_FIXER_TITLE = 'Conflict fixer';

/** The merge before review has no dialog; any other placement, or none, reads as the merge train's. */
function headOf(placement: MergePlacement | null): MergeStepHead {
  return placement === 'before-human-code-review' ? HEADS['before-human-code-review'] : HEADS.airlock;
}

function conflictTextOf(derivedFrom: DerivedSettingsSource | null): string {
  return CONFLICT_TEXTS[derivedFrom ?? 'last-worker'];
}

function saveEditsOf(airlock: PipelineAirlock | undefined, reReviewForm: ReReviewForm): FlowDraftEdit[] {
  const airlockValue: PipelineAirlock = { ...airlock };
  const reReview = RereviewSettingsModel.reReviewOf(reReviewForm);
  if (reReview === undefined) Reflect.deleteProperty(airlockValue, 'reReview');
  else airlockValue.reReview = reReview;
  return [
    { field: 'airlock', value: airlockValue },
    ...(reReviewForm.isOn ? [AgentStepDialogModel.roleEditOf('conflictReReviewer', reReviewForm.settings)] : []),
  ];
}

export const MergeStepDialogModel = Object.freeze({
  CONFLICT_FIXER_TITLE,
  conflictTextOf,
  headOf,
  saveEditsOf,
});
