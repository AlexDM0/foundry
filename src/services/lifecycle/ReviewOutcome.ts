/**
 * What a verified and gated review pass leads to, computed by code (design section 5.3): its rework, its `## Review <round>`, its record,
 * the round verdict, and the move it makes: a failed pass back to a fixer, a fresh reviewer, a waiver for User, or the merge queue, which
 * with merge approval on waits for the merge of the target into the ticket's worktree first.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { writeFileAtomically }                 from '../../lib/atomic-file/AtomicFile.ts';
import { readChangeSize, readCommitsDiff }     from '../../lib/git/BranchDiffs.ts';
import { GitProcess }                          from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                        from '../../lib/git/GitWorktrees.ts';
import type { DecisionAnswer }                 from '../../lib/tracker-model/@types/Decision.ts';
import type { Job }                            from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                      from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                       from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording } from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { ReviewClaim, ReviewFinding }     from '../../lib/tracker-model/@types/ReviewRecord.ts';
import type { RoundLimits }                    from '../../lib/tracker-model/@types/ReviewRound.ts';
import type { Board }                          from '../../lib/tracker-model/Board.ts';
import { RoundVerdictUtil }                    from '../../lib/tracker-model/utils/RoundVerdictUtil.ts';
import { TICKET_SECTION_PATTERNS }             from '../../shared/constants/TicketSectionPatterns.ts';
import { ReworkCountUtil }                     from '../../shared/rework/utils/ReworkCountUtil.ts';
import { ticketIdFiledByRequest }              from './Customs.ts';

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
  /** The overseer-written folder of the job, where its waiver proposals wait for User's answer. */
  jobFolder:         string;
  /** The fallback thresholds: the board's pipeline sets the rework threshold (`RoundVerdictUtil.roundLimitsOf`). */
  limits:            RoundLimits;
  decisionWordingOf: (draft: DecisionDraft) => DecisionWording;
}

export type ReviewPassMove = 'fixer' | 'fresh-reviewer' | 'waiver' | 'merge-queued';

export interface ReviewPassOutcome {
  move:          ReviewPassMove;
  reworkedLines: number;
  headCommit:    string;
  logged:        LogRecord[];
}

interface WaiverProposal {
  item:   string;
  reason: string;
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
  return (requestId) => ticketIdFiledByRequest(records, jobId, requestId) ?? requestId;
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

/** The ticket's earlier rounds as the round verdict reads them: every review recorded on the board for it. */
function recordedRoundsOf(records: readonly LogRecord[], ticketId: string): { round: number; findings: { class: string; file: string }[] }[] {
  return records.flatMap((record) => (record.kind === 'review-recorded' && record.ticketId === ticketId
    ? [{ round: record.fields.round, findings: record.fields.findings.map((finding) => ({ class: finding.class, file: finding.file })) }]
    : []));
}

function waiverProposalsPathOf(jobFolder: string): string {
  return join(jobFolder, WAIVER_PROPOSALS_FILE);
}

type WaiverProposalsReading = { verdict: 'read'; proposals: WaiverProposal[] } | { verdict: 'unreadable' };

function isWaiverProposal(value: unknown): value is WaiverProposal {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>)['item'] === 'string' && typeof (value as Record<string, unknown>)['reason'] === 'string';
}

/** A settled waiver always stores at least one proposal, so an empty list is as unreadable as a missing or malformed file. */
function readWaiverProposals(jobFolder: string): WaiverProposalsReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(waiverProposalsPathOf(jobFolder), 'utf8'));
  } catch {
    return { verdict: 'unreadable' };
  }
  return Array.isArray(parsed) && parsed.length > 0 && parsed.every(isWaiverProposal) ? { verdict: 'read', proposals: parsed } : { verdict: 'unreadable' };
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
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
  const bodyWithReview = appendSection(ticket?.body ?? '', reviewSectionOf(round, report, claims, findings));
  logged.push(...board.editTicket(ticketId, { body: { text: bodyWithReview, appends: false }, allowsPastPending: true }, at).logged);

  const failed = claims.some((claim) => claim.result === 'does-not-hold');
  const proposals = listOf(report, 'claims')
    .filter((claim) => claim['result'] === 'waiver-proposed')
    .map((claim) => ({ item: String(claim['item']).trim(), reason: String(claim['note'] ?? '').trim() }));
  const roundLimits = RoundVerdictUtil.roundLimitsOf(board.pipeline(), request.limits);
  const verdict = failed ? null : RoundVerdictUtil.nextRoundVerdictOf(recordedRoundsOf(records, ticketId), { round, findings, reworkedLines }, roundLimits);
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

  switch (move) {
    case 'fixer':
      logged.push(...board.endJob(job.id, { outcome: 'does-not-hold', commit: headCommit }, at).logged);
      logged.push(...board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, at).logged);
      break;
    case 'fresh-reviewer':
      logged.push(...board.endJob(job.id, { outcome: 'round-granted', commit: headCommit }, at).logged);
      break;
    case 'waiver': {
      writeFileAtomically(waiverProposalsPathOf(request.jobFolder), `${JSON.stringify(proposals, null, 2)}\n`);
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

/**
 * Answers a `waiver` decision and acts on it in the same hold: granted, each proposed item is written waived and the ticket queued to
 * merge while its green is current on `headTree`, its worktree HEAD's tree (else it waits unqueued for a fresh review, which gates it);
 * refused, the review ends as a failed pass and the ticket goes back to a fixer. A grant whose stored proposals cannot be read waives
 * nothing it cannot name, so it fails closed as that same failed pass.
 */
function answerWaiver(
  board: Board, decisionId: string, answers: readonly string[], jobFolder: string, headTree: string | null, at: string
): { answer: DecisionAnswer; logged: LogRecord[] } {
  const decision = board.decisionById(decisionId);
  const answered = board.answerDecision(decisionId, answers, at);
  const logged: LogRecord[] = [...answered.logged];
  const job = decision?.jobId === null || decision === undefined ? undefined : board.jobById(decision.jobId);
  if (decision?.kind !== 'waiver' || job === undefined) return { answer: answered.answer, logged };
  const ticketId = ticketIdOf(job);
  const endAsFailedPass = (cause: string): { answer: DecisionAnswer; logged: LogRecord[] } => {
    logged.push(...board.endJob(job.id, { outcome: 'does-not-hold', cause }, at).logged);
    logged.push(...board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, at).logged);
    return { answer: answered.answer, logged };
  };
  if (answers.some((answer) => answer.trim().toLowerCase().startsWith(WAIVER_REFUSAL_ANSWER))) return endAsFailedPass('waiver-refused');
  const reading = readWaiverProposals(jobFolder);
  if (reading.verdict === 'unreadable') return endAsFailedPass('waiver-proposals-unreadable');
  const body = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId)?.body ?? '';
  logged.push(...board.editTicket(ticketId, { body: { text: bodyWithWaivedItems(body, reading.proposals), appends: false }, allowsPastPending: true }, at).logged);
  logged.push(...board.endJob(job.id, { outcome: 'reviewed' }, at).logged);
  if (board.greenIsCurrent(ticketId, headTree, board.greenPhaseOf(ticketId))) logged.push(...board.queueTicketForMerge(ticketId, job.target ?? '', headTree, at).logged);
  return { answer: answered.answer, logged };
}

/** A failed pass takes no round verdict, and a granted one is converging: neither was refused another round. */
const VERDICTS_TAKING_NO_REFUSED_ROUND: readonly string[] = ['round-requested', 'does-not-hold'];

/**
 * The tickets whose newest review reworked past the threshold yet was refused another round: the findings are not converging. A pipeline
 * whose review has no re-review grants no round, so no ticket is refused one.
 */
function nonConvergingTicketIdsOf(records: readonly LogRecord[], pipeline: Readonly<Pipeline> | null, fallbackLimits: RoundLimits): string[] {
  const thresholdLines = RoundVerdictUtil.roundLimitsOf(pipeline, fallbackLimits).REWORK_ROUND_THRESHOLD_LINES;
  if (thresholdLines === null) return [];
  const newestByTicketId = new Map<string, Extract<LogRecord, { kind: 'review-recorded' }>>();
  for (const record of records) {
    if (record.kind === 'review-recorded') newestByTicketId.set(record.ticketId, record);
    if (record.kind === 'ticket-delivered' || record.kind === 'ticket-abandoned') newestByTicketId.delete(record.ticketId);
  }
  return [...newestByTicketId.values()]
    .filter((record) => record.fields.totalReworkedCodeLines > thresholdLines && !VERDICTS_TAKING_NO_REFUSED_ROUND.includes(record.fields.verdict))
    .map((record) => record.ticketId)
    .sort();
}

export const ReviewOutcome = Object.freeze({
  settleReviewPass,
  answerWaiver,
  nonConvergingTicketIdsOf,
  bodyWithWaivedItems,
});
