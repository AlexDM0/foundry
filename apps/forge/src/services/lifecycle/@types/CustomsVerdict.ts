import type { ReportProblem } from '../../../adapters/reports/@types/ReportProblem.ts';

import type { CustomsSubject } from './CustomsSubject.ts';

export type VerificationCheck =
  | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9' | 'V10' | 'V11' | 'V12' | 'V13' | 'V14' | 'V15' | 'V16' | 'V17' | 'V18';

export type VerificationRefusalReason =
  | 'report-invalid'
  | 'head-not-reported'
  | 'history-rewritten'
  | 'no-commit-since-start'
  | 'worktree-dirty'
  | 'data-folder-touched'
  | 'ticket-content-changed'
  | 'ticket-documents-changed'
  | 'ai-attribution-in-range'
  | 'acceptance-without-evidence'
  | 'fixed-finding-outside-range'
  | 'merge-unresolved'
  | 'checks-definition-changed'
  | 'changed-outside-home-and-reach'
  | 'changed-only-outside-home-and-reach'
  | 'sealed-change-altered'
  | 'constitution-outside-ticket-entity'
  | 'instruction-file-changed'
  | 'finding-not-filed-by-job'
  | 'branch-touches-agent-config'
  | 'foreign-ref-moved'
  | 'gate-unclaimed'
  | 'head-moved'
  | 'git-failed';

/** `facts` name what failed: paths, commits or labels, never words; an invalid report's `reportProblems` are worded where they are shown. */
export type CheckVerdict =
  | { verdict: 'passed' }
  | { verdict: 'refused'; reason: VerificationRefusalReason; facts: readonly string[]; reportProblems?: readonly ReportProblem[] };

export type CustomsVerdict =
  | { verdict: 'verified' }
  | { verdict: 'refused'; check: VerificationCheck; reason: VerificationRefusalReason; facts: readonly string[]; reportProblems?: readonly ReportProblem[] };

export type VerificationCheckRun = (subject: CustomsSubject) => CheckVerdict;
