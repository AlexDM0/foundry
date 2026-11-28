import { StoredFileProblemWording }    from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }            from '../utils/JobFileShapeUtil.ts';
import type { MergeSettlementProblem } from './@types/MergeSettlementProblem.ts';

function sentenceOf(problem: MergeSettlementProblem): string {
  switch (problem.code) {
    case 'not-a-settlement': return `its "${problem.field}" is not a settlement`;
    case 'field-is-not':     return JobFileShapeUtil.fieldProblemSentenceOf(problem);
    default:                 return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const MergeSettlementProblemWording = Object.freeze({ sentenceOf });
