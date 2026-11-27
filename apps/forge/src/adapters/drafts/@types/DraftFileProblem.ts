import type { RecordFileReadProblem }                    from '../../../shared/@types/RecordFileReadProblem.ts';
import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

type FieldProblem<Code extends string, Field extends string> = StoredFileProblem<Code> & { readonly field: Field };

/** Why a draft file could not be read; `storedValue` is the stored value as JSON text, `null` when the key is missing. */
export type DraftFileProblem =
  | RecordFileReadProblem
  | Extract<BaseStoredFileProblem, { code: 'not-json' }>
  | StoredFileProblem<'document-not-a-json-object'>
  | FieldProblem<'version-not-read', 'version'> & { readonly storedValue: string | null; readonly readVersion: number }
  | FieldProblem<'not-a-draft-id', 'id'> & { readonly storedValue: string | null }
  | FieldProblem<'title-blank', 'title'>
  | FieldProblem<'request-not-text', 'request'>
  | FieldProblem<'opened-at-not-a-timestamp', 'openedAt'>
  | FieldProblem<'claim-malformed', 'claim'>
  | FieldProblem<'notes-malformed', 'notes'>
  | FieldProblem<'questions-malformed', 'questions'>
  | StoredFileProblem<'item-numbers-below-first'> & { readonly firstItemNumber: number }
  | FieldProblem<'entity-not-an-entity-key', 'entity'>
  | FieldProblem<'crosses-malformed', 'crosses'>;
