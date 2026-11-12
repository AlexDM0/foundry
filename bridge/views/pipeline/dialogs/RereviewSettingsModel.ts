/**
 * The conditional re-review's model, pure: its form (on or off, the threshold in lines, and the re-reviewer's own settings), Reset's
 * defaults, the stored `reReview` a form gives, and the words of each place it is set: after the review's fixes, or after a conflict merge.
 */
import type { ConditionalReReview, Pipeline }       from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { AgentPair }                           from '../../../../src/lib/tracker-model/@types/Ticket.ts';
import { RE_REVIEW_THRESHOLD_STEP_LINES }           from '../../../../src/lib/tracker-model/constants/PipelineDefaults.ts';
import { DISPATCH_PROTOCOL }                        from '../../../../src/shared/constants/DispatchProtocol.ts';
import { AgentStepDialogModel, type AgentStepForm } from './AgentStepDialogModel.ts';

/** After the review's fixes (the reviewer's step), or after a conflict merge (the merge step). */
export type ReReviewPlace = 'review' | 'merge';

export interface ReReviewForm {
  readonly isOn:           boolean;
  readonly thresholdLines: number;
  readonly settings:       AgentStepForm;
}

export interface ReReviewWords {
  readonly title:             string;
  readonly subtitle:          string;
  readonly thresholdLead:     string;
  readonly offNote:           string;
  /** Under the settings while on; null where the dialog needs none. */
  readonly scopeNote:         string | null;
  readonly modelLabel:        string;
  readonly effortLabel:       string;
  readonly instructionsLabel: string;
}

const REVIEW_PLACE_WORDS: ReReviewWords = Object.freeze({
  title:             'Re-review',
  subtitle:          'A fresh reviewer checks large fixes, then the gates run again.',
  thresholdLead:     'When a fix changes more than',
  offNote:           'Off: the Re-review steps leave the flow, and a large fix goes straight to the gates.',
  scopeNote:         'Applies to the review\'s fixes; the re-review after a conflict merge is set on the merge step.',
  modelLabel:        'Re-review model',
  effortLabel:       'Re-review effort',
  instructionsLabel: 'Re-review instructions',
});

const MERGE_PLACE_WORDS: ReReviewWords = Object.freeze({
  title:             'Re-review after a conflict merge',
  subtitle:          'A fresh reviewer checks a large conflict fix before the merge gates.',
  thresholdLead:     'When the conflict fix changes more than',
  offNote:           'Off: the Re-review step leaves the merge train, and a conflict fix goes straight to the merge gates.',
  scopeNote:         null,
  modelLabel:        'Re-review model',
  effortLabel:       'Re-review effort',
  instructionsLabel: 'Re-review instructions',
});

/** The re-reviewer of each place. */
const ROLE_OF_PLACE = Object.freeze({ review: 'reReviewer', merge: 'conflictReReviewer' } as const);

/** The threshold steps by this many lines and never goes under one step. */
const THRESHOLD_STEP_LINES = RE_REVIEW_THRESHOLD_STEP_LINES;

const THRESHOLD_MINIMUM_LINES = RE_REVIEW_THRESHOLD_STEP_LINES;

const DEFAULT_THRESHOLD_LINES = DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES;

function formOf(place: ReReviewPlace, reReview: ConditionalReReview | undefined, draft: Pipeline | null, resolvedSettings: AgentPair | null): ReReviewForm {
  return {
    isOn:           reReview !== undefined,
    thresholdLines: reReview?.thresholdLines ?? DEFAULT_THRESHOLD_LINES,
    settings:       AgentStepDialogModel.formOf(ROLE_OF_PLACE[place], draft, resolvedSettings),
  };
}

/** Reset turns the re-review on at the default threshold, with the re-reviewer's defaults. */
function resetFormOf(place: ReReviewPlace): ReReviewForm {
  return { isOn: true, thresholdLines: DEFAULT_THRESHOLD_LINES, settings: AgentStepDialogModel.resetFormOf(ROLE_OF_PLACE[place]) };
}

/** Present means on; a form switched off stores none. */
function reReviewOf(form: ReReviewForm): ConditionalReReview | undefined {
  return form.isOn ? { thresholdLines: form.thresholdLines } : undefined;
}

function wordsOf(place: ReReviewPlace): ReReviewWords {
  return place === 'review' ? REVIEW_PLACE_WORDS : MERGE_PLACE_WORDS;
}

function roleOf(place: ReReviewPlace): (typeof ROLE_OF_PLACE)[ReReviewPlace] {
  return ROLE_OF_PLACE[place];
}

export const RereviewSettingsModel = Object.freeze({
  THRESHOLD_STEP_LINES,
  THRESHOLD_MINIMUM_LINES,
  formOf,
  reReviewOf,
  resetFormOf,
  roleOf,
  wordsOf,
});
