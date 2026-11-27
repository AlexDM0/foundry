/**
 * The moves on a ticket document's agent: the agent's own proposal, ready, effect reading and question through its Hatch, each refused
 * unless its job is the live agent of that ticket document, and User's effect reading of a version and stop of the agent's running turn.
 */
import type { DecisionOpened }                                                         from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { DecisionQuestionOption }                                                 from '../../domain/tracker-model/@types/Decision.ts';
import type { LiveDocumentAgent }                                                      from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                                              from '../../domain/tracker-model/@types/LogRecord.ts';
import type { DocumentProposal, LineEdit, LineRange }                                  from '../../domain/tracker-model/@types/TicketDocument.ts';
import type { ProposalSubmission }                                                     from '../../domain/tracker-model/TicketDocuments.ts';
import { CommentAnchorUtil }                                                           from '../../domain/tracker-model/utils/CommentAnchorUtil.ts';
import { DocumentAgentJobUtil }                                                        from '../../domain/tracker-model/utils/DocumentAgentJobUtil.ts';
import { OptionConsequencesUtil }                                                      from '../../domain/tracker-model/utils/OptionConsequencesUtil.ts';
import type { ControlCommandKind, ControlCommandOf, DocumentQuestionOptionSubmission } from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }                                                         from '../../shared/@types/ControlContext.ts';
import type { EffectReadingRequest }                                                   from '../../shared/@types/EffectReading.ts';
import { OperationRefusal }                                                            from '../../shared/OperationRefusal.ts';
import type { BoardTransaction }                                                       from '../tracker/BoardTransaction.ts';
import { ticketIdOfReference }                                                         from './ControlTicketLookup.ts';
import { ticketDocumentMoveJudgesOf }                                                  from './TicketDocumentMoveJudges.ts';

const MESSAGE_ID_PATTERN = /^M[1-9][0-9]*$/;

/** The options a document agent's question offers, as many as its agent's own question tool takes. */
const QUESTION_OPTION_COUNT = { least: 2, most: 4 } as const;

/** A move only Hephaestus stamps the snapshot of: without the stamp the move cannot say which main line the agent read. */
function stampedCommitOf(agent: LiveDocumentAgent, constitutionCommit: string | undefined): string {
  if (constitutionCommit === undefined || constitutionCommit === '') {
    throw new OperationRefusal('refused', {
      kind: 'document-agent-not-live', ticketId: agent.ticketId, document: agent.document, jobId: agent.job.id
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
  const agent      = change.board.liveDocumentAgentOf(command.jobId);
  const submission = submissionOf(command, forSpecNumberOf(agent));
  const commit     = stampedCommitOf(agent, command.constitutionCommit);
  const judges     = ticketDocumentMoveJudgesOf(agent.document);
  const { proposal, logged } = change.board.ticketDocuments().propose(agent.ticketId, agent.document, agent.job.id, submission, commit, judges, change.at);
  return { proposal, logged };
}

function markReady(command: ControlCommandOf<'ticket-document-agent-ready'>, change: BoardTransaction): { jobId: string; logged: readonly LogRecord[] } {
  const agent  = change.board.liveDocumentAgentOf(command.jobId);
  const commit = stampedCommitOf(agent, command.constitutionCommit);
  const { logged } = change.board.ticketDocuments().markReady(
    agent.ticketId, agent.document, commit, ticketDocumentMoveJudgesOf(agent.document), change.at, forSpecNumberOf(agent)
  );
  return { jobId: agent.job.id, logged };
}

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function questionOptionOf(value: unknown, index: number): DecisionQuestionOption {
  const field = `options[${index}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) malformed('ticket-document-agent-ask', field);
  const option = value as Readonly<Record<string, unknown>> & DocumentQuestionOptionSubmission;
  if (!isFilledText(option.label)) malformed('ticket-document-agent-ask', `${field}.label`);
  if (option.description !== undefined && typeof option.description !== 'string') malformed('ticket-document-agent-ask', `${field}.description`);
  if (option.recommended !== undefined && typeof option.recommended !== 'boolean') malformed('ticket-document-agent-ask', `${field}.recommended`);
  if (!OptionConsequencesUtil.factsAreWellFormed(option)) malformed('ticket-document-agent-ask', field);
  return {
    label:         option.label.trim(),
    description:   option.description?.trim() ?? '',
    isRecommended: option.recommended === true,
    ...OptionConsequencesUtil.consequencesCopyOf(option),
  };
}

/** Two to four options of distinct labels, at most one of them recommended; the agent's JSON is checked as untrusted. */
function questionOptionsOf(options: unknown): DecisionQuestionOption[] {
  const { least, most } = QUESTION_OPTION_COUNT;
  if (!Array.isArray(options) || options.length < least || options.length > most) malformed('ticket-document-agent-ask', 'options');
  const read = options.map(questionOptionOf);
  if (new Set(read.map((option) => option.label)).size !== read.length) malformed('ticket-document-agent-ask', 'options');
  if (read.filter((option) => option.isRecommended).length > 1) malformed('ticket-document-agent-ask', 'options');
  return read;
}

/** Lines `from` to `to` of the version, both held by it. */
function questionLinesOf(lines: unknown, versionText: string): LineRange {
  const lineCount = versionText.split('\n').length;
  if (typeof lines !== 'object' || lines === null) malformed('ticket-document-agent-ask', 'lines');
  const { from, to } = lines as Record<string, unknown>;
  if (!isWholeNumberAtLeast(from, 1) || !isWholeNumberAtLeast(to, from) || to > lineCount) malformed('ticket-document-agent-ask', 'lines');
  return { from, to };
}

/**
 * The agent's question opens an `agent-question` decision on its ticket, for its document, anchored on the lines it names at the version it
 * read. The job keeps running: the answer comes back as the document's next message.
 */
function ask(command: ControlCommandOf<'ticket-document-agent-ask'>, change: BoardTransaction): DecisionOpened {
  const agent = change.board.liveDocumentAgentOf(command.jobId);
  change.board.ticketDocuments().requireHeldVersion(agent.ticketId, agent.document, command.version);
  const versionText = change.board.ticketDocuments().versionTextOf(agent.ticketId, agent.document, command.version) ?? '';
  if (!isFilledText(command.question)) malformed(command.kind, 'question');
  if (command.context !== undefined && typeof command.context !== 'string') malformed(command.kind, 'context');
  const options = questionOptionsOf(command.options);
  const lines   = questionLinesOf(command.lines, versionText);
  return change.board.openDecision({
    kind:      'agent-question',
    ticketIds: [agent.ticketId],
    jobId:     agent.job.id,
    askedBy:   agent.job.role ?? DocumentAgentJobUtil.roleOf(agent.document),
    requestId: null,
    questions: [{
      question: command.question.trim(), header: agent.document, multiSelect: false, options
    }],
    context:  command.context?.trim() ?? '',
    document: agent.document,
    anchor:   CommentAnchorUtil.anchorOfLines(versionText, command.version, lines),
  }, change.at);
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
  const agent = change.board.liveDocumentAgentOf(command.jobId);
  change.board.ticketDocuments().requireHeldVersion(agent.ticketId, agent.document, command.version);
  const request = requestReading(context, command.kind, {
    ticketId: agent.ticketId, document: agent.document, versionNumber: command.version, requestedByAgent: true
  });
  return { request, logged: [] };
}

function readEffect(command: ControlCommandOf<'ticket-document-effect-read'>, change: BoardTransaction, context: ControlContext): EffectReadingRequest {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  change.board.ticketDocuments().requireHeldVersion(ticketId, command.document, command.version);
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
  change.board.ticketDocuments().requireHeldDocument(ticketId, command.document);
  const agent = DocumentAgentJobUtil.liveAgentOf(change.board.jobs(), ticketId, command.document);
  if (agent?.state !== 'running') return { changed: false, jobId: agent?.id ?? null };
  change.board.moveJob(agent.id, 'stopping', change.at);
  return { changed: true, jobId: agent.id };
}

export const DOCUMENT_AGENT_CONTROLS = {
  'ticket-document-agent-propose':     propose,
  'ticket-document-agent-ready':       markReady,
  'ticket-document-agent-effect-read': readAgentEffect,
  'ticket-document-agent-ask':         ask,
  'ticket-document-effect-read':       readEffect,
  'ticket-document-turn-stop':         stopTurn,
} as const;
