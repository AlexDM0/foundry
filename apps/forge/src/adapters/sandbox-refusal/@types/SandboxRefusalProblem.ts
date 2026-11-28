import type { BaseStoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';
import type { JobFileFieldProblem }   from '../../@types/JobFileFieldProblem.ts';

/** Why the record of a refused confinement could not be read. */
export type SandboxRefusalProblem = BaseStoredFileProblem | JobFileFieldProblem;
