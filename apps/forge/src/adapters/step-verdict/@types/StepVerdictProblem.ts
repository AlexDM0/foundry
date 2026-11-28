import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why a gate run step's verdict could not be read. */
export type StepVerdictProblem = BaseStoredFileProblem | JobFileFieldProblem;
