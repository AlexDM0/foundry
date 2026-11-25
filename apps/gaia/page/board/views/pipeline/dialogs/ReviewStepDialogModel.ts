/**
 * The review step dialog's model, pure: its words and tabs, the edits a Save sends (the reviewer, the re-reviewer while the re-review is on, and the
 * review with or without its `reReview`), and the one edit Remove review sends.
 */
import type { BoardDraftEditDocument, BoardPipelineReviewDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { AgentStepDialogModel, type AgentStepForm }                 from './AgentStepDialogModel.ts';
import type { DocumentReadingDefaults }                             from './PipelineDocumentsSectionModel.ts';
import { RereviewSettingsModel, type ReReviewForm }                 from './RereviewSettingsModel.ts';

const REVIEW_STEP_WORDS = Object.freeze({
  kicker:         'Review · Agent step',
  tabsLabel:      'Review settings',
  reviewTab:      'Review',
  reReviewTab:    'Re-review',
  reReviewLead:   'A second, fresh reviewer that runs only when the review\'s own fixes are large. Then the review gates run again.',
  title:          'Review',
  description:    'Reviews each build that passed its build gates, fixes its findings, and keeps the review gates green. How strict it is comes from its brief.',
  removeLabel:    'Remove review',
  removeQuestion: 'Remove the review step?',
  removeEffect:   'Review, its gates and its re-review leave the flow, with the merge before review; a + offers Review again.',
  removeConfirm:  'Remove',
});

/** The dialog's two tabs: the reviewer's own settings, and the conditional re-review after its fixes. */
export type ReviewStepTab = 'review' | 're-review';

/** The review's name the draft keeps; a review the draft lacks is the default step. */
const DEFAULT_REVIEW_NAME = 'review';

function saveEditsOf(
  review: BoardPipelineReviewDocument | null | undefined, reviewerForm: AgentStepForm, reReviewForm: ReReviewForm, defaults: DocumentReadingDefaults
): BoardDraftEditDocument[] {
  const reviewValue: BoardPipelineReviewDocument = { name: review?.name ?? DEFAULT_REVIEW_NAME, reReview: RereviewSettingsModel.reReviewOf(reReviewForm) };
  return [
    AgentStepDialogModel.roleEditOf('reviewer', reviewerForm, defaults),
    ...(reReviewForm.isOn ? [AgentStepDialogModel.roleEditOf('reReviewer', reReviewForm.settings, defaults)] : []),
    { target: 'review', value: reviewValue },
  ];
}

function removeEditsOf(): BoardDraftEditDocument[] {
  return [{ target: 'review', value: null }];
}

export const ReviewStepDialogModel = Object.freeze({
  WORDS: REVIEW_STEP_WORDS,
  removeEditsOf,
  saveEditsOf,
});
