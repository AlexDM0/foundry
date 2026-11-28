/**
 * What a verified and gated review pass leads to, computed by code: its rework, its `## Review <round>`, its record,
 * the round verdict, and the move it makes: a failed pass back to a fixer, a fresh reviewer, a waiver for User, or the merge queue, which
 * with merge approval on waits for the merge of the target into the ticket's worktree first.
 */
import { join } from 'node:path';

import type { WaiverProposalsProblem }                   from '../../adapters/waiver-proposals/@types/WaiverProposalsProblem.ts';
import { WaiverProposalsIngestion, type WaiverProposal } from '../../adapters/waiver-proposals/WaiverProposalsIngestion.ts';
import { createWaiverProposalsWriter }                   from '../../adapters/waiver-proposals/WaiverProposalsWriter.ts';
import type { Job }                                      from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                 from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording }           from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { ReviewClaim, ReviewFinding }               from '../../domain/tracker-model/@types/ReviewRecord.ts';
import type { RoundLimits }                              from '../../domain/tracker-model/@types/ReviewRound.ts';
import type { Board }                                    from '../../domain/tracker-model/Board.ts';
import { PipelineUtil }                                  from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { RoundVerdictUtil }                              from '../../domain/tracker-model/utils/RoundVerdictUtil.ts';
import { TicketStageUtil }                               from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { readChangeSize, readCommitsDiff }               from '../../lib/git/BranchDiffs.ts';
import { GitProcess }                                    from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                  from '../../lib/git/GitWorktrees.ts';
import { TICKET_SECTION_PATTERNS }                       from '../../shared/constants/TicketSectionPatterns.ts';
import { ReworkCountUtil }                               from '../../shared/rework/utils/ReworkCountUtil.ts';
import { CustomsReportChecks }                           from './CustomsReportChecks.ts';

export interface ReviewPassRequest {
  board:             Board;
  at:                string;
  job:               Readonly<Job>;
  /** Verified: it holds the reviewer report schema and its `headCommit` is the worktree's HEAD. */
  report:            unknown;
  worktreePath:      string;
  reviewStartCommit: string;
  /** The worktree HEAD's tree the gates just passed: the ticket is queued only while its row's green is current on it. */
  headTree:          string;
  /** The hephaestus-written folder of the job, where its waiver proposals wait for User's answer. */
  jobFolder:         string;
  /** The fallback thresholds: the board's pipeline sets the rework threshold (`RoundVerdictUtil.roundLimitsOf`). */
  limits:            RoundLimits;
  decisionWordingOf: (draft: DecisionDraft) => DecisionWording;
  /** Present only for the package review of a crossing ticket (stage 3), which settles its verdict through it. */
  packageReview?:    PackageReviewSettlement;
}

/**
 * The package review of a crossing ticket: its rounds and its record as any review's, but it moves neither the ticket's status nor its merge
 * queue. It writes no `## Review`, since the home stages read its text from its job folder, and it proposes no waiver, since no package
 * stage accounts for the ticket's Acceptance.
 */
export interface PackageReviewSettlement {
  /**
   * The review does not hold: the package build runs again with `reviewSection`, the Review the ticket does not hold. Called after the
   * job ended `does-not-hold`; returns its records.
   */
  sendBackToThePackageBuild: (reviewSection: string) => readonly LogRecord[];
  /** The review holds: the seal, the statement, the job's end and the next stage; returns their records. */
  sealAndMoveOn:             (headCommit: string) => readonly LogRecord[];
}

export type ReviewPassMove = 'fixer' | 'fresh-reviewer' | 'waiver' | 'merge-queued';

export interface ReviewPassOutcome {
  move:          ReviewPassMove;
  reworkedLines: number;
  headCommit:    string;
  logged:        LogRecord[];
}

/** The answer that refuses a waiver; any other grants it. */
export const WAIVER_REFUSAL_ANSWER = 'refuse';

const WAIVER_PROPOSALS_FILE = 'waiver-proposals.json';

const NO_CHANGES_SUBJECT = (round: number, ticketId: string): string => `Review round ${round} of #${ticketId}: no changes`;

function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

function listOf(report: unknown, field: string): Record<string, unknown>[] {
  const value = typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

function textOf(report: unknown, field: string): string {
  const value = typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
  return typeof value === 'string' ? value : '';
}

/** Code lines only, as a rework count counts them; a range git cannot read as plain commits counts nothing. */
function reworkedCodeLinesOf(worktreePath: string, reviewStartCommit: string, headCommit: string): number {
  const reading = readCommitsDiff(worktreePath, reviewStartCommit, headCommit);
  if (reading.verdict !== 'read') return 0;
  const files = ReworkCountUtil.readDiff(reading.diffText).map((file) => ReworkCountUtil.reworkOfFile(file));
  return ReworkCountUtil.partReworkOf(ReworkCountUtil.combineFileReworks([files])).reworkedCodeLines;
}

/** A review that changed nothing still leaves its round on the branch, committed by code. */
function commitNoChanges(worktreePath: string, round: number, ticketId: string): string | null {
  const ceilingDirectory = GitWorktrees.ceilingOf(worktreePath);
  const commitArguments = ['commit', '--allow-empty', '--no-verify', '-q', '-m', NO_CHANGES_SUBJECT(round, ticketId)];
  const committed = GitProcess.run(worktreePath, commitArguments, 'hooks-off', undefined, ceilingDirectory);
  return GitProcess.succeeded(committed) ? GitProcess.resolvedCommitOf(worktreePath, 'HEAD', ceilingDirectory) : null;
}

function claimsOf(report: unknown): ReviewClaim[] {
  return listOf(report, 'claims').map((claim) => ({
    item:                String(claim['item']).trim(),
    result:              claim['result'] as ReviewClaim['result'],
    handoffContradicted: claim['handoffContradicted'] === true,
  }));
}

/** A filed finding stores the ticket it filed; one named by its request id alone resolves through the ticket this job filed for it. */
function findingsOf(report: unknown, filedTicketIdOfRequest: (requestId: string) => string): ReviewFinding[] {
  return listOf(report, 'findings').map((finding) => {
    const description = {
      class:    finding['class'],
      severity: finding['severity'],
      file:     String(finding['file']),
      summary:  String(finding['summary']),
      evidence: finding['evidence'],
    } as Omit<ReviewFinding, 'outcome' | 'commit' | 'filedTicketId'>;
    if (finding['outcome'] === 'fixed') return { ...description, outcome: 'fixed', commit: String(finding['commit']) };
    const filedTicketId = typeof finding['filedTicketId'] === 'string' ? finding['filedTicketId'] : filedTicketIdOfRequest(String(finding['hatchRequestId']));
    return { ...description, outcome: 'filed', filedTicketId };
  });
}

function filedTicketIdResolver(records: readonly LogRecord[], jobId: string): (requestId: string) => string {
  return (requestId) => CustomsReportChecks.ticketIdFiledByRequest(records, jobId, requestId) ?? requestId;
}

function reviewSectionOf(round: number, report: unknown, claims: readonly ReviewClaim[], findings: readonly ReviewFinding[]): string {
  const claimLines = listOf(report, 'claims').map((claim, i) => {
    const note = String(claim['note'] ?? '').trim();
    return `- ${claims[i]?.item ?? ''} ${claims[i]?.result ?? ''}${note === '' ? '' : ` — ${note}`}`;
  });
  const findingLines = findings.map((finding) => (finding.outcome === 'fixed'
    ? `- ${finding.class} in ${finding.file}: ${finding.summary} (fixed in ${finding.commit})`
    : `- ${finding.class} in ${finding.file}: ${finding.summary} (filed as #${finding.filedTicketId.replace(/^#/, '')})`));
  return [
    `## Review ${round}`,
    '',
    textOf(report, 'reviewText').trim(),
    ...(claimLines.length === 0 ? [] : ['', ...claimLines]),
    ...(findingLines.length === 0 ? [] : ['', ...findingLines]),
    '',
  ].join('\n');
}

function appendSection(body: string, section: string): string {
  return `${body.replace(/\n*$/, '')}\n\n${section}`;
}

/**
 * The ticket's earlier rounds as the round verdict reads them: every review recorded on the board for it, and for a ticket that crosses
 * into a package only those of the job's own stage, whose bar carries it.
 */
function recordedRoundsOf(board: Board, job: Readonly<Job>): { round: number; findings: { class: string; file: string }[] }[] {
  const ticketId = ticketIdOf(job);
  const jobStage = board.ticketStageOf(ticketId) === null ? null : TicketStageUtil.stageOfJob(job);
  const stageBarIds = jobStage === null ? null : new Set(board.tasks()
    .filter((task) => task.reviewOf === ticketId && task.stage?.name === jobStage.name && task.stage.entity === jobStage.entity)
    .map((task) => task.id));
  return board.logRecordsSoFar().flatMap((record) => (record.kind === 'review-recorded' && record.ticketId === ticketId && (stageBarIds?.has(record.taskId) ?? true)
    ? [{ round: record.fields.round, findings: record.fields.findings.map((finding) => ({ class: finding.class, file: finding.file })) }]
    : []));
}

/**
 * The pipeline whose review sets the rework threshold: for a ticket that crosses into a package, the reviewing entity's; for any
 * other, the ticket's own (`Board.ticketPipelineOf`), its entity's on a pipeline with entities.
 */
function reviewingPipelineOf(board: Board, job: Readonly<Job>): Readonly<Pipeline> | null {
  const pipeline = board.pipeline();
  const jobStage = board.ticketStageOf(ticketIdOf(job)) === null ? null : TicketStageUtil.stageOfJob(job);
  if (pipeline === null) return null;
  if (jobStage === null) return board.ticketPipelineOf(ticketIdOf(job));
  return PipelineUtil.pipelineOfEntity(pipeline, jobStage.entity) ?? pipeline;
}

function waiverProposalsPathOf(jobFolder: string): string {
  return join(jobFolder, WAIVER_PROPOSALS_FILE);
}

/** In the hold after the reviewer's gate passed. */
function settleReviewPass(request: ReviewPassRequest): ReviewPassOutcome {
  const {
    board, at, job, report, worktreePath, reviewStartCommit
  } = request;
  const ticketId = ticketIdOf(job);
  const round = job.attempt;
  const logged: LogRecord[] = [];
  const reportedHead = textOf(report, 'headCommit');
  const headCommit = reportedHead === reviewStartCommit ? commitNoChanges(worktreePath, round, ticketId) ?? reportedHead : reportedHead;
  const reworkedLines = reworkedCodeLinesOf(worktreePath, reviewStartCommit, headCommit);
  const records = board.logRecordsSoFar();
  const claims = claimsOf(report);
  const findings = findingsOf(report, filedTicketIdResolver(records, job.id));
  const { packageReview } = request;
  const reviewSection = reviewSectionOf(round, report, claims, findings);
  if (packageReview === undefined) {
    const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
    const bodyWithReview = appendSection(ticket?.body ?? '', reviewSection);
    logged.push(...board.editTicket(ticketId, { body: { text: bodyWithReview, appends: false }, writtenBy: 'board' }, at).logged);
  }

  const failed = claims.some((claim) => claim.result === 'does-not-hold');
  const proposals = packageReview !== undefined ? [] : listOf(report, 'claims')
    .filter((claim) => claim['result'] === 'waiver-proposed')
    .map((claim) => ({ item: String(claim['item']).trim(), reason: String(claim['note'] ?? '').trim() }));
  const roundLimits = RoundVerdictUtil.roundLimitsOf(reviewingPipelineOf(board, job), request.limits);
  const verdict = failed ? null : RoundVerdictUtil.nextRoundVerdictOf(recordedRoundsOf(board, job), { round, findings, reworkedLines }, roundLimits);
  const move: ReviewPassMove = failed ? 'fixer' : verdict?.granted === true ? 'fresh-reviewer' : proposals.length > 0 ? 'waiver' : 'merge-queued';
  const recordedVerdict = {
    'fixer': 'does-not-hold', 'fresh-reviewer': 'round-requested', 'waiver': 'not-released', 'merge-queued': 'released'
  } as const;
  const changeSize = readChangeSize(worktreePath, job.target ?? reviewStartCommit, reviewStartCommit);
  const builderChange = changeSize.verdict === 'read' ? changeSize : { changedFiles: 0, insertions: 0, deletions: 0 };
  if (!board.inProgressReviewOfIds().includes(ticketId)) logged.push(...board.startReviewBar(ticketId, { round, owner: job.id }, at).logged);
  logged.push(...board.recordReview(ticketId, {
    verdict:                 recordedVerdict[move],
    reviewStartCommit,
    fixReworkedCodeLines:    reworkedLines,
    rebaseReworkedCodeLines: 0,
    totalReworkedCodeLines:  reworkedLines,
    builderChangedFiles:     builderChange.changedFiles,
    builderInsertions:       builderChange.insertions,
    builderDeletions:        builderChange.deletions,
    claims,
    findings,
  }, at).logged);

  if (packageReview !== undefined && move !== 'fresh-reviewer') {
    if (move === 'fixer') {
      logged.push(...board.endJob(job.id, { outcome: 'does-not-hold', commit: headCommit }, at).logged);
      logged.push(...packageReview.sendBackToThePackageBuild(reviewSection.trim()));
    } else {
      logged.push(...packageReview.sealAndMoveOn(headCommit));
    }
    return {
      move, reworkedLines, headCommit, logged
    };
  }
  switch (move) {
    case 'fixer':
      logged.push(...board.endJob(job.id, { outcome: 'does-not-hold', commit: headCommit }, at).logged);
      logged.push(...board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, at).logged);
      break;
    case 'fresh-reviewer':
      logged.push(...board.endJob(job.id, { outcome: 'round-granted', commit: headCommit }, at).logged);
      break;
    case 'waiver': {
      createWaiverProposalsWriter(waiverProposalsPathOf(request.jobFolder)).write(proposals);
      board.setTicketMergeQueued(ticketId, false, at);
      const draft: DecisionDraft = { kind: 'waiver', ticketIds: [ticketId], jobId: job.id };
      logged.push(...board.openDecision({
        ...draft, askedBy: 'reviewer', requestId: null, ...request.decisionWordingOf(draft)
      }, at).logged);
      logged.push(...board.moveJob(job.id, 'awaiting-answer', at).logged);
      break;
    }
    case 'merge-queued':
      // With merge approval on, the passing review waits in `merging-main`: the target merges into its worktree before User's Merge.
      if (board.mergeApprovalIsOn()) {
        logged.push(...board.moveJob(job.id, 'merging-main', at).logged);
        break;
      }
      logged.push(...board.endJob(job.id, { outcome: 'reviewed', commit: headCommit }, at).logged);
      // A gate run that read a pipeline changed since leaves a green that is not current: the ticket waits unqueued for its next review.
      if (board.greenIsCurrent(ticketId, request.headTree, board.greenPhaseOf(ticketId))) {
        logged.push(...board.queueTicketForMerge(ticketId, job.target ?? '', request.headTree, at).logged);
      }
      break;
  }
  return {
    move, reworkedLines, headCommit, logged
  };
}

/** Each proposed item's Acceptance line becomes `A<n>. Waived: <reason>`, its continuation lines folded into the reason it replaces. */
function bodyWithWaivedItems(body: string, proposals: readonly WaiverProposal[]): string {
  const lineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(lineEnding);
  let insideAcceptance = false;
  const kept: string[] = [];
  let skippingContinuation = false;
  for (const line of lines) {
    if (TICKET_SECTION_PATTERNS.SECTION_BOUNDARY.test(line)) insideAcceptance = TICKET_SECTION_PATTERNS.ACCEPTANCE_HEADING.test(line);
    const itemLine = insideAcceptance ? TICKET_SECTION_PATTERNS.ACCEPTANCE_ITEM_LINE.exec(line) : null;
    if (skippingContinuation && (itemLine !== null || line.trim() === '' || !insideAcceptance)) skippingContinuation = false;
    if (skippingContinuation) continue;
    const proposal = itemLine === null ? undefined : proposals.find((each) => each.item === `A${Number(itemLine[1])}`);
    if (itemLine !== null && proposal !== undefined) {
      kept.push(`A${Number(itemLine[1])}. Waived: ${proposal.reason}`);
      skippingContinuation = true;
      continue;
    }
    kept.push(line);
  }
  return kept.join(lineEnding);
}

/** What acting on a waiver answer did: its records, or the stored proposals a grant needed that could not be read, on which it did nothing. */
export type WaiverAnswerOutcome =
  | { verdict: 'acted'; logged: LogRecord[] }
  | { verdict: 'proposals-unreadable'; proposalsPath: string; problem: WaiverProposalsProblem };

/**
 * Acts on User's recorded answer to the `waiver` decision: a grant writes each proposed item waived and queues the ticket while its green is
 * current on `headTree` (else it waits for a fresh review), a refusal fails the pass; a grant with missing proposals waives nothing it cannot
 * name and fails the same way, and one with unreadable proposals leaves the job waiting, for its caller to open that file's incident.
 */
function actOnWaiverAnswer(
  board: Board, jobId: string, answers: readonly string[], jobFolder: string, headTree: string | null, at: string
): WaiverAnswerOutcome {
  const job = board.jobById(jobId);
  if (job === undefined) return { verdict: 'acted', logged: [] };
  const ticketId = ticketIdOf(job);
  const logged: LogRecord[] = [];
  const endAsFailedPass = (cause: string): WaiverAnswerOutcome => {
    logged.push(...board.endJob(job.id, { outcome: 'does-not-hold', cause }, at).logged);
    logged.push(...board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, at).logged);
    return { verdict: 'acted', logged };
  };
  if (answers.some((answer) => answer.trim().toLowerCase().startsWith(WAIVER_REFUSAL_ANSWER))) return endAsFailedPass('waiver-refused');
  const proposalsPath = waiverProposalsPathOf(jobFolder);
  const reading = new WaiverProposalsIngestion(proposalsPath).read();
  if (reading.verdict === 'unreadable') return { verdict: 'proposals-unreadable', proposalsPath, problem: reading.problem };
  if (reading.verdict === 'absent') return endAsFailedPass('waiver-proposals-unreadable');
  const body = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId)?.body ?? '';
  logged.push(...board.editTicket(ticketId, { body: { text: bodyWithWaivedItems(body, reading.proposals), appends: false }, writtenBy: 'board' }, at).logged);
  logged.push(...board.endJob(job.id, { outcome: 'reviewed' }, at).logged);
  if (board.greenIsCurrent(ticketId, headTree, board.greenPhaseOf(ticketId))) logged.push(...board.queueTicketForMerge(ticketId, job.target ?? '', headTree, at).logged);
  return { verdict: 'acted', logged };
}

/** A failed pass takes no round verdict, and a granted one is converging: neither was refused another round. */
const VERDICTS_TAKING_NO_REFUSED_ROUND: readonly string[] = ['round-requested', 'does-not-hold'];

type ReviewRecordedRecord = Extract<LogRecord, { kind: 'review-recorded' }>;

/**
 * The pipeline whose review a recorded pass ran: on a bar of a stage, the stage's entity's, the one Settle measured the pass against;
 * otherwise the ticket's own (`Board.ticketPipelineOf`).
 */
function recordedReviewPipelineOf(board: Board, record: ReviewRecordedRecord): Readonly<Pipeline> | null {
  const pipeline = board.pipeline();
  const barStage = board.tasks().find((task) => task.id === record.taskId)?.stage;
  if (pipeline === null || barStage === undefined) return board.ticketPipelineOf(record.ticketId);
  return PipelineUtil.pipelineOfEntity(pipeline, barStage.entity) ?? board.ticketPipelineOf(record.ticketId);
}

/**
 * The tickets whose newest review reworked past the threshold yet was refused another round: the findings are not converging. Each newest
 * review is measured against the threshold of the pipeline whose review it ran (`recordedReviewPipelineOf`); a review with no re-review
 * grants no round, so no ticket of it is refused one.
 */
function nonConvergingTicketIdsOf(
  records: readonly LogRecord[], reviewedPipelineOf: (record: ReviewRecordedRecord) => Readonly<Pipeline> | null, fallbackLimits: RoundLimits
): string[] {
  const thresholdLinesOf = (record: ReviewRecordedRecord): number | null => {
    return RoundVerdictUtil.roundLimitsOf(reviewedPipelineOf(record), fallbackLimits).REWORK_ROUND_THRESHOLD_LINES;
  };
  const newestByTicketId = new Map<string, ReviewRecordedRecord>();
  for (const record of records) {
    if (record.kind === 'review-recorded') newestByTicketId.set(record.ticketId, record);
    if (record.kind === 'ticket-delivered' || record.kind === 'ticket-abandoned') newestByTicketId.delete(record.ticketId);
  }
  return [...newestByTicketId.values()]
    .filter((record) => {
      const thresholdLines = thresholdLinesOf(record);
      return thresholdLines !== null && record.fields.totalReworkedCodeLines > thresholdLines && !VERDICTS_TAKING_NO_REFUSED_ROUND.includes(record.fields.verdict);
    })
    .map((record) => record.ticketId)
    .sort();
}

export const ReviewOutcome = Object.freeze({
  settleReviewPass,
  reviewingPipelineOf,
  actOnWaiverAnswer,
  recordedReviewPipelineOf,
  nonConvergingTicketIdsOf,
  bodyWithWaivedItems,
});
