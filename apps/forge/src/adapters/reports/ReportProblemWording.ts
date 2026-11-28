import type { ReportProblem } from './@types/ReportProblem.ts';

function sentenceOf(problem: ReportProblem): string {
  switch (problem.code) {
    case 'required':                 return `${problem.path} is required`;
    case 'not-allowed':              return `${problem.path} is not allowed`;
    case 'not-of-type':              return `${problem.path} is not of type ${problem.expectedTypes.join(',')}`;
    case 'not-in-enum':              return `${problem.path} is not one of ${problem.allowedValues.join(', ')}`;
    case 'not-the-constant':         return `${problem.path} is not ${String(problem.constant)}`;
    case 'shorter-than-minimum':     return `${problem.path} is shorter than ${problem.minimumLength}`;
    case 'longer-than-maximum':      return `${problem.path} is longer than ${problem.maximumLength}`;
    case 'pattern-mismatch':         return `${problem.path} does not match ${problem.pattern}`;
    case 'matches-no-any-of-branch': return `${problem.path} matches no anyOf branch`;
    case 'one-of-branches-not-one':  return `${problem.path} matches ${problem.matchingBranches} oneOf branches, not one`;
    case 'fewer-items-than-minimum': return `${problem.path} has fewer than ${problem.minimumItems} items`;
  }
}

export const ReportProblemWording = Object.freeze({ sentenceOf });
