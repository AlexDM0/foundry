import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { GateRunManifestProblem }  from './@types/GateRunManifestProblem.ts';

function sentenceOf(problem: GateRunManifestProblem): string {
  switch (problem.code) {
    case 'not-the-phase': return `its "${problem.field}" is not the phase "${problem.expectedPhase}"`;
    case 'field-is-not':  return JobFileShapeUtil.fieldProblemSentenceOf(problem);
    default:              return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const GateRunManifestProblemWording = Object.freeze({ sentenceOf });
