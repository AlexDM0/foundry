/**
 * Hephaestus's side of a spec or plan agent's session: one detached snapshot of the main line per ticket document, so the spec's and the
 * plan's agents never move or dirty each other's, checked out clean at main's tip at each launch of an instance; a profile writing only its
 * Hatch with no network; the facts of its first message; Customs at each turn end, before the turn's Hatch requests apply; and its
 * messages, written one at a time while it is idle, in the order User queued them. An idle agent with nothing queued has its input closed
 * and waits with no session, and the next message resumes it; an agent whose document is done ends `closed`. A document's snapshot is
 * removed once no agent of that document holds it.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join }                               from 'node:path';
import type { HephaestusLog }                 from '../../adapters/@types/HephaestusLogRecord.ts';

import { DeliveryBaseIngestion }                                                          from '../../adapters/delivery-base/DeliveryBaseIngestion.ts';
import { createDeliveryBaseWriter }                                                       from '../../adapters/delivery-base/DeliveryBaseWriter.ts';
import { SeenHeadIngestion }                                                              from '../../adapters/seen-head/SeenHeadIngestion.ts';
import { createSeenHeadWriter }                                                           from '../../adapters/seen-head/SeenHeadWriter.ts';
import { SnapshotStartIngestion, type SnapshotStart }                                     from '../../adapters/snapshot-start/SnapshotStartIngestion.ts';
import { createSnapshotStartWriter }                                                      from '../../adapters/snapshot-start/SnapshotStartWriter.ts';
import type { AgentAdapter }                                                              from '../../lib/agent-launch/AgentAdapter.ts';
import type { WorkerProfile }                                                             from '../../lib/agent-launch/WorkerProfile.ts';
import { GitProcess }                                                                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees, REAL_WORKTREE_REMOVAL_PRIMITIVES, type WorktreeRemovalPrimitives } from '../../lib/git/GitWorktrees.ts';
import type { Job }                                                                       from '../../lib/tracker-model/@types/Job.ts';
import type { DocumentMessage, TicketDocument, TicketDocumentKind }                       from '../../lib/tracker-model/@types/TicketDocument.ts';
import type { Board }                                                                     from '../../lib/tracker-model/Board.ts';
import { TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP }                                         from '../../lib/tracker-model/constants/Statuses.ts';
import { DocumentAgentJobUtil }                                                           from '../../lib/tracker-model/utils/DocumentAgentJobUtil.ts';
import { TicketDocumentVersionUtil }                                                      from '../../lib/tracker-model/utils/TicketDocumentVersionUtil.ts';
import type { ControlContext }                                                            from '../../shared/@types/ControlContext.ts';
import { clearCustoms, launchSnapshotOf, type CustomsVerdict }                            from '../lifecycle/Customs.ts';
import type { BoardTransaction }                                                          from '../tracker/BoardTransaction.ts';
import { projectLocationOf }                                                              from '../tracker/ProjectLocation.ts';
import type { BoardChildren }                                                             from './BoardChildren.ts';
import { DocumentAgentWording }                                                           from './DocumentAgentWording.ts';
import { HatchInbox, type HatchReplyToWrite, type PendingHatchRequest }                   from './HatchInbox.ts';
import { jobFileInDataFolderOf, jobFolderIn }                                             from './HephaestusFiles.ts';
import {
  DOCUMENT_AGENT_SNAPSHOT_FOLDER,
  PipelineAgentSessions,
  type SnapshotContext,
  type TurnEndContext
} from './PipelineAgentSessions.ts';
import { UnreadableJobFileIncident } from './UnreadableJobFileIncident.ts';

const SNAPSHOT_START_FILE = 'document-agent-start.json';

/** The newest delivery number of the document when the job launched: every message delivered after it went to this job. */
const LAUNCH_FILE = 'document-agent-launch.json';

/** The content hash of the head the agent saw last, so a message carries the head again only once it changed. */
const SEEN_HEAD_FILE = 'document-agent-seen-head.json';

/** One file `<deliveryNumber>.<instance>` per message line the instance took. */
const DELIVERY_MARKERS_FOLDER = 'document-messages';

const SNAPSHOT_TOUCHED_INCIDENT = 'document-snapshot-touched';

const FAILED_CAUSE = 'document-snapshot-touched';

const UNREADABLE_LAUNCH_FILE_CAUSE = 'system-file-unreadable';

/** What the agent's session printed in its current instance, read from its event log. */
export interface DocumentAgentReading {
  jobId:    string;
  instance: number;
  results:  number;
}

/** What a document agent's first message is filled from. */
export interface DocumentAgentFacts {
  document:     TicketDocumentKind;
  ticket:       { id: string; title: string; body: string };
  /** `write` a first version, `update` the plan for the newer approved spec, `read` the head and wait for the messages after it. */
  request:      'write' | 'update' | 'read';
  head:         { versionNumber: number; text: string } | null;
  /** For a plan: the spec version it is written for, the one approved at the spec's head; `null` for a spec or while none is. */
  approvedSpec: { versionNumber: number; text: string } | null;
}

function isDocumentAgentJob(job: Readonly<Job>): boolean {
  return DocumentAgentJobUtil.documentOf(job) !== null;
}

function documentOfJob(job: Readonly<Job>): TicketDocumentKind {
  return DocumentAgentJobUtil.documentOf(job) ?? 'spec';
}

/** `<ticketId>-<document>`: each document's agent reads a snapshot of its own. */
function snapshotDirectoryOf(worktreesRoot: string, job: Readonly<Job>): string {
  return join(worktreesRoot, DOCUMENT_AGENT_SNAPSHOT_FOLDER, `${job.ticketIds[0] ?? job.id}-${documentOfJob(job)}`);
}

/** Whether the snapshot holds a change or a file of its own; one git cannot read counts, so it is reset. */
function snapshotIsDirty(snapshot: string): boolean {
  const status = GitProcess.run(snapshot, ['status', '--porcelain=v1', '--untracked-files=all'], 'hooks-off', undefined, GitWorktrees.ceilingOf(snapshot));
  return status === null || !GitProcess.succeeded(status) || status.standardOutput.trim() !== '';
}

function documentOf(board: Board, job: Readonly<Job>): Readonly<TicketDocument> | null {
  return board.ticketDocuments().documentOf(job.ticketIds[0] ?? '', documentOfJob(job));
}

function newestDeliveryNumberOf(document: Readonly<TicketDocument> | null): number {
  return Math.max(0, ...(document?.messages ?? []).map((message) => message.deliveryNumber ?? 0));
}

/**
 * Before each launch of an instance: the document's snapshot exists and stands clean at main's tip, and HEAD and every ref are taken again,
 * so a turn end compares only what this session could have moved; one an earlier session left dirty is reset and cleaned first. A fresh job
 * also notes the document's newest delivery, after which every delivery is its own, and the head its first message shows.
 */
function prepareSnapshot(context: SnapshotContext, board: Board, job: Readonly<Job>): string {
  const snapshot = snapshotDirectoryOf(context.worktreesRoot, job);
  const { repositoryRoot } = projectLocationOf(context.workspace.rootDirectory);
  const mainTip = GitProcess.resolvedCommitOf(repositoryRoot, context.mainLine);
  if (existsSync(snapshot)) {
    const head = GitProcess.resolvedCommitOf(snapshot, 'HEAD', GitWorktrees.ceilingOf(snapshot));
    if (mainTip !== null && (head !== mainTip || snapshotIsDirty(snapshot))) {
      GitProcess.run(snapshot, ['reset', '--hard', '--quiet', mainTip], 'hooks-off', undefined, GitWorktrees.ceilingOf(snapshot));
      GitProcess.run(snapshot, ['clean', '-f', '-d', '-x', '--quiet'], 'hooks-off', undefined, GitWorktrees.ceilingOf(snapshot));
    }
  } else {
    mkdirSync(join(context.worktreesRoot, DOCUMENT_AGENT_SNAPSHOT_FOLDER), { recursive: true });
    GitProcess.run(repositoryRoot, ['worktree', 'add', '--quiet', '--detach', snapshot, mainTip ?? context.mainLine]);
  }
  const startCommit    = GitProcess.resolvedCommitOf(snapshot, 'HEAD', GitWorktrees.ceilingOf(snapshot));
  const launchSnapshot = launchSnapshotOf(snapshot);
  const jobFolder      = jobFolderIn(context.workspace.trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  if (startCommit !== null && launchSnapshot !== null) createSnapshotStartWriter(join(jobFolder, SNAPSHOT_START_FILE)).write({ startCommit, launchSnapshot });
  noteLaunch(context.workspace.trackerDirectory, board, job);
  return snapshot;
}

/** At a fresh job's first launch: the document's newest delivery, after which every delivery is this job's, and the head it is shown. */
function noteLaunch(trackerDirectory: string, board: Board, job: Readonly<Job>): void {
  const jobFolder = jobFolderIn(trackerDirectory, job.id);
  if (existsSync(join(jobFolder, LAUNCH_FILE))) return;
  mkdirSync(jobFolder, { recursive: true });
  const document = documentOf(board, job);
  createDeliveryBaseWriter(join(jobFolder, LAUNCH_FILE)).write(newestDeliveryNumberOf(document));
  writeSeenHead(jobFolder, document);
}

function writeSeenHead(jobFolder: string, document: Readonly<TicketDocument> | null): void {
  createSeenHeadWriter(join(jobFolder, SEEN_HEAD_FILE)).write(document === null ? null : TicketDocumentVersionUtil.headOf(document)?.contentHash ?? null);
}

/** It reads the snapshot and writes only its Hatch folder: no network, no question, no skill. */
function documentAgentProfileOf(sessionProfile: WorkerProfile, hatchDirectory: string): WorkerProfile {
  return {
    ...sessionProfile, writableRoots: [hatchDirectory], shellNetworkDomains: [], webNetworkDomains: 'none', askUser: false, skills: false, networkDomainGuard: null
  };
}

function versionTextOf(board: Board, ticketId: string, document: TicketDocumentKind, versionNumber: number | undefined): { versionNumber: number; text: string } | null {
  if (versionNumber === undefined) return null;
  const text = board.ticketDocuments().versionTextOf(ticketId, document, versionNumber);
  return text === null ? null : { versionNumber, text };
}

/** `null` for every other job. */
function documentAgentFactsOf(board: Board, job: Readonly<Job>): DocumentAgentFacts | null {
  if (!isDocumentAgentJob(job)) return null;
  const ticketId = job.ticketIds[0] ?? '';
  const document = documentOfJob(job);
  const ticket   = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
  const held     = board.ticketDocuments().documentOf(ticketId, document);
  const spec     = board.ticketDocuments().documentOf(ticketId, 'spec');
  const head     = versionTextOf(board, ticketId, document, held === null ? undefined : TicketDocumentVersionUtil.headOf(held)?.number);
  const approvedSpec = document === 'plan' && spec !== null ? versionTextOf(board, ticketId, 'spec', job.attempt) : null;
  const outOfDate = document === 'plan' && board.ticketDocuments().standingOf(ticketId, 'plan') === 'out-of-date';
  return {
    document,
    ticket:  { id: ticketId, title: ticket?.frontmatter.title ?? '', body: ticket?.body ?? '' },
    request: head === null ? 'write' : outOfDate ? 'update' : 'read',
    head,
    approvedSpec,
  };
}

function readingOf(children: BoardChildren, adapter: Pick<AgentAdapter, 'eventsOf'>, job: Readonly<Job>): DocumentAgentReading {
  const entries = children.eventsAfter(children.jobFolderOf(job.id), job.childInstance, 0);
  let results = 0;
  for (const entry of entries === 'malformed' ? [] : entries.filter((logged) => logged.origin === 'agent')) {
    for (const event of adapter.eventsOf(entry.line)) if (event.kind === 'result') results += 1;
  }
  return { jobId: job.id, instance: job.childInstance, results };
}

/** Outside the lock: each running agent's turns so far in its current instance. */
function readingsOf(children: BoardChildren, adapter: Pick<AgentAdapter, 'eventsOf'>, jobs: readonly Readonly<Job>[]): DocumentAgentReading[] {
  return jobs.filter((job) => isDocumentAgentJob(job) && job.state === 'running').map((job) => readingOf(children, adapter, job));
}

/** `null` before the launch was noted, and while its file cannot be read, for which `deliverWhenIdle` opens the incident in the hold. */
function deliveryBaseOf(jobFolder: string): number | null {
  const reading = new DeliveryBaseIngestion(join(jobFolder, LAUNCH_FILE)).read();
  return reading.verdict === 'readable' ? reading.deliveryBase : null;
}

/** Each delivery number the job's instances took, with the instance that took it. */
function takenDeliveriesOf(jobFolder: string): { deliveryNumber: number; instance: number }[] {
  let names: string[];
  try {
    names = readdirSync(join(jobFolder, DELIVERY_MARKERS_FOLDER));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const match = /^([1-9][0-9]*)\.([1-9][0-9]*)$/.exec(name);
    return match?.[1] === undefined || match[2] === undefined ? [] : [{ deliveryNumber: Number(match[1]), instance: Number(match[2]) }];
  });
}

/** The messages delivered to this job, in delivery order. */
function deliveredMessagesOf(document: Readonly<TicketDocument> | null, deliveryBase: number): Readonly<DocumentMessage>[] {
  return (document?.messages ?? [])
    .filter((message) => message.deliveryNumber !== undefined && message.deliveryNumber > deliveryBase)
    .sort((a, b) => (a.deliveryNumber ?? 0) - (b.deliveryNumber ?? 0));
}

/** Delivered on the board, its line not yet taken by a session. */
function pendingMessagesOf(trackerDirectory: string, board: Board, job: Readonly<Job>): Readonly<DocumentMessage>[] {
  const jobFolder    = jobFolderIn(trackerDirectory, job.id);
  const deliveryBase = deliveryBaseOf(jobFolder);
  if (deliveryBase === null) return [];
  const taken = new Set(takenDeliveriesOf(jobFolder).map((delivery) => delivery.deliveryNumber));
  return deliveredMessagesOf(documentOf(board, job), deliveryBase).filter((message) => !taken.has(message.deliveryNumber ?? 0));
}

/** The lines the instance took: its first message or resume line, and each message line. */
function linesTakenOf(jobFolder: string, instance: number): number {
  const opener = existsSync(join(jobFolder, `first-message-${instance}.sent`)) || existsSync(join(jobFolder, `resume-message-${instance}.sent`)) ? 1 : 0;
  return opener + takenDeliveriesOf(jobFolder).filter((delivery) => delivery.instance === instance).length;
}

/**
 * An instance that opens with a message, the next queued one, in place of the resume line: one resumed from waiting, or one that has a
 * delivered message waiting for its line. Once that message is sent it is still the instance's opener, so no resume line follows it on a
 * later pass, mid-turn.
 */
function opensWithAMessage(trackerDirectory: string, board: Board, job: Readonly<Job>): boolean {
  if (!isDocumentAgentJob(job)) return false;
  const jobFolder = jobFolderIn(trackerDirectory, job.id);
  const instance  = job.childInstance;
  const opened    = existsSync(join(jobFolder, `first-message-${instance}.sent`)) || existsSync(join(jobFolder, `resume-message-${instance}.sent`));
  if (!opened && takenDeliveriesOf(jobFolder).some((delivery) => delivery.instance === instance)) return true;
  return linesTakenOf(jobFolder, instance) === 0 && pendingMessagesOf(trackerDirectory, board, job).length > 0;
}

/** Idle: every line its instance took has its `result`, and no delivered message waits for its line. */
function isIdle(trackerDirectory: string, board: Board, job: Readonly<Job>, reading: DocumentAgentReading | undefined): boolean {
  if (job.state !== 'running' || reading?.instance !== job.childInstance) return false;
  const linesTaken = linesTakenOf(jobFolderIn(trackerDirectory, job.id), job.childInstance);
  return linesTaken > 0 && reading.results >= linesTaken && pendingMessagesOf(trackerDirectory, board, job).length === 0;
}

/** Its document needs it no more: the ticket was picked up or left the route, or the document is approved with no edit open. */
function documentIsDone(board: Board, job: Readonly<Job>): boolean {
  const ticketId = job.ticketIds[0] ?? '';
  const status   = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.status;
  if (status === undefined || !TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status)) return true;
  const document = documentOf(board, job);
  if (document === null) return false;
  const standing = board.ticketDocuments().standingOf(ticketId, documentOfJob(job));
  return standing === 'approved' && !document.proposals.some((proposal) => proposal.state === 'proposed');
}

/** The k-th message delivered to the job opens its turn k + 1: its first message is turn 1. */
function nextAgentTurnOf(trackerDirectory: string, board: Board, job: Readonly<Job>): number {
  const deliveryBase = deliveryBaseOf(jobFolderIn(trackerDirectory, job.id)) ?? 0;
  return deliveredMessagesOf(documentOf(board, job), deliveryBase).length + 2;
}

function deliverNextMessage(trackerDirectory: string, board: Board, job: Readonly<Job>): boolean {
  const ticketId = job.ticketIds[0] ?? '';
  const document = documentOfJob(job);
  const next     = board.ticketDocuments().nextQueuedMessageOf(ticketId, document);
  if (next === null) return false;
  const deliveryNumber = newestDeliveryNumberOf(documentOf(board, job)) + 1;
  board.ticketDocuments().markMessageSent(ticketId, document, next.messageId, deliveryNumber, nextAgentTurnOf(trackerDirectory, board, job));
  return true;
}

/**
 * In the hold: a launch file that cannot be read opens its incident and retires the job, which ends `replaced` once its session ended, so
 * the next message launches a fresh agent; a job with such an incident open takes no message until a move.
 */
function unreadableFileHoldsDeliveryOf(board: Board, jobFolder: string, job: Readonly<Job>, at: string): boolean {
  const launch = new DeliveryBaseIngestion(join(jobFolder, LAUNCH_FILE)).read();
  if (launch.verdict === 'unreadable') {
    UnreadableJobFileIncident.openAndRetire(board, { jobId: job.id, file: jobFileInDataFolderOf(job.id, LAUNCH_FILE), problem: launch.problem }, at);
  }
  return launch.verdict === 'unreadable' || UnreadableJobFileIncident.standsOpenFor(board, job.id);
}

/**
 * Run in the hold after the lifecycle. An idle agent takes the oldest queued message; an idle agent with none has its input closed, and an
 * instance resumed from waiting opens with the next message. A waiting agent whose document is done ends `closed`. A running agent with an
 * unreadable file of its own takes nothing, and one whose launch file cannot be read is retired.
 */
function deliverWhenIdle(board: Board, readings: readonly DocumentAgentReading[], trackerDirectory: string, resumedFromWaitingJobIds: readonly string[], at: string): void {
  for (const job of board.jobs().filter(isDocumentAgentJob)) {
    if (job.state === 'awaiting-answer' && documentIsDone(board, job)) {
      board.endJob(job.id, { outcome: 'closed' }, at);
      continue;
    }
    const jobFolder = jobFolderIn(trackerDirectory, job.id);
    if (job.state !== 'running' || unreadableFileHoldsDeliveryOf(board, jobFolder, job, at)) continue;
    if (job.state === 'running' && resumedFromWaitingJobIds.includes(job.id) && linesTakenOf(jobFolder, job.childInstance) === 0) {
      deliverNextMessage(trackerDirectory, board, job);
      continue;
    }
    const reading = readings.find((candidate) => candidate.jobId === job.id);
    if (!isIdle(trackerDirectory, board, job, reading)) continue;
    if (!deliverNextMessage(trackerDirectory, board, job)) board.moveJob(job.id, 'stopping', at);
  }
}

/**
 * Run in the hold where a stopping agent's session ended: it waits for its next message, or ends `closed` once its document is done. One
 * whose launch file cannot be read could take no message again: it ends `replaced`, and the next message launches a fresh agent.
 */
function settleEndedSession(board: Board, trackerDirectory: string, job: Readonly<Job>, at: string): void {
  const launchFilePath = join(jobFolderIn(trackerDirectory, job.id), LAUNCH_FILE);
  if (documentIsDone(board, job)) board.endJob(job.id, { outcome: 'closed' }, at);
  else if (new DeliveryBaseIngestion(launchFilePath).read().verdict === 'unreadable') board.endJob(job.id, { outcome: 'replaced', cause: UNREADABLE_LAUNCH_FILE_CAUSE }, at);
  else board.moveJob(job.id, 'awaiting-answer', at);
}

/**
 * Run in the hold after the turn ends were verified: each stopping agent whose session ended settles, so a request of its last turn, which
 * can keep the document open, applied before the agent was judged done. One Customs failed has already ended.
 */
function settleEndedSessions(board: Board, trackerDirectory: string, jobIds: readonly string[], at: string): void {
  for (const jobId of jobIds) {
    const job = board.jobById(jobId);
    if (job?.state === 'stopping' && isDocumentAgentJob(job)) settleEndedSession(board, trackerDirectory, job, at);
  }
}

/** The head's content hash the agent saw last; one that cannot be read is logged and taken as none, so the line carries the head again. */
function seenHeadHashOf(jobFolder: string, log: HephaestusLog): string | null {
  const seenHeadFilePath = join(jobFolder, SEEN_HEAD_FILE);
  const seenHead = new SeenHeadIngestion(seenHeadFilePath).read();
  if (seenHead.verdict === 'unreadable') log({ kind: 'seen-head-unreadable', seenHeadFilePath, problem: seenHead.problem });
  return seenHead.verdict === 'readable' ? seenHead.contentHash : null;
}

/**
 * After the hold: each delivered message's line, in order, to the live instance; a marker per line keeps a restart from sending it twice.
 * Each line rewrites the seen head, which heals one that could not be read.
 */
async function sendDeliveries(
  children: BoardChildren, trackerDirectory: string, board: Board, adapter: Pick<AgentAdapter, 'chatLineOf'>, log: HephaestusLog,
): Promise<void> {
  for (const job of board.jobs().filter((candidate) => isDocumentAgentJob(candidate) && candidate.state === 'running')) {
    const jobFolder = children.jobFolderOf(job.id);
    if (children.livenessOf(jobFolder, job.childInstance).verdict !== 'live') continue;
    const document = documentOfJob(job);
    for (const message of pendingMessagesOf(trackerDirectory, board, job)) {
      const held       = documentOf(board, job);
      const head       = held === null ? null : TicketDocumentVersionUtil.headOf(held);
      const seenHash   = seenHeadHashOf(jobFolder, log);
      const changedText = head === null || head.contentHash === seenHash ? null : board.ticketDocuments().versionTextOf(job.ticketIds[0] ?? '', document, head.number);
      const line = DocumentAgentWording.messageLineOf(message, document, { versionNumber: head?.number ?? null, changedText });
      const marker = join(jobFolder, DELIVERY_MARKERS_FOLDER, `${message.deliveryNumber ?? 0}.${job.childInstance}`);
      mkdirSync(join(jobFolder, DELIVERY_MARKERS_FOLDER), { recursive: true });
      if (!await children.sendInputOnce(marker, jobFolder, job.childInstance, [{ act: 'write-line', line: adapter.chatLineOf(line) }])) return;
      writeSeenHead(jobFolder, held);
    }
  }
}

/** With no snapshot start, the launch could not take one, so the check fails closed. */
function turnEndVerdictOf(context: TurnEndContext, board: Board, job: Readonly<Job>, start: SnapshotStart | null): CustomsVerdict {
  if (start === null) return {
    verdict: 'refused', check: 'V16', reason: 'git-failed', facts: ['no snapshot start']
  };
  return clearCustoms({
    role:                'document-agent',
    worktreePath:        snapshotDirectoryOf(context.worktreesRoot, job),
    startCommit:         start.startCommit,
    report:              undefined,
    ticketBody:          '',
    contentHashAtLaunch: '',
    ticketContentHash:   '',
    jobId:               job.id,
    logRecords:          board.logRecordsSoFar(),
    launchSnapshot:      start.launchSnapshot,
    refMovesAllowed:     PipelineAgentSessions.turnEndRefMovesAllowedOf(context, board, job),
    pathStyle:           context.pathStyle,
    agentNaming:         context.agentNaming,
  });
}

/**
 * In the hold, at each turn end of a document agent (its `result`, or its session's end): Customs on its snapshot. A clean snapshot applies
 * the turn's Hatch requests; a changed one refuses every one of them `document-snapshot-touched`, logs it, opens one incident on the
 * ticket and ends the job `failed`. A snapshot start that cannot be read opens the unreadable file's incident on the job in place of
 * Customs, and the turn's requests wait unanswered. Answers the replies to write once the hold committed.
 */
function verifyTurnEnds(
  change: BoardTransaction,
  context: TurnEndContext,
  turnEndJobIds: readonly string[],
  pending: readonly PendingHatchRequest[],
  controlContext: ControlContext,
): HatchReplyToWrite[] {
  const { board, at } = change;
  const { repositoryRoot } = projectLocationOf(context.workspace.rootDirectory);
  const replies: HatchReplyToWrite[] = [];
  for (const jobId of new Set(turnEndJobIds)) {
    const job = board.jobById(jobId);
    if (job === undefined || !isDocumentAgentJob(job)) continue;
    const snapshotStart = new SnapshotStartIngestion(join(jobFolderIn(context.workspace.trackerDirectory, job.id), SNAPSHOT_START_FILE)).read();
    if (snapshotStart.verdict === 'unreadable') {
      const file = jobFileInDataFolderOf(job.id, SNAPSHOT_START_FILE);
      UnreadableJobFileIncident.openOnce(board, { jobId: job.id, file, problem: snapshotStart.problem }, at);
      continue;
    }
    const start    = snapshotStart.verdict === 'readable' ? snapshotStart.snapshotStart : null;
    const requests = pending.filter((request) => request.jobId === job.id);
    const verdict  = turnEndVerdictOf(context, board, job, start);
    if (verdict.verdict === 'verified') {
      replies.push(...HatchInbox.applyTurnEndRequests(change, repositoryRoot, requests, controlContext, start?.startCommit ?? null));
      continue;
    }
    const ticketId = job.ticketIds[0] ?? '';
    const document = documentOfJob(job);
    const checks   = [verdict.check];
    replies.push(...HatchInbox.refuseRequests(change, repositoryRoot, requests, {
      reason: 'document-snapshot-touched', ticketId, document, jobId: job.id, checks
    }));
    board.recordDocumentSnapshotTouched(ticketId, { document, jobId: job.id, checks }, at);
    if (!board.incidents().some((incident) => incident.kind === SNAPSHOT_TOUCHED_INCIDENT && incident.jobId === job.id)) {
      board.openIncident({
        kind:      SNAPSHOT_TOUCHED_INCIDENT,
        ticketIds: [ticketId],
        jobId:     job.id,
        facts:     {
          document, check: verdict.check, reason: verdict.reason, paths: verdict.facts.join(', ')
        },
        defaultMove: 'incident-note',
      }, at);
    }
    board.endJob(job.id, { outcome: 'failed', cause: FAILED_CAUSE }, at);
  }
  return replies;
}

/**
 * After the hold: each document's snapshot that no agent of the document holds, a waiting one included, is removed; one the removal
 * leaves is named through `log` as a leftover. A snapshot is tried once each time it falls unheld, since a later agent adds it again.
 */
function removeUnheldSnapshots(
  board: Board,
  context: Pick<SnapshotContext, 'workspace' | 'worktreesRoot'>,
  triedSnapshots: Set<string>,
  log: HephaestusLog,
  removalPrimitives: WorktreeRemovalPrimitives = REAL_WORKTREE_REMOVAL_PRIMITIVES,
): void {
  const snapshotsFolder = join(context.worktreesRoot, DOCUMENT_AGENT_SNAPSHOT_FOLDER);
  if (!existsSync(snapshotsFolder)) return;
  const heldSnapshots = new Set(board.jobs().filter(isDocumentAgentJob).map((job) => snapshotDirectoryOf(context.worktreesRoot, job)));
  const { repositoryRoot } = projectLocationOf(context.workspace.rootDirectory);
  for (const name of readdirSync(snapshotsFolder)) {
    const snapshot = join(snapshotsFolder, name);
    if (heldSnapshots.has(snapshot)) {
      triedSnapshots.delete(snapshot);
      continue;
    }
    if (triedSnapshots.has(snapshot)) continue;
    triedSnapshots.add(snapshot);
    const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath: snapshot, force: 'force' }, removalPrimitives);
    if (removal.verdict === 'left') log({ kind: 'document-agent-snapshot-left-over', snapshotPath: snapshot, problem: removal.problem });
  }
}

export const DocumentAgentSessions = Object.freeze({
  isDocumentAgentJob,
  snapshotDirectoryOf,
  prepareSnapshot,
  noteLaunch,
  documentAgentProfileOf,
  documentAgentFactsOf,
  readingsOf,
  opensWithAMessage,
  isIdle,
  deliverWhenIdle,
  settleEndedSession,
  settleEndedSessions,
  sendDeliveries,
  verifyTurnEnds,
  removeUnheldSnapshots,
});
