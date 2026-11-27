import type { OptionNotesProblem }                       from '../../domain/tracker-model/utils/OptionConsequencesUtil.ts';
import type { BaseStoredFileProblem, StoredFileProblem } from './StoredFileProblem.ts';

/** What a stored field of `progress.json` must hold, as the check its validation makes. */
export type ProgressFieldExpectation =
  | 'a-string'
  | 'a-timestamp'
  | 'an-object'
  | 'an-array'
  | 'a-list'
  | 'a-whole-number'
  | 'true-or-false'
  | 'a-stored-range-shape'
  | 'a-list-of-ticket-ids'
  | 'a-list-of-request-ids'
  | 'a-list-of-text'
  | 'a-list-of-ticket-id-lists'
  | 'a-list-of-answers'
  | 'a-list-of-pictures'
  | 'an-object-of-text'
  | 'a-key-of-a-question-anchor'
  | 'a-whole-number-of-at-least-its-from'
  | 'a-ticket-id'
  | 'a-job-id'
  | 'a-request-id'
  | 'a-branch'
  | 'a-path'
  | 'a-whole-number-of-tokens'
  | 'an-entity-key'
  | 'the-key-of-the-claim-that-started-it'
  | 'the-id-of-the-ticket-it-reviews'
  | 'a-hash'
  | 'a-record-of-entity-hashes'
  | 'a-tree'
  | 'true'
  | 'a-gate-phase'
  | 'a-ticket-stage'
  | 'a-record-of-package-seals'
  | 'a-list-of-task-phases';

/** A stored value a present field must be, as its problem names it with the value it holds. */
export type ProgressPresentValueExpectation = 'one-of-the-hephaestus-states' | 'a-timestamp' | 'a-branch-namespace';

/** A list of stored words a field must hold one of; the wording names the list's words. */
export type ProgressVocabulary =
  | 'task-status'
  | 'job-kind'
  | 'job-state'
  | 'interruption-cause'
  | 'airlock-phase'
  | 'job-stop-mode'
  | 'job-not-launched-cause'
  | 'job-outcome'
  | 'decision-kind'
  | 'decision-asker'
  | 'ticket-document-kind'
  | 'comment-view'
  | 'incident-kind'
  | 'incident-move';

/** How a whole number a field holds is counted: a number, or a review round. */
export type ProgressWholeNumberUnit = 'whole-number' | 'whole-round';

/**
 * Why `progress.json` could not be read, `field` the offending field's path (`jobs[0].eventCursor.instance`). `storedJson` is the stored
 * value as JSON text, `undefined` when the field is absent.
 */
export type ProgressFileProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'document-not-a-json-object'>
  | StoredFileProblem<'version-not-read'> & { readonly field: 'version'; readonly storedJson: string; readonly readVersion: number }
  | StoredFileProblem<'field-is-not'> & { readonly field: string; readonly expected: ProgressFieldExpectation }
  | StoredFileProblem<'field-is-neither-nor-null'> & { readonly field: string; readonly expected: ProgressFieldExpectation }
  | StoredFileProblem<'field-is-neither-null-nor-an-object'> & { readonly field: string }
  | StoredFileProblem<'present-field-is-not'> & { readonly field: string; readonly expected: ProgressFieldExpectation }
  | StoredFileProblem<'present-field-is-not-at-least'> & { readonly field: string; readonly unit: ProgressWholeNumberUnit; readonly least: number }
  | StoredFileProblem<'field-is-not-at-least'> & { readonly field: string; readonly least: number }
  | StoredFileProblem<'present-and-field-is-not'> & { readonly field: string; readonly expected: ProgressFieldExpectation }
  | StoredFileProblem<'present-and-field-is-not-at-least'> & { readonly field: string; readonly unit: ProgressWholeNumberUnit; readonly least: number }
  | StoredFileProblem<'counter-below-first'> & { readonly field: string; readonly storedJson: string; readonly least: number }
  | StoredFileProblem<'present-counter-below-first'> & { readonly field: string; readonly storedJson: string; readonly least: number }
  | StoredFileProblem<'present-value-is-not'> & { readonly field: string; readonly storedJson: string; readonly expected: ProgressPresentValueExpectation }
  | StoredFileProblem<'not-in-vocabulary'> & { readonly field: string; readonly storedJson: string; readonly vocabulary: ProgressVocabulary }
  | StoredFileProblem<'neither-null-nor-a-job-role'> & { readonly field: string; readonly storedJson: string }
  | StoredFileProblem<'not-a-numbered-id'> & { readonly field: string; readonly storedJson: string; readonly prefix: string }
  | StoredFileProblem<'retired-pipeline-key'> & { readonly field: string }
  | StoredFileProblem<'retired-row-check-command'> & { readonly field: string }
  | StoredFileProblem<'log-kept-in-document'> & { readonly field: 'log'; readonly documentVersion: number }
  | StoredFileProblem<'malformed-option-note'> & { readonly field: string; readonly noteField: string; readonly noteProblem: OptionNotesProblem }
  | StoredFileProblem<'malformed-option-facts'> & { readonly field: string }
  | StoredFileProblem<'document-without-anchor'> & { readonly field: string };
