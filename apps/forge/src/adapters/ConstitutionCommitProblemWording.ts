/** The words of a constitution commit's git problem, as the stored Apply refusal's `gitFailure` keeps them. */
import type { ConstitutionCommitProblem } from '../shared/@types/ConstitutionCommitProblem.ts';
import { GitProblemWording }              from './GitProblemWording.ts';

function sentenceOf(problem: ConstitutionCommitProblem): string {
  if (problem.code === 'commit-not-made') return `git ${problem.gitArguments.join(' ')} exited 0, yet HEAD holds no new commit.`;
  return GitProblemWording.sentenceOf(problem);
}

export const ConstitutionCommitProblemWording = Object.freeze({ sentenceOf });
