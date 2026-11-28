/** The checks that hold the report's own claims: its schema and head, its Acceptance, its findings and its gates. */
import {
  ADAPT_BUILDER_REPORT_SCHEMA,
  AIRLOCK_AGENT_REPORT_SCHEMA,
  BUILDER_REPORT_SCHEMA,
  PACKAGE_BUILDER_REPORT_SCHEMA,
  PACKAGE_REVIEWER_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from '../../adapters/reports/ReportSchemas.ts';
import { reportVerdictOf, type JsonSchema } from '../../adapters/reports/ReportValidation.ts';
import { TicketAcceptanceUtil }             from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import type { LogRecord }                   from '../../domain/tracker-model/@types/LogRecord.ts';
import type { TicketStageName }             from '../../domain/tracker-model/@types/Task.ts';

import type { CustomsSubject, ReportingRole } from './@types/CustomsSubject.ts';
import type { CheckVerdict }                  from './@types/CustomsVerdict.ts';
import { CustomsReadings, PASSED }            from './CustomsReadings.ts';

const REPORT_SCHEMA_OF_ROLE: Readonly<Record<ReportingRole, JsonSchema>> = {
  'builder':       BUILDER_REPORT_SCHEMA,
  'reviewer':      REVIEWER_REPORT_SCHEMA,
  'airlock-agent': AIRLOCK_AGENT_REPORT_SCHEMA,
};

/**
 * A package stage's report carries the statement of what the package exposes: the package builder states it, its reviewer confirms it.
 * An adapt build's report may send the ticket back to a sealed package.
 */
function reportSchemaOf(role: ReportingRole, stageName: TicketStageName | null): JsonSchema {
  if (role === 'builder' && stageName === 'package-build') return PACKAGE_BUILDER_REPORT_SCHEMA;
  if (role === 'reviewer' && stageName === 'package-review') return PACKAGE_REVIEWER_REPORT_SCHEMA;
  if (role === 'builder' && stageName === 'adapt') return ADAPT_BUILDER_REPORT_SCHEMA;
  return REPORT_SCHEMA_OF_ROLE[role];
}

function reportIsValidWithItsHead(subject: CustomsSubject): CheckVerdict {
  if (subject.role === 'pipeline-agent' || subject.role === 'document-agent') return CustomsReadings.refused('report-invalid', ['no report']);
  const verdict = reportVerdictOf(reportSchemaOf(subject.role, CustomsReadings.crossingStageNameOf(subject)), subject.report);
  if (verdict.verdict === 'invalid') return {
    verdict: 'refused', reason: 'report-invalid', facts: [], reportProblems: verdict.problems
  };
  const headCommit = CustomsReadings.worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return CustomsReadings.refused('git-failed', ['HEAD']);
  const reportedHead = String(CustomsReadings.reportFieldOf(subject.report, 'headCommit'));
  return reportedHead === headCommit ? PASSED : CustomsReadings.refused('head-not-reported', [reportedHead, headCommit]);
}

/**
 * A builder accounts for each item with evidence or a waiver proposal; a reviewer with a claim. An item the Acceptance waives needs neither,
 * and a package stage accounts for none: the home stages own the evidence for the ticket's Acceptance.
 */
function everyAcceptanceItemAccountedFor(subject: CustomsSubject): CheckVerdict {
  if (CustomsReadings.inAPackageStage(subject)) return PASSED;
  const labels  = TicketAcceptanceUtil.acceptanceItemsOf(subject.acceptanceText ?? subject.ticketBody)
    .filter(({ waivedReason }) => waivedReason === null)
    .map(({ label }) => label);
  const covered = subject.role === 'reviewer'
    ? CustomsReadings.reportListOf(subject.report, 'claims').map((claim) => String(claim['item']).trim())
    : CustomsReadings.reportListOf(subject.report, 'acceptance')
      .filter((entry) => entry['state'] === 'waiver-proposed' || String(entry['evidence'] ?? '').trim() !== '')
      .map((entry) => String(entry['item']).trim());
  const missing = labels.filter((label) => !covered.includes(label));
  return missing.length === 0 ? PASSED : CustomsReadings.refused('acceptance-without-evidence', missing);
}

function fixedFindingsNameCommitsInRange(subject: CustomsSubject): CheckVerdict {
  const commits = CustomsReadings.gitLines(subject.worktreePath, ['rev-list', ...CustomsReadings.rangeArgumentsOf(subject)]);
  if (commits === null) return CustomsReadings.refused('git-failed', [CustomsReadings.rangeOf(subject)]);
  const outside = CustomsReadings.reportListOf(subject.report, 'findings')
    .filter((finding) => finding['outcome'] === 'fixed')
    .map((finding) => String(finding['commit']))
    .filter((commit) => !commits.includes(commit));
  return outside.length === 0 ? PASSED : CustomsReadings.refused('fixed-finding-outside-range', outside);
}

/** Every gate but a `forgeOnly` one must be claimed on HEAD itself; a claim on any other commit is stale, and an unknown name is ignored. */
function everyAgentGateClaimedOnHead(subject: CustomsSubject): CheckVerdict {
  const headCommit = CustomsReadings.worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return CustomsReadings.refused('git-failed', ['HEAD']);
  const claimedOnHead = CustomsReadings.reportListOf(subject.report, 'gates').filter((claim) => claim['commit'] === headCommit).map((claim) => String(claim['name']));
  const unclaimed = (subject.gates ?? []).filter((gate) => gate.forgeOnly !== true && !claimedOnHead.includes(gate.name)).map((gate) => gate.name);
  return unclaimed.length === 0 ? PASSED : CustomsReadings.refused('gate-unclaimed', unclaimed);
}

function ticketNumberOf(ticketReference: string): number {
  return Number(ticketReference.replace(/^#/, ''));
}

/** The ticket a relayed request filed: the nearest `ticket-filed` this job logged before the request's `hatch-applied`, in the same application. */
function ticketIdFiledByRequest(records: readonly LogRecord[], jobId: string, requestId: string): string | null {
  const appliedIndex = records.findIndex((record) => record.kind === 'hatch-applied' && record.jobId === jobId && record.fields.requestId === requestId);
  for (let i = appliedIndex - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record === undefined || record.kind === 'hatch-applied') return null;
    if (record.kind === 'ticket-filed' && record.fields.filedByJob === jobId) return record.ticketId;
  }
  return null;
}

/** The filed-findings check reads the filing record, never the ticket now: the filing's own close, or User, may have moved it since. */
function filingIsThisJobsLowFinding(records: readonly LogRecord[], jobId: string, ticketId: string): boolean {
  return records.some((record) => record.kind === 'ticket-filed'
    && ticketNumberOf(record.ticketId) === ticketNumberOf(ticketId)
    && record.fields.filedByJob === jobId
    && record.fields.status === 'draft'
    && record.fields.priority === 'low');
}

/** A reviewer's filed findings, each a draft low ticket this job filed through its Hatch. */
function filedFindingsWereFiledByThisJob(subject: CustomsSubject): CheckVerdict {
  const records = subject.logRecords ?? [];
  const jobId = subject.jobId ?? '';
  const filed = CustomsReadings.reportListOf(subject.report, 'findings').filter((finding) => finding['outcome'] === 'filed');
  const unproven = filed.flatMap((finding) => {
    const namedTicketId = typeof finding['filedTicketId'] === 'string' ? finding['filedTicketId'] : null;
    const requestId = typeof finding['hatchRequestId'] === 'string' ? finding['hatchRequestId'] : null;
    const ticketId = namedTicketId ?? (requestId === null ? null : ticketIdFiledByRequest(records, jobId, requestId));
    if (ticketId !== null && filingIsThisJobsLowFinding(records, jobId, ticketId)) return [];
    return [namedTicketId ?? requestId ?? 'unnamed'];
  });
  return unproven.length === 0 ? PASSED : CustomsReadings.refused('finding-not-filed-by-job', unproven);
}

export const CustomsReportChecks = Object.freeze({
  reportIsValidWithItsHead,
  everyAcceptanceItemAccountedFor,
  fixedFindingsNameCommitsInRange,
  everyAgentGateClaimedOnHead,
  ticketIdFiledByRequest,
  filedFindingsWereFiledByThisJob,
});
