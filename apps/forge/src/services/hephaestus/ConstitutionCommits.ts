/**
 * The commit of an Apply's constitutions, made by Hephaestus in a detached worktree of the main line's tip: main's blob of each file must
 * still be the one the record opened on, each draft is written byte for byte, and the commit, hooks off and signed as the repository signs,
 * changes only the listed paths. Every refusal is a wordless verdict, git's own message going with it as a fact of its problem.
 */
import { mkdirSync }     from 'node:fs';
import { dirname, join } from 'node:path';

import { writeFileAtomically }                        from '../../lib/atomic-file/AtomicFile.ts';
import type { GitRunFailure, WorktreeRemovalProblem } from '../../lib/git/@types/GitProblem.ts';
import { GitProcess }                                 from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                               from '../../lib/git/GitWorktrees.ts';
import type { ConstitutionCommitProblem }             from '../../shared/@types/ConstitutionCommitProblem.ts';
import { projectLocationOf }                          from '../tracker/ProjectLocation.ts';
import { CONSTITUTION_FILE_PATH, InstructionFiles }   from './InstructionFiles.ts';

/** The folder under the worktrees root that holds one commit worktree per constitution commit job. */
export const CONSTITUTION_COMMITS_FOLDER = 'constitution-commits';

/** `rev-parse --verify --quiet` exits 1, with no text, for a path the commit does not hold. */
const PATH_NOT_ON_THE_COMMIT_EXIT_CODE = 1;

const SUBJECT_OF_A_NEW_FILE = 'Add the repository constitution';

const SUBJECT_OF_A_CHANGED_FILE = 'Update the repository constitution';

const SUBJECT_OF_SEVERAL_FILES = 'Update the constitutions';

/** One constitution the commit writes: its project path, main's blob of it when the record opened, and the draft's text. */
export interface ConstitutionFileCommit {
  path:     string;
  /** `null` when main held no such file. */
  baseBlob: string | null;
  markdown: string;
}

export interface ConstitutionCommitRequest {
  /** The tracker's folder, `Workspace.rootDirectory`, from which its place in the repository is found. */
  repositoryRoot: string;
  worktreesRoot:  string;
  jobId:          string;
  /** The main line's tip the job's slot recorded, which the commit is made on. */
  targetTip:      string;
  /** Every path the commit may change; a forge without entities lists its one `CONSTITUTION.md`. */
  constitutions:  readonly ConstitutionFileCommit[];
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
  | { verdict: 'refused'; reason: ConstitutionCommitRefusalReason; problem: ConstitutionCommitProblem | null };

/** The blob of a constitution in a commit: its id, `null` when the commit holds no such file, or `unreadable` when git cannot answer. */
export type ConstitutionBlobReading = { verdict: 'read'; blob: string | null } | { verdict: 'unreadable'; problem: GitRunFailure };

function commitWorktreeOf(worktreesRoot: string, jobId: string): string {
  return join(worktreesRoot, CONSTITUTION_COMMITS_FOLDER, jobId);
}

function subjectOf(mainHoldsTheFile: boolean): string {
  return mainHoldsTheFile ? SUBJECT_OF_A_CHANGED_FILE : SUBJECT_OF_A_NEW_FILE;
}

/** The project's own `CONSTITUTION.md` alone keeps the subject that says whether main had it; any other list shares one. */
function subjectOfFiles(constitutions: readonly ConstitutionFileCommit[], mainBlobs: readonly (string | null)[]): string {
  const [only] = constitutions;
  return constitutions.length === 1 && only?.path === CONSTITUTION_FILE_PATH ? subjectOf(mainBlobs[0] !== null) : SUBJECT_OF_SEVERAL_FILES;
}

function constitutionBlobOf(projectDirectory: string, commit: string, constitutionPath = CONSTITUTION_FILE_PATH): ConstitutionBlobReading {
  const constitution = InstructionFiles.projectFileOf(projectDirectory, constitutionPath);
  const blobArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}:${constitution.repositoryPath}`];
  const run = GitProcess.run(constitution.repositoryRoot, blobArguments);
  if (GitProcess.succeeded(run)) return { verdict: 'read', blob: run.standardOutput.trim() };
  if (run?.exitCode === PATH_NOT_ON_THE_COMMIT_EXIT_CODE) return { verdict: 'read', blob: null };
  return { verdict: 'unreadable', problem: GitProcess.failureOf(run, blobArguments) };
}

function refused(reason: ConstitutionCommitRefusalReason, problem: ConstitutionCommitProblem | null = null): ConstitutionCommitVerdict {
  return { verdict: 'refused', reason, problem };
}

/** The paths the commit changes against the tip it was made on, `null` when git cannot tell. */
function pathsChangedBy(worktree: string, targetTip: string, commit: string): string[] | null {
  const run = GitProcess.run(worktree, ['diff', '--name-only', '--no-renames', '-z', targetTip, commit, '--'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.split('\0').filter((path) => path !== '') : null;
}

/** The commit changes some of the listed paths and nothing else: a listed draft equal to main's text leaves its path unchanged. */
function changesOnlyListedPaths(changedPaths: readonly string[] | null, listedPaths: ReadonlySet<string>): boolean {
  return changedPaths !== null && changedPaths.length > 0 && changedPaths.every((path) => listedPaths.has(path));
}

/**
 * Commits each draft's text on the recorded tip in the job's worktree, which it leaves for the caller to land or remove. Never passes an
 * override of `commit.gpgsign`: a commit git cannot sign fails, and nothing is committed unsigned.
 */
function commitConstitution(request: ConstitutionCommitRequest): ConstitutionCommitVerdict {
  const { targetTip, constitutions } = request;
  const files = constitutions.map((constitution) => ({ constitution, file: InstructionFiles.projectFileOf(request.repositoryRoot, constitution.path) }));
  const listedPaths = new Set(files.map(({ file }) => file.repositoryPath));
  const repositoryRoot = files[0]?.file.repositoryRoot;
  if (repositoryRoot === undefined || listedPaths.size !== files.length) return refused('constitution-commit-unexpected-paths');
  const mainBlobs: (string | null)[] = [];
  for (const constitution of constitutions) {
    const mainBlob = constitutionBlobOf(request.repositoryRoot, targetTip, constitution.path);
    if (mainBlob.verdict === 'unreadable') return refused('git-failed', mainBlob.problem);
    if (mainBlob.blob !== constitution.baseBlob) return refused('constitution-moved');
    mainBlobs.push(mainBlob.blob);
  }
  const worktree = commitWorktreeOf(request.worktreesRoot, request.jobId);
  const addArguments = ['worktree', 'add', '--quiet', '--detach', worktree, targetTip];
  const added = GitProcess.run(repositoryRoot, addArguments);
  if (!GitProcess.succeeded(added)) return refused('git-failed', GitProcess.failureOf(added, addArguments));
  const ceiling = GitWorktrees.ceilingOf(worktree);
  for (const { constitution, file } of files) {
    const constitutionInWorktree = join(worktree, file.repositoryPath);
    // A project folder holding no tracked file yet is not in the checkout.
    mkdirSync(dirname(constitutionInWorktree), { recursive: true });
    writeFileAtomically(constitutionInWorktree, constitution.markdown);
  }
  const stageArguments = ['add', '--', ...listedPaths];
  const staged = GitProcess.run(worktree, stageArguments, 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(staged)) return refused('git-failed', GitProcess.failureOf(staged, stageArguments));
  const commitArguments = ['commit', '--no-verify', '-q', '-m', subjectOfFiles(constitutions, mainBlobs)];
  const committed = GitProcess.run(worktree, commitArguments, 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(committed)) {
    return refused(request.signsCommits ? 'constitution-commit-unsigned' : 'git-failed', GitProcess.failureOf(committed, commitArguments));
  }
  const commit = GitProcess.resolvedCommitOf(worktree, 'HEAD', ceiling);
  if (commit === null || commit === targetTip) return refused('git-failed', { code: 'commit-not-made', gitArguments: commitArguments });
  // Fail closed: this check is what lets the commit land with no gate.
  if (!changesOnlyListedPaths(pathsChangedBy(worktree, targetTip, commit), listedPaths)) return refused('constitution-commit-unexpected-paths');
  return { verdict: 'committed', commit };
}

/** Forced: the worktree holds only the job's own commit, landed or refused, never User's work. `null` once it is gone, else why it stays. */
function removeCommitWorktree(projectDirectory: string, worktreesRoot: string, jobId: string): WorktreeRemovalProblem | null {
  const { repositoryRoot } = projectLocationOf(projectDirectory);
  const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath: commitWorktreeOf(worktreesRoot, jobId), force: 'force' });
  return removal.verdict === 'removed' ? null : removal.problem;
}

export const ConstitutionCommits = Object.freeze({
  commitConstitution, commitWorktreeOf, constitutionBlobOf, removeCommitWorktree, subjectOf
});
