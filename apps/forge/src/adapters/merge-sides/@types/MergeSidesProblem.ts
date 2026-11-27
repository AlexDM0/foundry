import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why the record of a merge's two sides could not be read. */
export type MergeSidesProblem = BaseStoredFileProblem | JobFileFieldProblem;
