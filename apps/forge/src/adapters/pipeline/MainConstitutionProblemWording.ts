import type { MainConstitutionProblem } from '../../domain/tracker-model/@types/PipelineSetup.ts';
import { GitProblemWording }            from '../GitProblemWording.ts';

function sentenceOf(problem: MainConstitutionProblem): string {
  if (problem.code === 'main-line-unresolved') return `the main line ${problem.mainLine} does not resolve to a commit`;
  return GitProblemWording.sentenceOf(problem);
}

export const MainConstitutionProblemWording = Object.freeze({ sentenceOf });
