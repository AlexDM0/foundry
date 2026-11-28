/** The words of a git step's problem, as the sentence its reason was before the problem was typed; git's own message is quoted as given. */
import type { GitProblem, GitRunFailure } from '../lib/git/@types/GitProblem.ts';
import type { GroupWorktreeProblem }      from '../shared/@types/GroupWorktreeProblem.ts';

function failureSentenceOf(failure: GitRunFailure): string {
  const command = `git ${failure.gitArguments.join(' ')}`;
  if (failure.code === 'git-not-started') return `${command} could not be started.`;
  return `${command} exited with ${failure.exitCode}: ${failure.gitMessage}`;
}

function sentenceOf(problem: GitProblem | GroupWorktreeProblem): string {
  switch (problem.code) {
    case 'git-not-started':
    case 'git-exited':                  return failureSentenceOf(problem);
    case 'git-exited-without-tree':     return `${failureSentenceOf({ ...problem, code: 'git-exited' })} (no tree written)`;
    case 'batch-record-without-tree':   return `git merge-tree --stdin wrote no tree for a record (status ${problem.recordStatus}).`;
    case 'batch-record-status-unknown': return `git merge-tree --stdin answered status ${problem.recordStatus} for a record.`;
    case 'batch-records-miscounted':    return `git merge-tree --stdin did not print one record for each of the ${problem.pairCount} pairs.`;
    case 'index-lock-not-removed':      return `${problem.lockPath} could not be removed: ${problem.systemError}`;
    case 'untracked-file-not-saved':    return `git diff --no-index could not save the untracked file ${problem.untrackedFile}.`;
    case 'patch-not-written':           return `${problem.patchPath} could not be written: ${problem.systemError}`;
    case 'worktree-folder-not-deleted': return `${failureSentenceOf(problem.gitFailure)} The folder ${problem.worktreePath} could not be deleted.`;
    case 'leftover-not-a-checkout':     return `The leftover folder ${problem.path} is not a checkout of the repository.`;
    case 'checkout-of-another-branch':  return `The folder ${problem.path} is a checkout of another branch than ${problem.expectedBranch}.`;
    case 'refresh-merge-in-progress':   return `The leftover refresh worktree ${problem.path} holds a merge in progress.`;
    case 'refresh-changes-uncommitted': return `The leftover refresh worktree ${problem.path} holds uncommitted changes.`;
    case 'refresh-not-detached':        return `${problem.path}: ${failureSentenceOf(problem.gitFailure)}`;
    case 'head-differs-after-success':  return `git ${problem.commandArguments.join(' ')} exited 0, yet HEAD is ${problem.headCommit ?? 'unreadable'}.`;
  }
}

export const GitProblemWording = Object.freeze({ sentenceOf });
