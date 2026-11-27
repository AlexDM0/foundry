/**
 * The checks of the job's history and worktree (V2, V3, V4, V7, V10, V16): HEAD descends from the start, a commit was made where one is
 * owed, the worktree is clean, no commit is attributed, a merge is resolved, and a reader's HEAD stayed where it started.
 */
import type { LogRecord }                   from '../../domain/tracker-model/@types/LogRecord.ts';
import { GitProcess }                       from '../../lib/git/GitProcess.ts';
import { GIT_PATHSPEC_ARGUMENT_CHARACTERS } from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                 from '../../lib/git/utils/GitArgumentsUtil.ts';

import type { AgentNaming, CustomsSubject } from './@types/CustomsSubject.ts';
import type { CheckVerdict }                from './@types/CustomsVerdict.ts';
import {
  crossingStageNameOf,
  gitLines,
  PASSED,
  rangeArgumentsOf,
  rangeOf,
  refused,
  reportFieldOf,
  worktreeCommitOf,
  worktreeGitRun
} from './CustomsReadings.ts';

/** Forge's own refusal of a generated commit, whichever agent wrote it. */
const GENERATED_COMMIT_PATTERN = /Generated with/i;

/** V7's judgement of one commit message: the agent's attribution patterns, and forge's own. */
export function commitMessageIsAttributed(message: string, agentNaming: Pick<AgentNaming, 'attributionPatterns'>): boolean {
  return [...agentNaming.attributionPatterns, GENERATED_COMMIT_PATTERN].some((pattern) => pattern.test(message));
}

export function headDescendsFromTheStart(subject: CustomsSubject): CheckVerdict {
  const run = worktreeGitRun(subject.worktreePath, ['merge-base', '--is-ancestor', subject.startCommit, 'HEAD']);
  return GitProcess.succeeded(run) ? PASSED : refused('history-rewritten', [subject.startCommit]);
}

/**
 * A builder owes a commit only when it reports `built`; a reviewer and a resolution reviewer never do, nor a package builder that accepts the
 * proposal as it is (E20).
 */
export function aCommitSinceTheStart(subject: CustomsSubject): CheckVerdict {
  if (subject.role === 'builder' && reportFieldOf(subject.report, 'outcome') !== 'built') return PASSED;
  if (crossingStageNameOf(subject) === 'package-build') return PASSED;
  const measured = { ...subject, startCommit: subject.workStartCommit ?? subject.startCommit };
  const commits = gitLines(subject.worktreePath, ['rev-list', ...rangeArgumentsOf(measured)]);
  if (commits === null) return refused('git-failed', [rangeOf(measured)]);
  return commits.length > 0 ? PASSED : refused('no-commit-since-start', [measured.startCommit]);
}

/** The first build job of the unbroken run of failed attempts right before this build job on its ticket; `null` after any other ending. */
export function retriedFailedBuildJobIdOf(logRecords: readonly LogRecord[], jobId: string): string | null {
  const buildLaunches = logRecords.flatMap((record) => (record.kind === 'job-launched' && record.fields.kind === 'build' ? [record] : []));
  const ownLaunch = buildLaunches.find((launch) => launch.jobId === jobId);
  if (ownLaunch === undefined) return null;
  const ticketKey = [...ownLaunch.fields.ticketIds].sort().join(',');
  const failedJobIds = new Set(logRecords.flatMap((record) => (record.kind === 'job-ended' && record.fields.outcome === 'failed' ? [record.jobId] : [])));
  const earlier = buildLaunches.slice(0, buildLaunches.indexOf(ownLaunch)).filter((launch) => [...launch.fields.ticketIds].sort().join(',') === ticketKey);
  let retried: string | null = null;
  for (let i = earlier.length - 1; i >= 0 && failedJobIds.has(earlier[i]?.jobId ?? ''); i -= 1) retried = earlier[i]?.jobId ?? null;
  return retried;
}

export function worktreeIsClean(subject: CustomsSubject): CheckVerdict {
  const run = worktreeGitRun(subject.worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!GitProcess.succeeded(run)) return refused('git-failed', ['status']);
  const paths = run.standardOutput.split('\n').filter((line) => line !== '');
  return paths.length === 0 ? PASSED : refused('worktree-dirty', paths);
}

export function noAiAttributionInRange(subject: CustomsSubject): CheckVerdict {
  const commits = gitLines(subject.worktreePath, ['rev-list', ...rangeArgumentsOf(subject)]);
  if (commits === null) return refused('git-failed', [rangeOf(subject)]);
  const attributed = commits.filter((commit) => {
    const message = worktreeGitRun(subject.worktreePath, ['log', '-1', '--format=%B', commit]);
    return GitProcess.succeeded(message) && commitMessageIsAttributed(message.standardOutput, subject.agentNaming);
  });
  return attributed.length === 0 ? PASSED : refused('ai-attribution-in-range', attributed);
}

/** The merge commit is the first merge in range, or the start itself for a job that began from the merged commit. */
function mergeCommitOf(subject: CustomsSubject): string | null {
  const merges = gitLines(subject.worktreePath, ['rev-list', '--merges', '--reverse', ...rangeArgumentsOf(subject)]);
  return merges?.[0] ?? subject.startCommit;
}

/**
 * The repository's own `core.whitespace` with `cr-at-eol` added: a CR before a line end is the file's own line ending in a repository holding
 * CRLF blobs, never trailing whitespace, and a `-c` value replaces the configured one rather than adding to it.
 */
function whitespaceRuleOf(worktreePath: string): string {
  const configured = worktreeGitRun(worktreePath, ['config', '--get', 'core.whitespace']);
  const ownRule = GitProcess.succeeded(configured) ? configured.standardOutput.trim() : '';
  return ownRule === '' ? 'cr-at-eol' : `${ownRule},cr-at-eol`;
}

export function mergeIsResolved(subject: CustomsSubject): CheckVerdict {
  const { merge, worktreePath } = subject;
  if (merge === undefined) return refused('merge-unresolved', ['no merge']);
  const unmerged = gitLines(worktreePath, ['ls-files', '-u']);
  if (unmerged === null || unmerged.length > 0) return refused('merge-unresolved', unmerged ?? ['ls-files']);
  const mergeCommit = mergeCommitOf(subject);
  const whitespaceRule = merge.conflictedFiles.length > 0 ? whitespaceRuleOf(worktreePath) : '';
  const unclean = GitArgumentsUtil.pathspecChunksOf(merge.conflictedFiles, GIT_PATHSPEC_ARGUMENT_CHARACTERS).some((chunk) => {
    const markersAndWhitespace = worktreeGitRun(worktreePath, ['-c', `core.whitespace=${whitespaceRule}`, 'diff', '--check', merge.branchTip, 'HEAD', '--', ...chunk]);
    return !GitProcess.succeeded(markersAndWhitespace);
  });
  if (unclean) return refused('merge-unresolved', [...merge.conflictedFiles]);
  const parents = mergeCommit === null ? null : gitLines(worktreePath, ['rev-list', '--parents', '-n', '1', mergeCommit])?.[0]?.split(' ').slice(1);
  const expected = [merge.branchTip, merge.targetTip];
  return JSON.stringify(parents) === JSON.stringify(expected) ? PASSED : refused('merge-unresolved', parents ?? []);
}

/** The pipeline agent reads a snapshot and changes nothing in it: a commit, even one on top of the start, moved its HEAD. */
export function headUnmoved(subject: CustomsSubject): CheckVerdict {
  const headCommit = worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return refused('git-failed', ['HEAD']);
  return headCommit === subject.startCommit ? PASSED : refused('head-moved', [subject.startCommit, headCommit]);
}
