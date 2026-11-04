/**
 * How an interrupted job comes back, design section 3.6: its next Watcher instance runs `--resume <id>` alone in the same working directory,
 * told first that it was interrupted; a resume the vendor cannot take ends the job `replaced` and opens `resume-failed`; and the fresh job
 * after a `replaced` one is told that an earlier session's uncommitted changes are its work.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';

import type { AgentAdapter }                                   from '../../lib/agent-launch/AgentAdapter.ts';
import { writeFileAtomically }                                 from '../../lib/atomic-file/AtomicFile.ts';
import type { PlatformPorts }                                  from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { InterruptionCause, Job, JobKind }                from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                      from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }                                          from '../../lib/tracker-model/Board.ts';
import { HANDOFF_RED_INTERRUPTION }                            from '../../lib/tracker-model/constants/JobStates.ts';
import type { EventLogEntry }                                  from '../../lib/watcher/EventLog.ts';
import { RED_HANDOFF_FILES, RedHandoff, type RedHandoffFacts } from './RedHandoff.ts';
import { WatcherFleet }                                        from './WatcherFleet.ts';

const FIRST_WATCHER_INSTANCE = 1;

/** A session that passed its gates and ended: a stale green its ticket's gates turned red after it is the next session's red handoff. */
const STALE_GREEN_TAKING_OUTCOMES: readonly string[] = ['reviewed', 'built'];

export const RESUME_FAILED_CAUSE = 'resume-failed';

/** What a resumed session is told, worded by the command line: the plain resume line, or the red handoff it was resumed to fix. */
export interface ResumeMessages {
  resumeMessage:       string;
  redHandoffMessageOf: (facts: Readonly<RedHandoffFacts>) => string;
}

/** Only a resume increments a job's Watcher instance, so every instance past the first runs a resumed session. */
function isResumedInstance(job: Readonly<Job>): boolean {
  return job.watcherInstance > FIRST_WATCHER_INSTANCE;
}

/** User's message that reopened a closed product owner in the job's current instance; `null` for every other instance. */
function reopenTextOf(logRecords: readonly LogRecord[], job: Readonly<Job>): string | null {
  const reopened = logRecords.findLast((record) => record.kind === 'job-reopened' && record.jobId === job.id && record.fields.watcherInstance === job.watcherInstance);
  return reopened?.kind === 'job-reopened' ? reopened.fields.text : null;
}

/**
 * What a launch of the job's current instance passes the adapter: a resume is told it was interrupted, never handed its task again, and a
 * reopened session gets User's message instead.
 */
function launchPartsOf(job: Readonly<Job>, firstMessage: string, resumeMessage: string, reopenText: string | null = null): { resume: boolean; firstMessage: string } {
  return isResumedInstance(job) ? { resume: true, firstMessage: reopenText ?? resumeMessage } : { resume: false, firstMessage };
}

/** Whether the instance's whole event log holds its session's start; read only for an instance whose Watcher is gone. */
function instanceSessionStarted(jobFolder: string, instance: number, adapter: AgentAdapter): boolean {
  const entries: readonly EventLogEntry[] | 'malformed' = WatcherFleet.eventsAfter(jobFolder, instance, 0);
  if (entries === 'malformed') return true;
  return entries.some((entry) => entry.origin === 'agent' && adapter.eventsOf(entry.line).some((event) => event.kind === 'started'));
}

/**
 * A resumed session that exited by itself before it ever started: the vendor could not resume it. A launch resumes a session when its
 * instance is past the first or its session owner is another job. One killed or lost to a reboot before it started is interrupted again instead.
 */
function resumeFailed(job: Readonly<Job>, sessionOwnerJobId: string, sessionExitedByItself: boolean, sessionStarted: boolean): boolean {
  const resumesASession = isResumedInstance(job) || sessionOwnerJobId !== job.id;
  return resumesASession && sessionExitedByItself && !sessionStarted;
}

/** An Airlock agent opens no incident: its Airlock launches a fresh agent of the same role in its place. */
function applyResumeFailure(board: Board, job: Readonly<Job>, at: string): void {
  board.endJob(job.id, { outcome: 'replaced', cause: RESUME_FAILED_CAUSE }, at);
  if (job.kind === 'merge-agent') return;
  board.openIncident({
    kind:        'resume-failed',
    ticketIds:   job.ticketIds,
    jobId:       job.id,
    facts:       { watcherInstance: String(job.watcherInstance) },
    defaultMove: 'job-fresh',
  }, at);
}

/** The newest earlier job of the same kind on the job's tickets that ended, with its outcome and the cause of its last interruption. */
function lastEndedPredecessorOf(logRecords: readonly LogRecord[], job: Readonly<Job>): { jobId: string; outcome: string; interruption: InterruptionCause | null } | null {
  const sameWorkJobIds = new Set<string>();
  const interruptionByJobId = new Map<string, InterruptionCause>();
  let predecessor: { jobId: string; outcome: string; interruption: InterruptionCause | null } | null = null;
  const sharesTheWork = (kind: JobKind, ticketIds: readonly string[]): boolean => kind === job.kind && ticketIds.some((ticketId) => job.ticketIds.includes(ticketId));
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.jobId !== job.id && sharesTheWork(record.fields.kind, record.fields.ticketIds)) sameWorkJobIds.add(record.jobId);
    if (record.kind === 'job-interrupted') interruptionByJobId.set(record.jobId, record.fields.cause);
    if (record.kind === 'job-ended' && sameWorkJobIds.has(record.jobId)) {
      predecessor = { jobId: record.jobId, outcome: record.fields.outcome, interruption: interruptionByJobId.get(record.jobId) ?? null };
    }
  }
  return predecessor;
}

/**
 * The job whose session a build job carries on: a build of the same attempt after one that ended `built` was sent back by its review, and resumes that
 * builder's session (itself perhaps carried on from an earlier one) with the review's findings. The job itself for every other job.
 */
function sessionOwnerJobIdOf(logRecords: readonly LogRecord[], job: Readonly<Pick<Job, 'id' | 'kind' | 'role' | 'ticketIds' | 'parentJobId'>>): string {
  if (job.kind === 'merge-agent') return airlockSessionOwnerJobIdOf(logRecords, job);
  if (job.kind !== 'build') return job.id;
  const sessionOwnerByJobId = new Map<string, string>();
  const attemptByJobId = new Map<string, number>();
  let newestEnded: { jobId: string; outcome: string } | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.fields.kind === 'build' && record.fields.ticketIds.some((ticketId) => job.ticketIds.includes(ticketId))) {
      const sameAttempt = newestEnded !== null && attemptByJobId.get(newestEnded.jobId) === record.fields.attempt;
      const carriesOn = sameAttempt && newestEnded?.outcome === 'built' ? sessionOwnerByJobId.get(newestEnded.jobId) : undefined;
      sessionOwnerByJobId.set(record.jobId, carriesOn ?? record.jobId);
      attemptByJobId.set(record.jobId, record.fields.attempt);
    }
    if (record.kind === 'job-ended' && sessionOwnerByJobId.has(record.jobId)) newestEnded = { jobId: record.jobId, outcome: record.fields.outcome };
  }
  return sessionOwnerByJobId.get(job.id) ?? job.id;
}

/**
 * An Airlock agent carries on the session of its ticket's newest ended job of its role: the reviewer's, or the builder's (itself perhaps
 * carried on). After an Airlock agent of the same merge job ended `replaced`, or with no such job, it is a fresh session of its own.
 */
function airlockSessionOwnerJobIdOf(logRecords: readonly LogRecord[], job: Readonly<Pick<Job, 'id' | 'role' | 'ticketIds' | 'parentJobId'>>): string {
  const ownerKind: JobKind = job.role === 'builder' ? 'build' : 'review';
  const ownerJobIds   = new Set<string>();
  const siblingJobIds = new Set<string>();
  let newestOwner: string | null = null;
  let siblingWasReplaced = false;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.jobId === job.id) break;
    const sharesTheTicket = record.kind === 'job-launched' && record.fields.ticketIds.some((ticketId) => job.ticketIds.includes(ticketId));
    if (record.kind === 'job-launched' && record.fields.kind === ownerKind && sharesTheTicket) ownerJobIds.add(record.jobId);
    if (record.kind === 'job-launched' && job.parentJobId !== null && record.fields.parentJobId === job.parentJobId) siblingJobIds.add(record.jobId);
    if (record.kind === 'job-ended' && ownerJobIds.has(record.jobId)) newestOwner = record.jobId;
    if (record.kind === 'job-ended' && siblingJobIds.has(record.jobId) && record.fields.outcome === 'replaced') siblingWasReplaced = true;
  }
  if (siblingWasReplaced || newestOwner === null) return job.id;
  return sessionOwnerJobIdOf(logRecords, {
    id: newestOwner, kind: ownerKind, role: job.role, ticketIds: job.ticketIds, parentJobId: null
  });
}

/** The `## Review <round>` section a builder resumed after its review is sent: the newest one in the ticket's body. */
function newestReviewSectionOf(ticketBody: string): string {
  const start = [...ticketBody.matchAll(/^## Review \d+/gm)].at(-1)?.index;
  if (start === undefined) return '';
  const rest = ticketBody.slice(start);
  const nextHeading = rest.slice(1).search(/^## /m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1)).trim();
}

/** The newest earlier job of the same kind on the job's tickets ended `replaced`, so the job inherits that session's worktree. */
function earlierSessionWasReplaced(logRecords: readonly LogRecord[], job: Readonly<Job>): boolean {
  return lastEndedPredecessorOf(logRecords, job)?.outcome === 'replaced';
}

/**
 * The red handoff a fresh session takes over when the session it replaces, interrupted on a red handoff, could not be resumed: the same
 * facts, its calls counted from its own first instance. `null` for every other job.
 */
function redHandoffTakenOverOf(trackerDirectory: string, logRecords: readonly LogRecord[], job: Readonly<Job>): RedHandoffFacts | null {
  const predecessor = lastEndedPredecessorOf(logRecords, job);
  if (predecessor === null) return null;
  const predecessorFolder = WatcherFleet.jobFolderOf(trackerDirectory, predecessor.jobId);
  if (STALE_GREEN_TAKING_OUTCOMES.includes(predecessor.outcome)) return RedHandoff.redHandoffFactsOf(join(predecessorFolder, RED_HANDOFF_FILES.staleGreenFolder));
  if (predecessor.outcome !== 'replaced' || predecessor.interruption !== HANDOFF_RED_INTERRUPTION) return null;
  const facts = RedHandoff.redHandoffFactsOf(predecessorFolder);
  return facts === null ? null : { ...facts, interruptedInstance: 0 };
}

/**
 * The ended session a fresh job resumes to fix a stale green that turned red: the session of the newest predecessor that left the stale-green
 * handoff, when its job folder shows that session started. `null` for every other job, and a fresh session takes the handoff over.
 */
function staleGreenSessionOwnerOf(
  trackerDirectory: string,
  logRecords: readonly LogRecord[],
  job: Readonly<Job>,
  adapter: AgentAdapter,
): string | null {
  if (isResumedInstance(job) || (job.kind !== 'build' && job.kind !== 'review')) return null;
  const predecessor = lastEndedPredecessorOf(logRecords, job);
  if (predecessor === null || !STALE_GREEN_TAKING_OUTCOMES.includes(predecessor.outcome)) return null;
  const predecessorFolder = WatcherFleet.jobFolderOf(trackerDirectory, predecessor.jobId);
  if (RedHandoff.redHandoffFactsOf(join(predecessorFolder, RED_HANDOFF_FILES.staleGreenFolder)) === null) return null;
  if (!instanceSessionStarted(predecessorFolder, FIRST_WATCHER_INSTANCE, adapter)) return null;
  return sessionOwnerJobIdOf(logRecords, { ...job, id: predecessor.jobId, parentJobId: null });
}

/** The job whose session the launch of the job's current instance runs: the stale-green session it resumes, or the session it carries on. */
function launchSessionOwnerJobIdOf(
  trackerDirectory: string,
  logRecords: readonly LogRecord[],
  job: Readonly<Job>,
  adapter: AgentAdapter,
): string {
  return staleGreenSessionOwnerOf(trackerDirectory, logRecords, job, adapter) ?? sessionOwnerJobIdOf(logRecords, job);
}

/** The message a resumed instance opens with: User's reopening text, the red handoff it resumes to fix, or the plain resume message. */
function resumeLineOf(trackerDirectory: string, board: Pick<Board, 'logRecordsSoFar'>, job: Readonly<Job>, messages: ResumeMessages): string {
  const reopenText = reopenTextOf(board.logRecordsSoFar(), job);
  if (reopenText !== null) return reopenText;
  const redHandoff = job.interruption === HANDOFF_RED_INTERRUPTION ? RedHandoff.redHandoffFactsOf(WatcherFleet.jobFolderOf(trackerDirectory, job.id)) : null;
  return redHandoff === null ? messages.resumeMessage : messages.redHandoffMessageOf(redHandoff);
}

function resumeMessageMarkerOf(jobFolder: string, instance: number): string {
  return join(jobFolder, `resume-message-${instance}.sent`);
}

/** An answer the instance took as a chat line is its first line: the resume message never follows it. */
function recordAnswerAsResumeLine(jobFolder: string, instance: number): void {
  writeFileSync(resumeMessageMarkerOf(jobFolder, instance), '');
}

function firstMessagePathOf(jobFolder: string, instance: number): string {
  return join(jobFolder, `first-message-${instance}.txt`);
}

function firstMessageMarkerOf(jobFolder: string, instance: number): string {
  return join(jobFolder, `first-message-${instance}.sent`);
}

/** Kept beside a fresh instance's launch files until a pass finds its Watcher live, so an Overseer restart in between loses nothing. */
function storeFirstMessage(jobFolder: string, instance: number, message: string): void {
  writeFileAtomically(firstMessagePathOf(jobFolder, instance), message);
}

/**
 * The task text of each fresh instance, its session's first input, written once its Watcher answers. The marker is written only after the
 * Watcher took the line, so one not yet listening is tried again on the next pass, and a delivered line is never sent twice.
 */
async function deliverFirstMessages(ports: PlatformPorts, trackerDirectory: string, board: Pick<Board, 'jobs'>, adapter: Pick<AgentAdapter, 'chatLineOf'>): Promise<void> {
  for (const job of board.jobs()) {
    if (isResumedInstance(job)) continue;
    const jobFolder   = WatcherFleet.jobFolderOf(trackerDirectory, job.id);
    const messagePath = firstMessagePathOf(jobFolder, job.watcherInstance);
    const marker      = firstMessageMarkerOf(jobFolder, job.watcherInstance);
    if (!existsSync(messagePath) || existsSync(marker) || WatcherFleet.livenessOf(ports, jobFolder, job.watcherInstance).verdict !== 'live') continue;
    const line = adapter.chatLineOf(readFileSync(messagePath, 'utf8'));
    if (await WatcherFleet.sendFrames(ports, jobFolder, job.watcherInstance, [{ kind: 'write', line }])) writeFileSync(marker, '');
  }
}

/**
 * The first line of each resumed instance, written once its Watcher answers; an answer delivery is resumed with the answer instead. The marker
 * is written only after the Watcher took the line, so a Watcher not yet listening is tried again on the next pass.
 */
async function deliverResumeMessages(
  ports: PlatformPorts,
  trackerDirectory: string,
  board: Board,
  adapter: AgentAdapter,
  messages: ResumeMessages,
  answerAwaitsDelivery: (job: Readonly<Job>) => boolean,
): Promise<void> {
  for (const job of board.jobs()) {
    if (job.state !== 'running' || !isResumedInstance(job) || job.interruption === 'answer-delivery' || answerAwaitsDelivery(job)) continue;
    const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, job.id);
    const marker    = resumeMessageMarkerOf(jobFolder, job.watcherInstance);
    if (existsSync(marker) || WatcherFleet.livenessOf(ports, jobFolder, job.watcherInstance).verdict !== 'live') continue;
    const line = adapter.chatLineOf(resumeLineOf(trackerDirectory, board, job, messages));
    if (await WatcherFleet.sendFrames(ports, jobFolder, job.watcherInstance, [{ kind: 'write', line }])) writeFileSync(marker, '');
  }
}

export const JobResumption = Object.freeze({
  isResumedInstance,
  reopenTextOf,
  launchPartsOf,
  instanceSessionStarted,
  resumeFailed,
  applyResumeFailure,
  earlierSessionWasReplaced,
  sessionOwnerJobIdOf,
  newestReviewSectionOf,
  redHandoffTakenOverOf,
  staleGreenSessionOwnerOf,
  launchSessionOwnerJobIdOf,
  resumeLineOf,
  storeFirstMessage,
  recordAnswerAsResumeLine,
  deliverFirstMessages,
  deliverResumeMessages,
});
