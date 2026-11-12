/**
 * The review step dialog's model, pure: its words, the edits a Save sends (the reviewer, the re-reviewer while the re-review is on, and the
 * review with or without its `reReview`), and the one edit Remove review sends.
 */
import type { PipelineReview }                      from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { FlowDraftEdit }                       from '../flow/PipelineFlowModel.ts';
import { AgentStepDialogModel, type AgentStepForm } from './AgentStepDialogModel.ts';
import { RereviewSettingsModel, type ReReviewForm } from './RereviewSettingsModel.ts';

const REVIEW_STEP_WORDS = Object.freeze({
  kicker:         'Agent step',
  title:          'Review',
  description:    'Reviews each build that passed its build gates, fixes its findings, and keeps the review gates green. How strict it is comes from its brief.',
  removeLabel:    'Remove review',
  removeQuestion: 'Remove the review step?',
  removeEffect:   'Review, its gates and its re-review leave the flow, with the merge before review; a + offers Review again.',
  removeConfirm:  'Remove',
});

/** The review's name the draft keeps; a review the draft lacks is the default step. */
const DEFAULT_REVIEW_NAME = 'review';

function saveEditsOf(review: PipelineReview | undefined, reviewerForm: AgentStepForm, reReviewForm: ReReviewForm): FlowDraftEdit[] {
  const reReview = RereviewSettingsModel.reReviewOf(reReviewForm);
  const reviewValue: PipelineReview = { name: review?.name ?? DEFAULT_REVIEW_NAME, ...(reReview === undefined ? {} : { reReview }) };
  return [
    AgentStepDialogModel.roleEditOf('reviewer', reviewerForm),
    ...(reReviewForm.isOn ? [AgentStepDialogModel.roleEditOf('reReviewer', reReviewForm.settings)] : []),
    { field: 'review', value: reviewValue },
  ];
}

function removeEditsOf(): FlowDraftEdit[] {
  return [{ field: 'review', value: null }];
}

export const ReviewStepDialogModel = Object.freeze({
  WORDS: REVIEW_STEP_WORDS,
  removeEditsOf,
  saveEditsOf,
});
