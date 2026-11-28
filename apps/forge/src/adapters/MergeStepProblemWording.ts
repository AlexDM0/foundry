/** The words of a target catch-up or main merge that cannot go on, as its `setup-failed` incident serves them under `reason`. */
import type { MergeStepProblem } from '../shared/@types/MergeStepProblem.ts';

function sentenceOf(problem: MergeStepProblem): string {
  switch (problem.code) {
    case 'tip-unreadable':        return `The tip of ${problem.branch} cannot be read.`;
    case 'holding-unknown':       return `git cannot tell whether ${problem.branch} holds ${problem.target}'s tip ${problem.targetTip}.`;
    case 'merge-tree-unreadable': return `The tree of the merge commit ${problem.mergeCommit} cannot be read.`;
    case 'head-tree-unreadable':  return `The tree of ${problem.branch}'s HEAD cannot be read.`;
    case 'merge-settled-failed':  return problem.storedReason;
  }
}

export const MergeStepProblemWording = Object.freeze({ sentenceOf });
