/**
 * Hephaestus's side of the Hatch: each job folder `<W>/hatch/<J>/` maps to its job record, which alone gives a request its job and role.
 * A request is applied in the DrivePass hold and logged on a `hatch-applied` record, so a replay never applies it twice; its reply is
 * written only once the hold committed, or again from that record when it was lost.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

import type { HatchReply, HatchRequestReading }          from '../../adapters/hatch/@types/HatchFormat.ts';
import { hatchReplyFilePathOf, hatchRequestFilePathOf }  from '../../adapters/hatch/HatchFolder.ts';
import { HatchRequestIngestion }                         from '../../adapters/hatch/HatchRequestIngestion.ts';
import { HATCH_FORMAT_VERSION }                          from '../../adapters/hatch/constants/HatchFormatVersion.ts';
import { writeFileAtomically }                           from '../../lib/atomic-file/AtomicFile.ts';
import type { Job, JobState }                            from '../../lib/tracker-model/@types/Job.ts';
import type { HatchAppliedRecord, LogRecordFieldsOf }    from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }                                    from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                  from '../../lib/tracker-model/BoardRefusal.ts';
import type { BoardRefusalDetail }                       from '../../lib/tracker-model/BoardRefusal.ts';
import { DocumentAgentJobUtil }                          from '../../lib/tracker-model/utils/DocumentAgentJobUtil.ts';
import type { ControlCommand }                           from '../../shared/@types/ControlCommand.ts';
import type { ControlContext, SetupMessage }             from '../../shared/@types/ControlContext.ts';
import type { EffectReadingSource }                      from '../../shared/@types/EffectReading.ts';
import { OperationRefusal, type OperationRefusalDetail } from '../../shared/OperationRefusal.ts';
import { WorktreesFolder }                               from '../../shared/WorktreesFolder.ts';
import { Bouncer, type RelayingJob }                     from '../control/Bouncer.ts';
import { ControlService }                                from '../control/ControlService.ts';
import type { BoardTransaction }                         from '../tracker/BoardTransaction.ts';
import { PipelineAgentSessions }                         from './PipelineAgentSessions.ts';

export interface PendingHatchRequest {
  jobId:     string;
  requestId: string;
  reading:   HatchRequestReading;
}

export interface HatchReplyToWrite {
  hatchDirectory: string;
  reply:          HatchReply;
}

/** A job past verification has nothing a session could still be waiting on, and an ended one has left the board. */
const HATCH_READABLE_STATES: ReadonlySet<JobState> = new Set([
  'launching', 'preparing', 'running', 'waiting-for-answer', 'interrupted', 'awaiting-answer', 'in-customs', 'stopping',
]);

/**
 * The Bouncer admits no User setup command from a session, so a relayed command never words a setup message, reads main's constitution or
 * judges a billing; one that did is a Bouncer defect, which fails the hold rather than send a message nobody worded. A relayed command is applied inside
 * the live Hephaestus's own hold, so no other Hephaestus owns its board.
 */
const RELAYED_COMMAND_CONTEXT: ControlContext = Object.freeze({
  setupMessageWordingOf: (message: SetupMessage): string => {
    throw new Error(`A relayed command reached the setup message ${message.kind}, which only User's own commands send.`);
  },
  mainConstitutionOf: (): never => {
    throw new Error('A relayed command reached the reading of main\'s constitution, which only User\'s own commands read.');
  },
  liveHephaestusOf:      () => null,
  offeredBillingModesOf: (vendor: string): never => {
    throw new Error(`A relayed command reached the billing of ${vendor}, which only User's own commands set.`);
  },
});

/** The relayed context with the live Hephaestus's effect readings, which a document agent's turn-end requests may ask for. */
function relayedContextWith(effectReadings: EffectReadingSource): ControlContext {
  return Object.freeze({ ...RELAYED_COMMAND_CONTEXT, effectReadings });
}

const REQUEST_FILE_PATTERN = /^(.+)\.json$/;

function hatchDirectoryOf(repositoryRoot: string, jobId: string): string {
  return join(WorktreesFolder.hatchRootOf(repositoryRoot), jobId);
}

function hatchIsReadable(job: Readonly<Job> | undefined): boolean {
  return job !== undefined && HATCH_READABLE_STATES.has(job.state);
}

function requestIdsIn(hatchDirectory: string): string[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(join(hatchDirectory, 'requests'));
  } catch {
    return [];
  }
  return fileNames.map((fileName) => REQUEST_FILE_PATTERN.exec(fileName)?.[1]).filter((requestId): requestId is string => requestId !== undefined).sort();
}

function replyExists(hatchDirectory: string, requestId: string): boolean {
  try {
    readFileSync(hatchReplyFilePathOf(hatchDirectory, requestId));
    return true;
  } catch {
    return false;
  }
}

/** Outside the lock: every unanswered request of each job whose folder may be read, in request-id order within a job. */
function pendingRequestsOf(repositoryRoot: string, jobs: readonly Readonly<Job>[]): PendingHatchRequest[] {
  return jobs.filter(hatchIsReadable).flatMap((job) => {
    const hatchDirectory = hatchDirectoryOf(repositoryRoot, job.id);
    return requestIdsIn(hatchDirectory)
      .filter((requestId) => !replyExists(hatchDirectory, requestId))
      .flatMap((requestId) => {
        // A request naming another format waits for a Hephaestus that reads it, after a restart; one naming none is malformed.
        const stored = new HatchRequestIngestion(hatchRequestFilePathOf(hatchDirectory, requestId)).read();
        return stored.verdict === 'readable' ? [{ jobId: job.id, requestId, reading: stored.reading }] : [];
      });
  });
}

/** The packages sealed for the ticket of a job of an entity, which no need may name; nothing for any other job. */
function sealedPackagesOf(board: Board, job: Readonly<Job>): Pick<RelayingJob, 'sealedPackages'> {
  const [ticketId] = job.ticketIds;
  if (job.entity === undefined || ticketId === undefined) return {};
  const sealedPackages = Object.keys(board.ticketSealsOf(ticketId));
  return sealedPackages.length === 0 ? {} : { sealedPackages };
}

function relayingJobOf(board: Board, job: Readonly<Job>): RelayingJob {
  const served = PipelineAgentSessions.servedLevelOf(board, job.id);
  return {
    id:           job.id,
    role:         job.role,
    ticketIds:    job.ticketIds,
    filedTickets: board.tickets()
      .filter((ticket) => ticket.frontmatter.filedByJob === job.id)
      .map((ticket) => ({ id: ticket.frontmatter.id, status: ticket.frontmatter.status })),
    deliveredIncidents:                 board.incidents().filter((incident) => incident.deliveredInTurn?.jobId === job.id),
    ticketIdsReadyForReviewOrCommitted: board.tickets()
      .filter((ticket) => ticket.frontmatter.status === 'ready-for-review' || ticket.frontmatter.status === 'committed')
      .map((ticket) => ticket.frontmatter.id),
    setupId: served?.setup.setupId ?? null,
    ...(served === null || served.entityKey === null ? {} : { setupEntity: served.entityKey }),
    ...(job.entity === undefined ? {} : { entity: job.entity }),
    ...sealedPackagesOf(board, job),
  };
}

/** The tickets a control command's result names, so the relayed verb can print them as a direct run would. */
function ticketIdsOf(result: unknown): string[] {
  if (typeof result !== 'object' || result === null) return [];
  const { ticket, tickets } = result as { ticket?: { frontmatter?: { id?: unknown } }; tickets?: { frontmatter?: { id?: unknown } }[] };
  const named = [...(ticket === undefined ? [] : [ticket]), ...(Array.isArray(tickets) ? tickets : [])];
  return named.map((each) => each.frontmatter?.id).filter((ticketId): ticketId is string => typeof ticketId === 'string');
}

function refusedReply(requestId: string, status: OperationRefusal['status'], detail: OperationRefusalDetail): HatchReply {
  return {
    hatchFormatVersion: HATCH_FORMAT_VERSION, requestId, outcome: 'refused', status, detail
  };
}

function replyOfRefusal(requestId: string, thrown: unknown): HatchReply {
  if (thrown instanceof BoardRefusal) return refusedReply(requestId, 'refused', { kind: 'board-refusal', boardRefusal: thrown.detail });
  if (thrown instanceof OperationRefusal && thrown.detail !== null) return refusedReply(requestId, thrown.status, thrown.detail);
  throw thrown;
}

/** A document agent's admitted move carries the commit of its snapshot, which only Hephaestus knows. */
function stampedCommandOf(command: ControlCommand, snapshotCommit: string | null): ControlCommand {
  if (snapshotCommit === null || (command.kind !== 'ticket-document-agent-propose' && command.kind !== 'ticket-document-agent-ready')) return command;
  return { ...command, constitutionCommit: snapshotCommit };
}

function replyOf(
  change: BoardTransaction,
  job: Readonly<Job>,
  request: PendingHatchRequest,
  context: ControlContext = RELAYED_COMMAND_CONTEXT,
  snapshotCommit: string | null = null,
): { reply: HatchReply; commandKind: string } {
  const { reading } = request;
  if (reading.verdict === 'refused') {
    const detail: OperationRefusalDetail = reading.reason === 'hatch-identity-mismatch'
      ? { kind: 'hatch-identity-mismatch', requestId: request.requestId, jobId: job.id }
      : { kind: 'malformed-hatch-request', requestId: request.requestId };
    return { reply: refusedReply(request.requestId, 'refused', detail), commandKind: 'unread' };
  }
  // The file's name is the id the session waits on; a body naming another is a request copied from elsewhere.
  if (reading.requestId !== request.requestId) {
    const detail: OperationRefusalDetail = { kind: 'hatch-identity-mismatch', requestId: request.requestId, jobId: job.id };
    return { reply: refusedReply(request.requestId, 'refused', detail), commandKind: reading.command.kind };
  }
  const verdict = Bouncer.verdictOf(relayingJobOf(change.board, job), reading.command);
  if (verdict.verdict === 'refused') {
    const detail: OperationRefusalDetail = { kind: 'role-command-refused', reason: verdict.reason, commandKind: reading.command.kind };
    return { reply: refusedReply(request.requestId, 'refused', detail), commandKind: reading.command.kind };
  }
  try {
    const applied = ControlService.apply(stampedCommandOf(verdict.command, snapshotCommit), change, context);
    return {
      reply: {
        hatchFormatVersion: HATCH_FORMAT_VERSION, requestId: request.requestId, outcome: applied.outcome, ticketIds: ticketIdsOf(applied.result)
      },
      commandKind: reading.command.kind,
    };
  } catch (thrown) {
    return { reply: replyOfRefusal(request.requestId, thrown), commandKind: reading.command.kind };
  }
}

function appliedFieldsOf(reply: HatchReply, commandKind: string): LogRecordFieldsOf<'hatch-applied'> {
  const { requestId, outcome } = reply;
  if (reply.outcome === 'refused') return {
    requestId, commandKind, outcome, status: reply.status, detail: reply.detail
  };
  return {
    requestId, commandKind, outcome, ticketIds: reply.ticketIds
  };
}

/** The reply an applied request was answered with, from its record; null for a record that does not carry it. */
function replyRebuiltFrom(applied: HatchAppliedRecord): HatchReply | null {
  const {
    requestId, outcome, ticketIds, status, detail
  } = applied.fields;
  if ((outcome === 'done' || outcome === 'nothing-to-do') && ticketIds !== undefined) {
    return {
      hatchFormatVersion: HATCH_FORMAT_VERSION, requestId, outcome, ticketIds: [...ticketIds]
    };
  }
  if (outcome === 'refused' && status !== undefined && detail !== undefined) {
    return refusedReply(requestId, status, detail as unknown as OperationRefusalDetail);
  }
  return null;
}

/**
 * Inside the hold, before any child event: each request of a job still on the board and readable is applied once, whatever its verdict,
 * and logged with its reply. A request already applied whose reply was lost after its hold committed gets that reply again, unapplied. The
 * replies are returned for Hephaestus to write once the hold has committed.
 */
function applyPendingRequests(change: BoardTransaction, repositoryRoot: string, pending: readonly PendingHatchRequest[]): HatchReplyToWrite[] {
  const heldUntilTurnEnd = (request: PendingHatchRequest): boolean => {
    const job = change.board.jobById(request.jobId);
    return job !== undefined && DocumentAgentJobUtil.documentOf(job) !== null;
  };
  return applyEach(change, repositoryRoot, pending.filter((request) => !heldUntilTurnEnd(request)), (job, request) => replyOf(change, job, request));
}

/**
 * A document agent's requests, held until its turn ended and Customs found its snapshot clean: applied as any request is, with the live
 * Hephaestus's context and its snapshot's commit stamped on its document moves.
 */
function applyTurnEndRequests(
  change: BoardTransaction, repositoryRoot: string, pending: readonly PendingHatchRequest[], context: ControlContext, snapshotCommit: string | null,
): HatchReplyToWrite[] {
  return applyEach(change, repositoryRoot, pending, (job, request) => replyOf(change, job, request, context, snapshotCommit));
}

/** Every request refused with the Board's refusal, applying none, as a turn whose snapshot changed is. */
function refuseRequests(change: BoardTransaction, repositoryRoot: string, pending: readonly PendingHatchRequest[], refusal: BoardRefusalDetail): HatchReplyToWrite[] {
  return applyEach(change, repositoryRoot, pending, (_job, request) => ({
    reply:       refusedReply(request.requestId, 'refused', { kind: 'board-refusal', boardRefusal: refusal }),
    commandKind: commandKindOf(request),
  }));
}

function commandKindOf(request: PendingHatchRequest): string {
  return request.reading.verdict === 'read' ? request.reading.command.kind : 'unread';
}

function applyEach(
  change: BoardTransaction,
  repositoryRoot: string,
  pending: readonly PendingHatchRequest[],
  replyFor: (job: Readonly<Job>, request: PendingHatchRequest) => { reply: HatchReply; commandKind: string },
): HatchReplyToWrite[] {
  const replies: HatchReplyToWrite[] = [];
  for (const request of pending) {
    const job = change.board.jobById(request.jobId);
    if (job === undefined || !hatchIsReadable(job)) continue;
    const hatchDirectory = hatchDirectoryOf(repositoryRoot, job.id);
    const applied        = change.board.hatchAppliedRecordOf(request.requestId);
    if (applied !== null) {
      const rebuilt = applied.jobId === job.id ? replyRebuiltFrom(applied) : null;
      if (rebuilt !== null) replies.push({ hatchDirectory, reply: rebuilt });
      continue;
    }
    const { reply, commandKind } = replyFor(job, request);
    change.board.recordHatchApplied(job.id, appliedFieldsOf(reply, commandKind), change.at);
    replies.push({ hatchDirectory, reply });
  }
  return replies;
}

function writeReplies(replies: readonly HatchReplyToWrite[]): void {
  for (const { hatchDirectory, reply } of replies) {
    writeFileAtomically(hatchReplyFilePathOf(hatchDirectory, reply.requestId), `${JSON.stringify(reply, null, 2)}\n`);
  }
}

export const HatchInbox = Object.freeze({
  hatchDirectoryOf, relayedContextWith, pendingRequestsOf, applyPendingRequests, applyTurnEndRequests, refuseRequests, writeReplies
});
