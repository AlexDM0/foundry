import { StoredFileProblemWordingUtil }       from '../utils/StoredFileProblemWordingUtil.ts';
import type { StaleGreenSessionOwnerProblem } from './@types/StaleGreenSessionOwnerProblem.ts';

function sentenceOf(problem: StaleGreenSessionOwnerProblem): string {
  switch (problem.code) {
    case 'neither-a-job-id-nor-null': return `its "${problem.field}" is neither a job id nor null`;
    default:                          return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const StaleGreenSessionOwnerProblemWording = Object.freeze({ sentenceOf });
