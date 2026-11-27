import { FrontmatterProblemWording } from '../tickets/FrontmatterProblemWording.ts';
import type { EpicFileProblem }      from './@types/EpicFileProblem.ts';

function sentenceOf(problem: EpicFileProblem): string {
  switch (problem.code) {
    case 'not-an-epic-key':   return `\`${problem.field}\` is not an epic key: ${problem.storedValue}`;
    case 'not-a-colour-slot': return `\`${problem.field}\` is not a colour slot from ${problem.firstSlot} to ${problem.lastSlot}: ${problem.storedValue}`;
    default:                  return FrontmatterProblemWording.sentenceOf(problem);
  }
}

export const EpicFileProblemWording = Object.freeze({ sentenceOf });
