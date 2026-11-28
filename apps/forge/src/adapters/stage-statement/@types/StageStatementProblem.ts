import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }                      from '../../@types/JobFileFieldProblem.ts';

/** Why a package stage's statement could not be read. */
export type StageStatementProblem =
  | BaseStoredFileProblem
  | JobFileFieldProblem
  | StoredFileProblem<'not-a-statement-stage'> & { readonly field: 'stage' };
