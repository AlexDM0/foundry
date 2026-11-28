import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import type { UsageWindowsProblem } from './@types/UsageWindowsProblem.ts';

function sentenceOf(problem: UsageWindowsProblem): string {
  switch (problem.code) {
    case 'windows-not-an-object':                    return 'its "windows" is not an object';
    case 'window-with-no-name':                      return 'it names a window with no name';
    case 'window-not-an-object':                     return `its window "${problem.window}" is not an object`;
    case 'window-length-hours-not-a-number-or-null': return `its window "${problem.window}" has no number or null "lengthHours"`;
    case 'window-utilization-not-a-number':          return `its window "${problem.window}" has no number "utilization"`;
    case 'window-resets-at-not-a-stamp':             return `its window "${problem.window}" has no stamp "resetsAt"`;
    default:                                         return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const UsageWindowsProblemWording = Object.freeze({ sentenceOf });
