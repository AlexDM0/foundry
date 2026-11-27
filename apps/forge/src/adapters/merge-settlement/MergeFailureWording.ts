import type { MergeFailure } from './@types/MergeFailure.ts';

function sentenceOf(failure: MergeFailure): string {
  switch (failure.code) {
    case 'git-not-found':                   return 'git cannot be found on Hephaestus\'s PATH.';
    case 'conflicted-merge-not-undone':     return `The conflicted merge of ${failure.mergedTip} could not be undone: ${failure.restoreVerdict}.`;
    case 'stopped-without-conflicted-file': return `The merge of ${failure.mergedTip} stopped with no conflicted file.`;
    case 'merge-not-committed':             return `The merge of ${failure.mergedTip} did not commit; HEAD is ${failure.headCommit ?? 'unreadable'}.`;
  }
}

export const MergeFailureWording = Object.freeze({ sentenceOf });
