/**
 * The moves on a ticket document's agent: the agent's own proposal, ready and effect reading through its Hatch, each refused unless its job
 * is the live agent of that ticket document, and User's effect reading of a version and stop of the agent's running turn.
 */
import type { Job }                                            from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                      from '../../lib/tracker-model/@types/LogRecord.ts';
import type { DocumentProposal, LineEdit, TicketDocumentKind } from '../../lib/tracker-model/@types/TicketDocument.ts';
import type { Board }                                          from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                        from '../../lib/tracker-model/BoardRefusal.ts';
import type { ProposalSubmission }                             from '../../lib/tracker-model/TicketDocuments.ts';
import { DocumentAgentJobUtil }                                from '../../lib/tracker-model/utils/DocumentAgentJobUtil.ts';
import { TicketDocumentVersionUtil }                           from '../../lib/tracker-model/utils/TicketDocumentVersionUtil.ts';
import type { ControlCommandKind, ControlCommandOf }           from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }                                 from '../../shared/@types/ControlContext.ts';
import type { EffectReadingRequest }                           from '../../shared/@types/EffectReading.ts';
import { OperationRefusal }                                    from '../../shared/OperationRefusal.ts';
import type { BoardTransaction }                               from '../tracker/BoardTransaction.ts';
import { ticketIdOfReference }                                 from './ControlTicketLookup.ts';
import { ticketDocumentMoveJudgesOf }                          from './TicketDocumentMoveJudges.ts';

/** The live agent job and the ticket document it writes. */
interface LiveDocumentAgent {
  job:      Readonly<Job>;
  ticketId: string;
  document: TicketDocumentKind;
}

const MESSAGE_ID_PATTERN = /^M[1-9][0-9]*$/;

/** The job the Bouncer stamped, while it is the one document agent on the board for its ticket's document. */
function liveDocumentAgentOf(board: Board, jobId: string | undefined): LiveDocumentAgent {
  const job      = jobId === undefined ? undefined : board.jobById(jobId);
  const document = job === undefined ? null : DocumentAgentJobUtil.documentOf(job);
  const ticketId = job?.ticketIds[0];
  if (job === undefined || document === null || ticketId === undefined) {
    throw new BoardRefusal({
      reason: 'document-agent-not-live', ticketId: ticketId ?? '', document: document ?? 'spec', jobId: jobId ?? ''
    });
  }
  if (DocumentAgentJobUtil.liveAgentOf(board.jobs(), ticketId, document)?.id !== job.id || board.ticketDocuments().documentOf(ticketId, document) === null) {
    throw new BoardRefusal({
      reason: 'document-agent-not-live', ticketId, document, jobId: job.id
    });
  }
  return { job, ticketId, document };
}

/** A move only Hephaestus stamps the snapshot of: without the stamp the move cannot say which main line the agent read. */
function stampedCommitOf(agent: LiveDocumentAgent, constitutionCommit: string | undefined): string {
  if (constitutionCommit === undefined || constitutionCommit === '') {
    throw new BoardRefusal({
      reason: 'document-agent-not-live', ticketId: agent.ticketId, document: agent.document, jobId: agent.job.id
    });
  }
  return constitutionCommit;
}

function malformed(commandKind: ControlCommandKind, field: string): never {
  throw new OperationRefusal('refused', { kind: 'malformed-setup-command', commandKind, field });
}

function isWholeNumberAtLeast(value: unknown, least: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= least;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((line) => typeof line === 'string');
}

/** An edit names its lines: `toLine` one before `fromLine` inserts before `fromLine`. */
function lineEditIsShaped(value: unknown): value is LineEdit {
  if (typeof value !== 'object' || value === null) return false;
  const {
    fromLine, toLine, originalLines, replacementLines
  } = value as Record<string, unknown>;
  return isWholeNumberAtLeast(fromLine, 1) && isWholeNumberAtLeast(toLine, fromLine - 1) && isTextList(originalLines) && isTextList(replacementLines);
}

/** The relayed payload is the agent's own JSON, so each field is checked as untrusted before the Board sees it. */
function submissionOf(command: ControlCommandOf<'ticket-document-agent-propose'>, forSpecNumber: number | null): ProposalSubmission {
  const { kind } = command;
  if (command.baseVersion !== null && !isWholeNumberAtLeast(command.baseVersion, 1)) malformed(kind, 'baseVersion');
  if (!Array.isArray(command.edits) || !command.edits.every(lineEditIsShaped)) malformed(kind, 'edits');
  if (typeof command.summary !== 'string' || command.summary.trim() === '') malformed(kind, 'summary');
  if (command.answers !== undefined && (typeof command.answers !== 'string' || !MESSAGE_ID_PATTERN.test(command.answers))) malformed(kind, 'answers');
  return {
    baseNumber: command.baseVersion,
    edits:      command.edits.map((edit) => ({
      fromLine: edit.fromLine, toLine: edit.toLine, originalLines: [...edit.originalLines], replacementLines: [...edit.replacementLines]
    })),
    summary: command.summary,
    ...(command.answers === undefined ? {} : { answersMessageId: command.answers }),
    ...(forSpecNumber === null ? {} : { forSpecNumber }),
  };
}

/** A plan is written for the spec version its agent was given, the attempt it launched with; `null` for a spec. */
function forSpecNumberOf(agent: LiveDocumentAgent): number | null {
  return agent.document === 'plan' ? agent.job.attempt : null;
}

function propose(command: ControlCommandOf<'ticket-document-agent-propose'>, change: BoardTransaction): { proposal: Readonly<DocumentProposal>; logged: readonly LogRecord[] } {
  const agent      = liveDocumentAgentOf(change.board, command.jobId);
  const submission = submissionOf(command, forSpecNumberOf(agent));
  const commit     = stampedCommitOf(agent, command.constitutionCommit);
  const judges     = ticketDocumentMoveJudgesOf(agent.document);
  const { proposal, logged } = change.board.ticketDocuments().propose(agent.ticketId, agent.document, agent.job.id, submission, commit, judges, change.at);
  return { proposal, logged };
}

function markReady(command: ControlCommandOf<'ticket-document-agent-ready'>, change: BoardTransaction): { jobId: string; logged: readonly LogRecord[] } {
  const agent  = liveDocumentAgentOf(change.board, command.jobId);
  const commit = stampedCommitOf(agent, command.constitutionCommit);
  const { logged } = change.board.ticketDocuments().markReady(
    agent.ticketId, agent.document, commit, ticketDocumentMoveJudgesOf(agent.document), change.at, forSpecNumberOf(agent)
  );
  return { jobId: agent.job.id, logged };
}

/** The version must be one the document holds; a reading of another is refused naming the head. */
function requireVersion(board: Board, ticketId: string, document: TicketDocumentKind, version: number): void {
  const held = board.ticketDocuments().documentOf(ticketId, document);
  if (held === null) throw new BoardRefusal({ reason: 'ticket-has-no-documents', ticketId });
  const namedVersion = isWholeNumberAtLeast(version, 1) ? version : null;
  if (namedVersion === null || TicketDocumentVersionUtil.versionOfNumber(held, namedVersion) === null) {
    const headNumber = TicketDocumentVersionUtil.headOf(held)?.number ?? null;
    throw new BoardRefusal({
      reason: 'document-version-moved', ticketId, document, version: namedVersion, headNumber
    });
  }
}

/** Only a live Hephaestus runs readings: outside it the command is refused before anything is asked. */
function requestReading(context: ControlContext, commandKind: ControlCommandKind, request: EffectReadingRequest): EffectReadingRequest {
  if (context.effectReadings === undefined) throw new OperationRefusal('refused', { kind: 'hephaestus-control-is-runtime-only', commandKind });
  context.effectReadings.request(request);
  return request;
}

function readAgentEffect(
  command: ControlCommandOf<'ticket-document-agent-effect-read'>, change: BoardTransaction, context: ControlContext
): { request: EffectReadingRequest; logged: readonly LogRecord[] } {
  const agent = liveDocumentAgentOf(change.board, command.jobId);
  requireVersion(change.board, agent.ticketId, agent.document, command.version);
  const request = requestReading(context, command.kind, {
    ticketId: agent.ticketId, document: agent.document, versionNumber: command.version, requestedByAgent: true
  });
  return { request, logged: [] };
}

function readEffect(command: ControlCommandOf<'ticket-document-effect-read'>, change: BoardTransaction, context: ControlContext): EffectReadingRequest {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  requireVersion(change.board, ticketId, command.document, command.version);
  return requestReading(context, command.kind, {
    ticketId, document: command.document, versionNumber: command.version, requestedByAgent: false
  });
}

/**
 * The running turn ends: the agent's input closes and its session is stopped after the grace, which keeps the session, so the next queued
 * message resumes it. An agent with no running turn has nothing to stop.
 */
function stopTurn(command: ControlCommandOf<'ticket-document-turn-stop'>, change: BoardTransaction): { changed: boolean; jobId: string | null } {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  if (change.board.ticketDocuments().documentOf(ticketId, command.document) === null) throw new BoardRefusal({ reason: 'ticket-has-no-documents', ticketId });
  const agent = DocumentAgentJobUtil.liveAgentOf(change.board.jobs(), ticketId, command.document);
  if (agent?.state !== 'running') return { changed: false, jobId: agent?.id ?? null };
  change.board.moveJob(agent.id, 'stopping', change.at);
  return { changed: true, jobId: agent.id };
}

export const DOCUMENT_AGENT_CONTROLS = {
  'ticket-document-agent-propose':     propose,
  'ticket-document-agent-ready':       markReady,
  'ticket-document-agent-effect-read': readAgentEffect,
  'ticket-document-effect-read':       readEffect,
  'ticket-document-turn-stop':         stopTurn,
} as const;
