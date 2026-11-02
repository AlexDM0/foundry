/**
 * Merging a commit into a worktree and undoing it, as verdicts: the merge itself, a fast-forward, its abort back to the tip it started
 * from, a reset to a recorded commit, and the two checks of a resolution (unmerged paths, conflict markers left in files).
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { fastForwardTo, type FastForwardOutcome }                                     from './BranchIntegration.ts';
import { GitProcess }                                                                 from './GitProcess.ts';
import { GitWorktrees }                                                               from './GitWorktrees.ts';
import { HeldCheckout, REAL_CHECKOUT_WRITE_PRIMITIVES, type CheckoutWritePrimitives } from './HeldCheckout.ts';
import { NOT_AN_ANCESTOR_EXIT_CODE }                                                  from './constants/GitConventions.ts';

const OPENING_CONFLICT_MARKER = /^<{7}(?: |$)/m;
const CLOSING_CONFLICT_MARKER = /^>{7}(?: |$)/m;

export type MergeOutcome =
  | { verdict: 'merged'; mergeCommit: string }
  | { verdict: 'already-descends'; headCommit: string }
  | { verdict: 'conflicted'; conflictedFiles: string[] }
  | { verdict: 'unknown-commit' }
  | { verdict: 'git-failed'; reason: string };

export type TipRestoreOutcome =
  | { verdict: 'restored'; headCommit: string }
  | { verdict: 'unknown-commit' }
  | { verdict: 'refused'; reason: string }
  | { verdict: 'target-file-held'; reason: string; heldFiles: string[] };

function nulSeparatedFieldsOf(output: string): string[] {
  return output.split('\0').filter((field) => field !== '');
}

/** Held below the worktree's parent, so a folder that lost its `.git` never resets or merges the checkout above it. */
function runInWorktree(worktreePath: string, gitArguments: readonly string[]): ReturnType<typeof GitProcess.run> {
  return GitProcess.run(worktreePath, gitArguments, 'hooks-off', undefined, GitWorktrees.ceilingOf(worktreePath));
}

function commitInWorktree(worktreePath: string, revision: string): string | null {
  return GitProcess.resolvedCommitOf(worktreePath, revision, GitWorktrees.ceilingOf(worktreePath));
}

/** `null` when git cannot answer, which a caller reads as "not known to be resolved". */
export function unmergedPathsIn(worktreePath: string): string[] | null {
  const run = runInWorktree(worktreePath, ['diff', '--name-only', '--diff-filter=U', '-z']);
  return GitProcess.succeeded(run) ? nulSeparatedFieldsOf(run.standardOutput) : null;
}

/**
 * A file counts only with both an opening and a closing marker line, since a lone `=======` is a Markdown heading underline. A file that
 * cannot be read (deleted by the resolution) holds no marker.
 */
export function conflictMarkedFilesIn(worktreePath: string, paths: readonly string[]): string[] {
  return paths.filter((path) => {
    try {
      const content = readFileSync(join(worktreePath, path), 'utf8');
      return OPENING_CONFLICT_MARKER.test(content) && CLOSING_CONFLICT_MARKER.test(content);
    } catch {
      return false;
    }
  });
}

/** Always a merge commit (`--no-ff`), so the merge is one commit an abort or reset can name; a conflict is left in place for the caller. */
export function mergeIn(worktreePath: string, commit: string): MergeOutcome {
  const resolvedCommit = commitInWorktree(worktreePath, commit);
  if (resolvedCommit === null) return { verdict: 'unknown-commit' };
  const headCommit = commitInWorktree(worktreePath, 'HEAD');
  if (headCommit === null) return { verdict: 'git-failed', reason: GitProcess.failureReasonOf(null, ['rev-parse', 'HEAD']) };

  const ancestryArguments = ['merge-base', '--is-ancestor', resolvedCommit, headCommit];
  const ancestry          = runInWorktree(worktreePath, ancestryArguments);
  if (GitProcess.succeeded(ancestry)) return { verdict: 'already-descends', headCommit };
  if (ancestry?.exitCode !== NOT_AN_ANCESTOR_EXIT_CODE) return { verdict: 'git-failed', reason: GitProcess.failureReasonOf(ancestry, ancestryArguments) };

  const mergeArguments = ['merge', '--no-ff', '--no-edit', '--quiet', resolvedCommit];
  const merge          = runInWorktree(worktreePath, mergeArguments);
  if (!GitProcess.succeeded(merge)) {
    const conflictedFiles = unmergedPathsIn(worktreePath) ?? [];
    if (conflictedFiles.length > 0) return { verdict: 'conflicted', conflictedFiles };
    return { verdict: 'git-failed', reason: GitProcess.failureReasonOf(merge, mergeArguments) };
  }
  const mergeCommit = commitInWorktree(worktreePath, 'HEAD');
  if (mergeCommit === null || mergeCommit === headCommit) {
    return { verdict: 'git-failed', reason: `git merge ${resolvedCommit} exited 0, yet HEAD is ${mergeCommit ?? 'unreadable'}.` };
  }
  return { verdict: 'merged', mergeCommit };
}

/** `merge --ff-only` into the named worktree, its hooks off like every other step here. */
export function fastForwardInto(worktreePath: string, commit: string): FastForwardOutcome {
  return fastForwardTo(worktreePath, commit, 'hooks-off');
}

function restoredUnlessHeadDiffers(worktreePath: string, expectedCommit: string, command: string): TipRestoreOutcome {
  const headCommit = commitInWorktree(worktreePath, 'HEAD');
  if (headCommit !== expectedCommit) return { verdict: 'refused', reason: `${command} exited 0, yet HEAD is ${headCommit ?? 'unreadable'}.` };
  return { verdict: 'restored', headCommit };
}

/** Restored only when HEAD is the tip recorded before the merge afterwards: an abort that left HEAD elsewhere is refused. */
export function abortMerge(worktreePath: string, preMergeTip: string): TipRestoreOutcome {
  const abortArguments = ['merge', '--abort'];
  const run            = runInWorktree(worktreePath, abortArguments);
  if (!GitProcess.succeeded(run)) return { verdict: 'refused', reason: GitProcess.failureReasonOf(run, abortArguments) };
  return restoredUnlessHeadDiffers(worktreePath, preMergeTip, 'git merge --abort');
}

/**
 * `--hard`: the worktree's files are put back too. The commit is resolved first, so an option-shaped one is never obeyed. A file another
 * process holds open is tried again up to `HELD_CHECKOUT_RETRY_TRIES` times; each try rewrites every file, so nothing is put back between.
 */
export function resetTo(worktreePath: string, recordedCommit: string, primitives: CheckoutWritePrimitives = REAL_CHECKOUT_WRITE_PRIMITIVES): TipRestoreOutcome {
  const resolvedCommit = commitInWorktree(worktreePath, recordedCommit);
  if (resolvedCommit === null) return { verdict: 'unknown-commit' };
  const reset = HeldCheckout.writeRetryingWhileHeld({
    directory:        worktreePath,
    gitArguments:     ['reset', '--hard', '--quiet', resolvedCommit],
    hookPolicy:       'hooks-off',
    ceilingDirectory: GitWorktrees.ceilingOf(worktreePath),
    afterHeldFailure: () => undefined,
  }, primitives);
  if (reset.verdict === 'failed') return { verdict: 'refused', reason: reset.reason };
  if (reset.verdict === 'target-file-held') return reset;
  return restoredUnlessHeadDiffers(worktreePath, resolvedCommit, `git reset --hard ${resolvedCommit}`);
}
