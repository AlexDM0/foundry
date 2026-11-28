import type { BaseStoredFileProblem, StoredFileProblem } from './StoredFileProblem.ts';

/** The kinds of text a log record's list field holds. */
export type LogListItems =
  | 'ticket-ids'
  | 'epic-keys'
  | 'domains'
  | 'permission-names'
  | 'file-paths'
  | 'gate-names'
  | 'customs-checks'
  | 'setup-item-ids'
  | 'draft-fields';

type FieldProblem<Code extends string> = StoredFileProblem<Code> & { readonly field: string };

/**
 * Why one parsed `log.jsonl` line is no record; `field` is the stored path, such as `fields.claims[0].item`, and `storedValue` the stored
 * value as JSON text, `undefined` when it is missing.
 */
export type LogRecordProblem =
  | StoredFileProblem<'record-not-an-object'>
  | StoredFileProblem<'at-not-text'>
  | StoredFileProblem<'kind-unknown'> & { readonly storedValue: string | undefined }
  | StoredFileProblem<'fields-not-an-object'>
  | FieldProblem<'field-not-text'>
  | FieldProblem<'field-blank'>
  | FieldProblem<'field-not-a-whole-number'>
  | FieldProblem<'field-below-minimum'> & { readonly minimum: number }
  | FieldProblem<'round-below-minimum'> & { readonly minimum: number }
  | FieldProblem<'field-not-a-list'>
  | FieldProblem<'field-not-a-list-of'> & { readonly items: LogListItems }
  | FieldProblem<'field-not-one-of'> & { readonly storedValue: string | undefined; readonly allowedValues: readonly string[] }
  | FieldProblem<'field-not-an-object'>
  | FieldProblem<'model-unknown'> & { readonly storedValue: string | undefined }
  | FieldProblem<'effort-unknown'> & { readonly storedValue: string | undefined }
  | FieldProblem<'field-not-a-flag'>
  | FieldProblem<'field-not-a-cost'>
  | FieldProblem<'field-not-a-chart-range'>
  | FieldProblem<'field-not-an-agent-count'>
  | FieldProblem<'field-not-a-check-command'>
  | FieldProblem<'field-not-a-run-id'>
  | FieldProblem<'field-not-answers'>
  | FieldProblem<'field-not-setup-steps'>
  | FieldProblem<'field-not-pictures'>
  | FieldProblem<'field-not-a-refusal-detail'>
  | FieldProblem<'field-not-cache-reports'>;

/** Why `log.jsonl` could not be read: the file, or one line of it, counted from 1, and what is wrong there. */
export type LogFileProblem = { readonly logFilePath: string; readonly lineNumber?: number } & (BaseStoredFileProblem | LogRecordProblem);
