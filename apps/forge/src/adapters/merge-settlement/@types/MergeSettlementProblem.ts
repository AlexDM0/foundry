import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }                      from '../../@types/JobFileFieldProblem.ts';

/** Why a merge settlement could not be read. */
export type MergeSettlementProblem =
  | BaseStoredFileProblem
  | JobFileFieldProblem
  | StoredFileProblem<'not-a-settlement'> & { readonly field: 'verdict' };
