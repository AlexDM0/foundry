import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why a review's target conflict could not be read. */
export type TargetConflictProblem = BaseStoredFileProblem | JobFileFieldProblem;
