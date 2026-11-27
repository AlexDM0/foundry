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
import { CustomsReadings, PASSED }          from './CustomsReadings.ts';

/** Forge's own refusal of a generated commit, whichever agent wrote it. */
const GENERATED_COMMIT_PATTERN = /Generated with/i;

/** V7's judgement of one commit message: the agent's attribution patterns, and forge's own. */
function commitMessageIsAttributed(message: string, agentNaming: Pick<AgentNaming, 'attributionPatterns'>): boolean {
  return [...agentNaming.attributionPatterns, GENERATED_COMMIT_PATTERN].some((pattern) => pattern.test(message));
}

function headDescendsFromTheStart(subject: CustomsSubject): CheckVerdict {
  const run = CustomsReadings.worktreeGitRun(subject.worktreePath, ['merge-base', '--is-ancestor', subject.startCommit, 'HEAD']);
  return GitProcess.succeeded(run) ? PASSED : CustomsReadings.refused('history-rewritten', [subject.startCommit]);
}

/**
 * A builder owes a commit only when it reports `built`; a reviewer and a resolution reviewer never do, nor a package builder that accepts the
 * proposal as it is (E20).
 */
function aCommitSinceTheStart(subject: CustomsSubject): CheckVerdict {
  if (subject.role === 'builder' && CustomsReadings.reportFieldOf(subject.report, 'outcome') !== 'built') return PASSED;
  if (CustomsReadings.crossingStageNameOf(subject) === 'package-build') return PASSED;
  const measured = { ...subject, startCommit: subject.workStartCommit ?? subject.startCommit };
  const commits = CustomsReadings.gitLines(subject.worktreePath, ['rev-list', ...CustomsReadings.rangeArgumentsOf(measured)]);
  if (commits === null) return CustomsReadings.refused('git-failed', [CustomsReadings.rangeOf(measured)]);
  return commits.length > 0 ? PASSED : CustomsReadings.refused('no-commit-since-start', [measured.startCommit]);
}

/** The first build job of the unbroken run of failed attempts right before this build job on its ticket; `null` after any other ending. */
function retriedFailedBuildJobIdOf(logRecords: readonly LogRecord[], jobId: string): string | null {
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

function worktreeIsClean(subject: CustomsSubject): CheckVerdict {
  const run = CustomsReadings.worktreeGitRun(subject.worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!GitProcess.succeeded(run)) return CustomsReadings.refused('git-failed', ['status']);
  const paths = run.standardOutput.split('\n').filter((line) => line !== '');
  return paths.length === 0 ? PASSED : CustomsReadings.refused('worktree-dirty', paths);
}

function noAiAttributionInRange(subject: CustomsSubject): CheckVerdict {
  const commits = CustomsReadings.gitLines(subject.worktreePath, ['rev-list', ...CustomsReadings.rangeArgumentsOf(subject)]);
  if (commits === null) return CustomsReadings.refused('git-failed', [CustomsReadings.rangeOf(subject)]);
  const attributed = commits.filter((commit) => {
    const message = CustomsReadings.worktreeGitRun(subject.worktreePath, ['log', '-1', '--format=%B', commit]);
    return GitProcess.succeeded(message) && commitMessageIsAttributed(message.standardOutput, subject.agentNaming);
  });
  return attributed.length === 0 ? PASSED : CustomsReadings.refused('ai-attribution-in-range', attributed);
}

/** The merge commit is the first merge in range, or the start itself for a job that began from the merged commit. */
function mergeCommitOf(subject: CustomsSubject): string | null {
  const merges = CustomsReadings.gitLines(subject.worktreePath, ['rev-list', '--merges', '--reverse', ...CustomsReadings.rangeArgumentsOf(subject)]);
  return merges?.[0] ?? subject.startCommit;
}

/**
 * The repository's own `core.whitespace` with `cr-at-eol` added: a CR before a line end is the file's own line ending in a repository holding
 * CRLF blobs, never trailing whitespace, and a `-c` value replaces the configured one rather than adding to it.
 */
function whitespaceRuleOf(worktreePath: string): string {
  const configured = CustomsReadings.worktreeGitRun(worktreePath, ['config', '--get', 'core.whitespace']);
  const ownRule = GitProcess.succeeded(configured) ? configured.standardOutput.trim() : '';
  return ownRule === '' ? 'cr-at-eol' : `${ownRule},cr-at-eol`;
}

function mergeIsResolved(subject: CustomsSubject): CheckVerdict {
  const { merge, worktreePath } = subject;
  if (merge === undefined) return CustomsReadings.refused('merge-unresolved', ['no merge']);
  const unmerged = CustomsReadings.gitLines(worktreePath, ['ls-files', '-u']);
  if (unmerged === null || unmerged.length > 0) return CustomsReadings.refused('merge-unresolved', unmerged ?? ['ls-files']);
  const mergeCommit = mergeCommitOf(subject);
  const whitespaceRule = merge.conflictedFiles.length > 0 ? whitespaceRuleOf(worktreePath) : '';
  const unclean = GitArgumentsUtil.pathspecChunksOf(merge.conflictedFiles, GIT_PATHSPEC_ARGUMENT_CHARACTERS).some((chunk) => {
    const markersAndWhitespace = CustomsReadings.worktreeGitRun(
      worktreePath, ['-c', `core.whitespace=${whitespaceRule}`, 'diff', '--check', merge.branchTip, 'HEAD', '--', ...chunk],
    );
    return !GitProcess.succeeded(markersAndWhitespace);
  });
  if (unclean) return CustomsReadings.refused('merge-unresolved', [...merge.conflictedFiles]);
  const parents = mergeCommit === null ? null : CustomsReadings.gitLines(worktreePath, ['rev-list', '--parents', '-n', '1', mergeCommit])?.[0]?.split(' ').slice(1);
  const expected = [merge.branchTip, merge.targetTip];
  return JSON.stringify(parents) === JSON.stringify(expected) ? PASSED : CustomsReadings.refused('merge-unresolved', parents ?? []);
}

/** The pipeline agent reads a snapshot and changes nothing in it: a commit, even one on top of the start, moved its HEAD. */
function headUnmoved(subject: CustomsSubject): CheckVerdict {
  const headCommit = CustomsReadings.worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return CustomsReadings.refused('git-failed', ['HEAD']);
  return headCommit === subject.startCommit ? PASSED : CustomsReadings.refused('head-moved', [subject.startCommit, headCommit]);
}

export const CustomsHistoryChecks = Object.freeze({
  commitMessageIsAttributed,
  headDescendsFromTheStart,
  aCommitSinceTheStart,
  retriedFailedBuildJobIdOf,
  worktreeIsClean,
  noAiAttributionInRange,
  mergeIsResolved,
  headUnmoved,
});
