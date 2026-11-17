/**
 * The merge step dialog's model, pure: its head for the merge it was opened from (before User's code review, or in the merge train), the
 * line beside its derived meter on who fixes the conflicts, and the edits a Save sends: the merge train's `reReview` and, while it is on,
 * the conflict re-reviewer's settings; in monorepo mode, only the part the level sets.
 */
import type { PipelineAirlock }                                             from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { DerivedSettingsSource, MergePlacement }                       from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { PipelineLevelModel, type PipelineLevel }                           from '../entities/PipelineLevelModel.ts';
import type { FlowDraftEdit }                                               from '../flow/PipelineFlowModel.ts';
import { AgentStepDialogModel }                                             from './AgentStepDialogModel.ts';
import { RereviewSettingsModel, type ReReviewForm, type ReReviewLevelPart } from './RereviewSettingsModel.ts';

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

/** The forge's part is the merge train alone, an entity's the conflict re-reviewer alone, while the forge has the re-review on. */
function saveEditsOf(airlock: PipelineAirlock | undefined, reReviewForm: ReReviewForm, levelPart: ReReviewLevelPart = 'whole'): FlowDraftEdit[] {
  const airlockValue: PipelineAirlock = { ...airlock };
  const reReview = RereviewSettingsModel.reReviewOf(reReviewForm);
  if (reReview === undefined) Reflect.deleteProperty(airlockValue, 'reReview');
  else airlockValue.reReview = reReview;
  const airlockEdits: FlowDraftEdit[] = levelPart === 'conflict-re-reviewer' ? [] : [{ field: 'airlock', value: airlockValue }];
  const reReviewerEdits = reReviewForm.isOn && levelPart !== 'merge-train' ? [AgentStepDialogModel.roleEditOf('conflictReReviewer', reReviewForm.settings)] : [];
  return [...airlockEdits, ...reReviewerEdits];
}

/** The forge sets the merge train's part, an entity its conflict re-reviewer; single mode sets the whole step. */
function levelPartOf(level: PipelineLevel | null): ReReviewLevelPart {
  if (level === null) return 'whole';
  return PipelineLevelModel.isForgeLevel(level) ? 'merge-train' : 'conflict-re-reviewer';
}

export const MergeStepDialogModel = Object.freeze({
  levelPartOf,
  CONFLICT_FIXER_TITLE,
  conflictTextOf,
  headOf,
  saveEditsOf,
});
