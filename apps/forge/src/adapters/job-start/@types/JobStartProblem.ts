import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why `start.json`, a worktree job's start, could not be read. */
export type JobStartProblem = BaseStoredFileProblem | JobFileFieldProblem;
