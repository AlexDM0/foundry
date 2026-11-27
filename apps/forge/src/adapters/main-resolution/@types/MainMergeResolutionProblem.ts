import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why a `merging-main` round's `main-resolution.json`, could not be read. */
export type MainMergeResolutionProblem = BaseStoredFileProblem | JobFileFieldProblem;
