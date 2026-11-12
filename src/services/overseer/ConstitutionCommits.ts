/**
 * The commit of an Apply's `CONSTITUTION.md` (plan section 8.7), made in the Overseer's own process in a detached worktree of the main
 * line's tip that its constitution commit job owns: main's blob of the file is checked against the one the record opened on, the draft's
 * text is written byte for byte, and the commit, with hooks off and the repository's own signing configuration, must change that one path
 * and nothing else. Every refusal is a wordless verdict; git's own text goes with it.
 */
import { join } from 'node:path';

import { writeFileAtomically }    from '../../lib/atomic-file/AtomicFile.ts';
import { GitProcess }             from '../../lib/git/GitProcess.ts';
import { GitWorktrees }           from '../../lib/git/GitWorktrees.ts';
import { CONSTITUTION_FILE_PATH } from './InstructionFiles.ts';

/** The folder under the worktrees root that holds one commit worktree per constitution commit job. */
export const CONSTITUTION_COMMITS_FOLDER = 'constitution-commits';

/** `rev-parse --verify --quiet` exits 1, with no text, for a path the commit does not hold. */
const PATH_NOT_ON_THE_COMMIT_EXIT_CODE = 1;

const SUBJECT_OF_A_NEW_FILE = 'Add the repository constitution';

const SUBJECT_OF_A_CHANGED_FILE = 'Update the repository constitution';

export interface ConstitutionCommitRequest {
  repositoryRoot: string;
  worktreesRoot:  string;
  jobId:          string;
  /** The main line's tip the job's slot recorded, which the commit is made on. */
  targetTip:      string;
  /** Main's blob of `CONSTITUTION.md` when the record opened; `null` when main held no such file. */
  baseBlob:       string | null;
  markdown:       string;
  /** The repository sets `commit.gpgsign`: a commit git cannot make is then an unsigned one, never made. */
  signsCommits:   boolean;
}

export type ConstitutionCommitRefusalReason =
  | 'constitution-moved'
  | 'constitution-commit-unsigned'
  | 'constitution-commit-unexpected-paths'
  | 'git-failed';

export type ConstitutionCommitVerdict =
  | { verdict: 'committed'; commit: string }
  | { verdict: 'refused'; reason: ConstitutionCommitRefusalReason; gitFailure: string | null };

/** The blob of `CONSTITUTION.md` in a commit: its id, `null` when the commit holds no such file, or `unreadable` when git cannot answer. */
export type ConstitutionBlobReading = { verdict: 'read'; blob: string | null } | { verdict: 'unreadable'; gitFailure: string };

function commitWorktreeOf(worktreesRoot: string, jobId: string): string {
  return join(worktreesRoot, CONSTITUTION_COMMITS_FOLDER, jobId);
}

function subjectOf(mainHoldsTheFile: boolean): string {
  return mainHoldsTheFile ? SUBJECT_OF_A_CHANGED_FILE : SUBJECT_OF_A_NEW_FILE;
}

function constitutionBlobOf(directory: string, commit: string): ConstitutionBlobReading {
  const blobArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}:${CONSTITUTION_FILE_PATH}`];
  const run = GitProcess.run(directory, blobArguments);
  if (GitProcess.succeeded(run)) return { verdict: 'read', blob: run.standardOutput.trim() };
  if (run?.exitCode === PATH_NOT_ON_THE_COMMIT_EXIT_CODE) return { verdict: 'read', blob: null };
  return { verdict: 'unreadable', gitFailure: GitProcess.failureReasonOf(run, blobArguments) };
}

function refused(reason: ConstitutionCommitRefusalReason, gitFailure: string | null = null): ConstitutionCommitVerdict {
  return { verdict: 'refused', reason, gitFailure };
}

/** The paths the commit changes against the tip it was made on, `null` when git cannot tell. */
function pathsChangedBy(worktree: string, targetTip: string, commit: string): string[] | null {
  const run = GitProcess.run(worktree, ['diff', '--name-only', '--no-renames', '-z', targetTip, commit, '--'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.split('\0').filter((path) => path !== '') : null;
}

/**
 * Commits the draft's text on the recorded tip in the job's worktree, which it leaves for the caller to land or remove. Never passes an
 * override of `commit.gpgsign`: a commit git cannot sign fails, and nothing is committed unsigned.
 */
function commitConstitution(request: ConstitutionCommitRequest): ConstitutionCommitVerdict {
  const { repositoryRoot, targetTip } = request;
  const mainBlob = constitutionBlobOf(repositoryRoot, targetTip);
  if (mainBlob.verdict === 'unreadable') return refused('git-failed', mainBlob.gitFailure);
  if (mainBlob.blob !== request.baseBlob) return refused('constitution-moved');
  const worktree = commitWorktreeOf(request.worktreesRoot, request.jobId);
  const addArguments = ['worktree', 'add', '--quiet', '--detach', worktree, targetTip];
  const added = GitProcess.run(repositoryRoot, addArguments);
  if (!GitProcess.succeeded(added)) return refused('git-failed', GitProcess.failureReasonOf(added, addArguments));
  const ceiling = GitWorktrees.ceilingOf(worktree);
  writeFileAtomically(join(worktree, CONSTITUTION_FILE_PATH), request.markdown);
  const stageArguments = ['add', '--', CONSTITUTION_FILE_PATH];
  const staged = GitProcess.run(worktree, stageArguments, 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(staged)) return refused('git-failed', GitProcess.failureReasonOf(staged, stageArguments));
  const commitArguments = ['commit', '--no-verify', '-q', '-m', subjectOf(mainBlob.blob !== null)];
  const committed = GitProcess.run(worktree, commitArguments, 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(committed)) {
    return refused(request.signsCommits ? 'constitution-commit-unsigned' : 'git-failed', GitProcess.failureReasonOf(committed, commitArguments));
  }
  const commit = GitProcess.resolvedCommitOf(worktree, 'HEAD', ceiling);
  if (commit === null || commit === targetTip) return refused('git-failed', `git ${commitArguments.join(' ')} exited 0, yet HEAD holds no new commit.`);
  const changedPaths = pathsChangedBy(worktree, targetTip, commit);
  // Fail closed: this check is what lets the commit land with no gate.
  if (changedPaths === null || changedPaths.length !== 1 || changedPaths[0] !== CONSTITUTION_FILE_PATH) return refused('constitution-commit-unexpected-paths');
  return { verdict: 'committed', commit };
}

/** Forced: the worktree holds only the job's own commit, landed or refused, never User's work. `null` once it is gone, else git's reason. */
function removeCommitWorktree(repositoryRoot: string, worktreesRoot: string, jobId: string): string | null {
  const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath: commitWorktreeOf(worktreesRoot, jobId), force: 'force' });
  return removal.verdict === 'removed' ? null : removal.reason;
}

export const ConstitutionCommits = Object.freeze({
  commitConstitution, commitWorktreeOf, constitutionBlobOf, removeCommitWorktree, subjectOf
});
