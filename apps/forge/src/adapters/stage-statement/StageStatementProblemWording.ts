import { StoredFileProblemWording }   from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }           from '../utils/JobFileShapeUtil.ts';
import type { StageStatementProblem } from './@types/StageStatementProblem.ts';

function sentenceOf(problem: StageStatementProblem): string {
  switch (problem.code) {
    case 'not-a-statement-stage': return `its "${problem.field}" is not a stage that keeps a statement`;
    case 'field-is-not':          return JobFileShapeUtil.fieldProblemSentenceOf(problem);
    default:                      return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const StageStatementProblemWording = Object.freeze({ sentenceOf });
