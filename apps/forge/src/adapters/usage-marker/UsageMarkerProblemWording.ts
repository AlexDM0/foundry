import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { UsageMarkerProblem }      from './@types/UsageMarkerProblem.ts';

function sentenceOf(problem: UsageMarkerProblem): string {
  switch (problem.code) {
    case 'vendor-or-window-not-text': return 'its "vendor" or "window" is not text';
    case 'resets-at-not-a-stamp':     return 'its "resetsAt" is not a stamp';
    case 'seen-by-not-an-object':     return 'its "seenBy" is not an object';
    case 'seen-by-names-no-job':      return 'its "seenBy" names no tracker id and job id';
    default:                          return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const UsageMarkerProblemWording = Object.freeze({ sentenceOf });
