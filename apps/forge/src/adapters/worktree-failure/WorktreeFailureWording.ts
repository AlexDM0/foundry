import { GitProblemWording }            from '../GitProblemWording.ts';
import type { WorktreeCreationFailure } from './@types/WorktreeCreationFailure.ts';

function sentenceOf(failure: WorktreeCreationFailure): string {
  switch (failure.code) {
    case 'group-name-not-portable':
      return `The stored group "${failure.groupName}" is not a portable group name (lower-case letters and digits in words joined by single `
        + 'hyphens); file its tickets again under a group that is, since nothing migrates.';
    case 'worktree-add-refused': return failure.gitMessage;
    case 'git-did-not-run':      return 'git did not run';
    default:                     return GitProblemWording.sentenceOf(failure);
  }
}

export const WorktreeFailureWording = Object.freeze({ sentenceOf });
