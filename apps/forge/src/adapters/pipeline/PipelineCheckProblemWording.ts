/** The words of why a pipeline check could not run, as its stored `cannot-run` reason keeps them: git made no worktree, or a line was refused. */
import type { GitRunFailure } from '../../lib/git/@types/GitProblem.ts';
import type { LineRefusal }   from '../../shared/@types/LineRefusal.ts';
import { GitProblemWording }  from '../GitProblemWording.ts';
import { LineRefusalWording } from '../LineRefusalWording.ts';

export type PipelineCheckProblem = GitRunFailure | LineRefusal;

function sentenceOf(problem: PipelineCheckProblem): string {
  switch (problem.code) {
    case 'git-not-started':
    case 'git-exited':
      return GitProblemWording.sentenceOf(problem);
    case 'shell-run-refused':
    case 'denied-root-unmade':
    case 'confinement-refused':
      return LineRefusalWording.sentenceOf(problem);
  }
}

export const PipelineCheckProblemWording = Object.freeze({ sentenceOf });
