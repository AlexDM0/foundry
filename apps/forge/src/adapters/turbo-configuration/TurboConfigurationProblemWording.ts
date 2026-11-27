import { StoredFileProblemWording }       from '../StoredFileProblemWording.ts';
import type { TurboConfigurationProblem } from './@types/TurboConfigurationProblem.ts';

function sentenceOf(problem: TurboConfigurationProblem): string {
  switch (problem.code) {
    case 'cache-dir-not-a-string':            return 'its "cacheDir" is not a string';
    case 'tasks-not-an-object':               return `its "${problem.field}" is not an object`;
    case 'task-not-an-object':                return `its task "${problem.task}" is not an object`;
    case 'task-inputs-not-a-list-of-strings': return `the "inputs" of its task "${problem.task}" is not a list of strings`;
    default:                                  return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const TurboConfigurationProblemWording = Object.freeze({ sentenceOf });
