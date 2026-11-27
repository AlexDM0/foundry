import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why a red handoff's facts could not be read. */
export type RedHandoffProblem = BaseStoredFileProblem | JobFileFieldProblem;
