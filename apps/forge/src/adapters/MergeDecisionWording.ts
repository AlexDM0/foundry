/** The words of a problem that a merge-refused decision's stored note names: git's failure, or an invalid report's problem. */
import type { GitProblem }           from '../lib/git/@types/GitProblem.ts';
import type { GroupWorktreeProblem } from '../shared/@types/GroupWorktreeProblem.ts';
import { GitProblemWording }         from './GitProblemWording.ts';
import type { ReportProblem }        from './reports/@types/ReportProblem.ts';
import { ReportProblemWording }      from './reports/ReportProblemWording.ts';

export type MergeDecisionProblem = GitProblem | GroupWorktreeProblem | ReportProblem;

const IS_REPORT_PROBLEM_CODE: Readonly<Record<ReportProblem['code'], true>> = {
  'required':                 true,
  'not-allowed':              true,
  'not-of-type':              true,
  'not-in-enum':              true,
  'not-the-constant':         true,
  'shorter-than-minimum':     true,
  'longer-than-maximum':      true,
  'pattern-mismatch':         true,
  'matches-no-any-of-branch': true,
  'one-of-branches-not-one':  true,
  'fewer-items-than-minimum': true,
};

function isReportProblem(problem: MergeDecisionProblem): problem is ReportProblem {
  return Object.hasOwn(IS_REPORT_PROBLEM_CODE, problem.code);
}

function sentenceOf(problem: MergeDecisionProblem): string {
  return isReportProblem(problem) ? ReportProblemWording.sentenceOf(problem) : GitProblemWording.sentenceOf(problem);
}

export const MergeDecisionWording = Object.freeze({ sentenceOf });
