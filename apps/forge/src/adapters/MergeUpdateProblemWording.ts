/** The words of a failed merge of a target into a ticket's worktree, as the clause its `gitReason` was before the problem was typed. */
import type { MergeUpdateProblem } from '../shared/@types/MergeUpdateProblem.ts';
import { GitProblemWording }       from './GitProblemWording.ts';

function sentenceOf(problem: MergeUpdateProblem, target: string): string {
  switch (problem.code) {
    case 'worktree-head-unreadable': return `${problem.worktree} has no readable HEAD`;
    case 'target-unresolved':        return `${target} does not resolve`;
    case 'unknown-commit':           return 'unknown commit';
    default:                         return GitProblemWording.sentenceOf(problem);
  }
}

export const MergeUpdateProblemWording = Object.freeze({ sentenceOf });
