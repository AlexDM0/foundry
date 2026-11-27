import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }                      from '../../@types/JobFileFieldProblem.ts';

/** Why a snapshot agent's start could not be read. */
export type SnapshotStartProblem =
  | BaseStoredFileProblem
  | JobFileFieldProblem
  | StoredFileProblem<'start-commit-not-a-commit'> & { readonly field: 'startCommit' };
