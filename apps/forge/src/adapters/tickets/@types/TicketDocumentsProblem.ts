import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

type FieldProblem<Code extends string> = StoredFileProblem<Code> & { readonly field: string };

/** Why a ticket's documents record, `record.json`, could not be read; `field` is the stored path, such as `documents[0].versions[1].number`. */
export type TicketDocumentsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'record-file-missing'>
  | StoredFileProblem<'record-not-an-object'>
  | StoredFileProblem<'record-version-differs'> & { readonly field: 'version'; readonly expectedVersion: number }
  | FieldProblem<'field-not-an-object'>
  | FieldProblem<'field-not-text'>
  | FieldProblem<'field-not-a-whole-number'>
  | FieldProblem<'field-not-a-list'>
  | FieldProblem<'field-not-one-of'> & { readonly allowedValues: readonly string[] }
  | FieldProblem<'field-not-true'>
  | FieldProblem<'kind-held-twice'>;
