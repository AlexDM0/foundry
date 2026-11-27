import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why a `merging-main` round's `main-conflict.json`, could not be read. */
export type MainMergeConflictProblem = BaseStoredFileProblem | JobFileFieldProblem;
