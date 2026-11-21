/**
 * The conditional re-review's model, pure: its form (on or off, the threshold in lines, and the re-reviewer's own settings), Reset's
 * defaults, the stored `reReview` a form gives, and the words of each place it is set: after the review's fixes, or after a conflict merge.
 */
import type { BoardLimitsDocument }                                                                       from '../../../../@types/board/BoardFactDocuments.ts';
import type { BoardAgentPairDocument, BoardConditionalReReviewDocument, BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { AgentStepDialogModel, type AgentStepDefaults, type AgentStepForm }                               from './AgentStepDialogModel.ts';

/** After the review's fixes (the reviewer's step), or after a conflict merge (the merge step). */
export type ReReviewPlace = 'review' | 'merge';

/** Which part of the card a monorepo level sets: the forge the merge train's switch and threshold, an entity its conflict re-reviewer. */
export type ReReviewLevelPart = 'whole' | 'merge-train' | 'conflict-re-reviewer';

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
  thresholdLead:     'Runs when the fixes change more than',
  offNote:           'Off: the Re-review steps leave the flow, and a large fix goes straight to the gates.',
  scopeNote:         'Applies to the review\'s fixes; the re-review after a conflict merge is set on the merge step.',
  modelLabel:        'Re-review model',
  effortLabel:       'Re-review effort',
  instructionsLabel: 'Re-review brief',
});

const MERGE_PLACE_WORDS: ReReviewWords = Object.freeze({
  title:             'Re-review after a conflict merge',
  subtitle:          'A fresh reviewer checks a large conflict fix before the merge gates.',
  thresholdLead:     'Runs when the conflict fix changes more than',
  offNote:           'Off: the Re-review step leaves the merge train, and a conflict fix goes straight to the merge gates.',
  scopeNote:         null,
  modelLabel:        'Re-review model',
  effortLabel:       'Re-review effort',
  instructionsLabel: 'Re-review brief',
});

/** The re-reviewer of each place. */
const ROLE_OF_PLACE = Object.freeze({ review: 'reReviewer', merge: 'conflictReReviewer' } as const);

/** The re-reviewer's defaults beside the threshold's: the forge's rework threshold, and the step its threshold field moves by, as served. */
export type ReReviewDefaults = AgentStepDefaults & Pick<BoardLimitsDocument, 'reworkRoundThresholdLines' | 'reReviewThresholdStepLines'>;

/** The threshold steps by the served step and never goes under one step. */
function thresholdStepLinesOf(defaults: ReReviewDefaults): number {
  return defaults.reReviewThresholdStepLines;
}

function formOf(
  place: ReReviewPlace,
  reReview: BoardConditionalReReviewDocument | null | undefined,
  draft: BoardPipelineDefinitionDocument | null,
  resolvedSettings: BoardAgentPairDocument | null,
  defaults: ReReviewDefaults,
): ReReviewForm {
  return {
    isOn:           reReview !== null && reReview !== undefined,
    thresholdLines: reReview?.thresholdLines ?? defaults.reworkRoundThresholdLines,
    settings:       AgentStepDialogModel.formOf(ROLE_OF_PLACE[place], draft, resolvedSettings, defaults),
  };
}

/** Reset turns the re-review on at the default threshold, with the re-reviewer's defaults. */
function resetFormOf(place: ReReviewPlace, defaults: ReReviewDefaults): ReReviewForm {
  return { isOn: true, thresholdLines: defaults.reworkRoundThresholdLines, settings: AgentStepDialogModel.resetFormOf(ROLE_OF_PLACE[place], defaults) };
}

/** A form switched off stores none. */
function reReviewOf(form: ReReviewForm): BoardConditionalReReviewDocument | null {
  return form.isOn ? { thresholdLines: form.thresholdLines } : null;
}

function wordsOf(place: ReReviewPlace): ReReviewWords {
  return place === 'review' ? REVIEW_PLACE_WORDS : MERGE_PLACE_WORDS;
}

function roleOf(place: ReReviewPlace): (typeof ROLE_OF_PLACE)[ReReviewPlace] {
  return ROLE_OF_PLACE[place];
}

export const RereviewSettingsModel = Object.freeze({
  thresholdStepLinesOf,
  formOf,
  reReviewOf,
  resetFormOf,
  roleOf,
  wordsOf,
});
