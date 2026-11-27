/**
 * How an interrupted job comes back, design section 3.6: its next child instance resumes the agent's session alone in the same working
 * directory, told first that it was interrupted; a resume the vendor cannot take ends the job `replaced` and opens `resume-failed`; and the
 * fresh job after a `replaced` one is told that an earlier session's uncommitted changes are its work. A job carries on only a session of
 * its own entity and stage (E29).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { RedHandoffFacts }                                                from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import { StaleGreenSessionOwnerIngestion, type StaleGreenSessionOwnerReading } from '../../adapters/session-owner/StaleGreenSessionOwnerIngestion.ts';
import { createStaleGreenSessionOwnerWriter }                                  from '../../adapters/session-owner/StaleGreenSessionOwnerWriter.ts';
import type {
  InterruptionCause,
  Job,
  JobKind,
  JobRole,
  PictureReference
}                                                              from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord, LogRecordFieldsOf }  from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Board }                         from '../../domain/tracker-model/Board.ts';
import { HANDOFF_RED_INTERRUPTION }           from '../../domain/tracker-model/constants/JobStates.ts';
import type { AgentAdapter }                  from '../../lib/agent-launch/AgentAdapter.ts';
import { writeFileAtomically }                from '../../lib/atomic-file/AtomicFile.ts';
import type { EventLogEntry }                 from '../../lib/talos/EventLog.ts';
import { PictureStore }                       from '../tracker/PictureStore.ts';
import type { BoardChildren }                 from './BoardChildren.ts';
import { jobFileInDataFolderOf, jobFolderIn } from './HephaestusFiles.ts';
import { IntakeSessions }                     from './IntakeSessions.ts';
import { RED_HANDOFF_FILES, RedHandoff }      from './RedHandoff.ts';
import { StoredFileUnreadable }               from './StoredFileUnreadable.ts';
import type { UnreadableJobFile }             from './UnreadableJobFileIncident.ts';

const FIRST_CHILD_INSTANCE = 1;

/** The entity and stage a job runs, as its launch logged them; both absent on a forge without entities, where every job shares them. */
type SessionScope = Readonly<Pick<Job, 'entity' | 'stage'>>;

function sessionScopeOf(fields: SessionScope): SessionScope {
  return { ...(fields.entity === undefined ? {} : { entity: fields.entity }), ...(fields.stage === undefined ? {} : { stage: fields.stage }) };
}

/** Whether a job may carry on a session launched in `sessionScope`: only one of its own entity and stage. `null` is a launch never logged. */
function runsTheSameEntityAndStage(sessionScope: SessionScope | null | undefined, jobScope: SessionScope): boolean {
  return sessionScope !== null && sessionScope !== undefined && sessionScope.entity === jobScope.entity && sessionScope.stage === jobScope.stage;
}

function launchScopeOf(logRecords: readonly LogRecord[], jobId: string): SessionScope | null {
  const launch = logRecords.find((record) => record.kind === 'job-launched' && record.jobId === jobId);
  return launch?.kind === 'job-launched' ? sessionScopeOf(launch.fields) : null;
}

/** A session that passed its gates and ended: a stale green its ticket's gates turned red after it is the next session's red handoff. */
const STALE_GREEN_TAKING_OUTCOMES: readonly string[] = ['reviewed', 'built'];

export const RESUME_FAILED_CAUSE = 'resume-failed';

const STALE_GREEN_SESSION_OWNER_FILE = 'stale-green-session-owner.json';

/** The session a launch runs; or the job's recorded stale-green answer, unreadable, which the step that needs it waits on. */
export type SessionOwnerAnswer<SessionOwner> =
  | { verdict: 'answered'; sessionOwnerJobId: SessionOwner }
  | { verdict: 'unreadable'; unreadableFile: UnreadableJobFile };

/** What a resumed session is told, worded by the command line: the plain resume line, or the red handoff it was resumed to fix. */
export interface ResumeMessages {
  resumeMessage:       string;
  redHandoffMessageOf: (facts: Readonly<RedHandoffFacts>) => string;
}

/** Only a resume increments a job's child instance, so every instance past the first runs a resumed session. */
function isResumedInstance(job: Readonly<Job>): boolean {
  return job.childInstance > FIRST_CHILD_INSTANCE;
}

function reopeningOf(logRecords: readonly LogRecord[], job: Readonly<Job>): LogRecordFieldsOf<'job-reopened'> | null {
  const reopened = logRecords.findLast((record) => record.kind === 'job-reopened' && record.jobId === job.id && record.fields.childInstance === job.childInstance);
  return reopened?.kind === 'job-reopened' ? reopened.fields : null;
}

/** User's message that reopened a closed product owner in the job's current instance; `null` for every other instance. */
function reopenTextOf(logRecords: readonly LogRecord[], job: Readonly<Job>): string | null {
  return reopeningOf(logRecords, job)?.text ?? null;
}

/** The pictures User's reopening message carried; none for every other instance. */
function reopenPicturesOf(logRecords: readonly LogRecord[], job: Readonly<Job>): readonly PictureReference[] {
  return reopeningOf(logRecords, job)?.pictures ?? [];
}

/**
 * What a launch of the job's current instance passes the adapter: a resume is told it was interrupted, never handed its task again, and a
 * reopened session gets User's message instead.
 */
function launchPartsOf(job: Readonly<Job>, firstMessage: string, resumeMessage: string, reopenText: string | null = null): { resume: boolean; firstMessage: string } {
  return isResumedInstance(job) ? { resume: true, firstMessage: reopenText ?? resumeMessage } : { resume: false, firstMessage };
}

/** Whether the instance's whole event log holds its session's start; read only for an instance whose child is gone. */
function instanceSessionStarted(children: BoardChildren, jobFolder: string, instance: number, adapter: AgentAdapter): boolean {
  const entries: readonly EventLogEntry[] | 'malformed' = children.eventsAfter(jobFolder, instance, 0);
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
    facts:       { childInstance: String(job.childInstance) },
    defaultMove: 'job-fresh',
  }, at);
}

interface EndedPredecessor {
  jobId:        string;
  outcome:      string;
  cause:        string | null;
  interruption: InterruptionCause | null;
  /** The entity and stage its launch logged. */
  scope:        SessionScope;
  /** The same-work job that ended before this one. */
  previous:     EndedPredecessor | null;
}

/** The newest earlier job of the same kind on the job's tickets that ended, with its outcome, its cause and the cause of its last interruption. */
function lastEndedPredecessorOf(logRecords: readonly LogRecord[], job: Readonly<Job>): EndedPredecessor | null {
  const sameWorkScopeByJobId = new Map<string, SessionScope>();
  const interruptionByJobId = new Map<string, InterruptionCause>();
  let predecessor: EndedPredecessor | null = null;
  const sharesTheWork = (kind: JobKind, ticketIds: readonly string[]): boolean => kind === job.kind && ticketIds.some((ticketId) => job.ticketIds.includes(ticketId));
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.jobId !== job.id && sharesTheWork(record.fields.kind, record.fields.ticketIds)) {
      sameWorkScopeByJobId.set(record.jobId, sessionScopeOf(record.fields));
    }
    if (record.kind === 'job-interrupted') interruptionByJobId.set(record.jobId, record.fields.cause);
    const scope = record.kind === 'job-ended' ? sameWorkScopeByJobId.get(record.jobId) : undefined;
    if (record.kind === 'job-ended' && scope !== undefined) {
      predecessor = {
        jobId:        record.jobId,
        outcome:      record.fields.outcome,
        cause:        record.fields.cause ?? null,
        interruption: interruptionByJobId.get(record.jobId) ?? null,
        scope,
        previous:     predecessor,
      };
    }
  }
  return predecessor;
}

/** The stale-green handoff an ended session left for the next one; `null` when it ended otherwise or left none. */
function staleGreenHandoffOf(trackerDirectory: string, predecessor: Readonly<EndedPredecessor>): RedHandoffFacts | null | StoredFileUnreadable {
  if (!STALE_GREEN_TAKING_OUTCOMES.includes(predecessor.outcome)) return null;
  return RedHandoff.redHandoffFactsOf(trackerDirectory, join(jobFolderIn(trackerDirectory, predecessor.jobId), RED_HANDOFF_FILES.staleGreenFolder));
}

/**
 * A job that resumed a stale-green session the vendor could not resume: it adopted that red handoff at launch. A job replaced for any other
 * reason can hold facts of a red handoff it already fixed, so only this one hands its folder's facts on.
 */
function failedStaleGreenResume(trackerDirectory: string, predecessor: Readonly<EndedPredecessor>): boolean {
  if (predecessor.outcome !== 'replaced' || predecessor.cause !== RESUME_FAILED_CAUSE || predecessor.previous === null) return false;
  // A stale-green handoff that cannot be read was still left: it is the predecessor's own adopted facts that are handed on.
  return staleGreenHandoffOf(trackerDirectory, predecessor.previous) !== null;
}

/** The fields a session owner is read from: the job's own entity and stage decide whose session it may carry on. */
type SessionOwnerSubject = Readonly<Pick<Job, 'id' | 'kind' | 'role' | 'ticketIds' | 'parentJobId' | 'entity' | 'stage'>>;

/** A build of the same attempt, entity and stage carries on the session of a build that ended so: sent back by its review, or its needs settled. */
const SESSION_CARRYING_OUTCOMES: readonly string[] = ['built', 'needs-declared'];

/** A crossing ticket's `adapt` (stage 4) carries on the home builder's session of `build` (stage 1) when it exists (E43). */
const ADAPT_STAGE_NUMBER = 4;

const BUILD_STAGE_NUMBER = 1;

/** Whether a session of `sessionScope` is the home builder's session an `adapt` job of `jobScope` takes up after the package stages. */
function adaptTakesUp(sessionScope: SessionScope | undefined, jobScope: SessionScope): boolean {
  return jobScope.stage === ADAPT_STAGE_NUMBER && sessionScope !== undefined && sessionScope.entity === jobScope.entity
    && (sessionScope.stage === BUILD_STAGE_NUMBER || sessionScope.stage === ADAPT_STAGE_NUMBER);
}

/**
 * The job whose session a build job carries on: a build of the same attempt, entity and stage after one that ended `built` was sent back by
 * its review, or after one that ended `needs-declared` once its needs are settled, and resumes that builder's session (itself perhaps carried
 * on from an earlier one). An `adapt` job after the package stages carries on the newest home build of stage 1 or 4 that ended so, whatever
 * its attempt; with none it starts fresh (E43). The job itself for every other job.
 */
function sessionOwnerJobIdOf(logRecords: readonly LogRecord[], job: SessionOwnerSubject): string {
  if (job.kind === 'merge-agent') return airlockSessionOwnerJobIdOf(logRecords, job);
  if (job.kind !== 'build') return job.id;
  const sessionOwnerByJobId = new Map<string, string>();
  const attemptByJobId = new Map<string, number>();
  const scopeByJobId = new Map<string, SessionScope>();
  let newestEnded: { jobId: string; outcome: string } | null = null;
  let newestHomeBuildForAdapt: string | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.fields.kind === 'build' && record.fields.ticketIds.some((ticketId) => job.ticketIds.includes(ticketId))) {
      const scope = sessionScopeOf(record.fields);
      const sameAttempt = newestEnded !== null && attemptByJobId.get(newestEnded.jobId) === record.fields.attempt;
      const sameScope = newestEnded !== null && runsTheSameEntityAndStage(scopeByJobId.get(newestEnded.jobId), scope);
      const carriesOn = newestEnded !== null && sameAttempt && sameScope && SESSION_CARRYING_OUTCOMES.includes(newestEnded.outcome)
        ? sessionOwnerByJobId.get(newestEnded.jobId)
        : undefined;
      const afterThePackageStages = newestEnded !== null && !sameScope && newestHomeBuildForAdapt !== null && adaptTakesUp(scopeByJobId.get(newestHomeBuildForAdapt), scope);
      const takesUp = afterThePackageStages && newestHomeBuildForAdapt !== null ? sessionOwnerByJobId.get(newestHomeBuildForAdapt) : undefined;
      sessionOwnerByJobId.set(record.jobId, carriesOn ?? takesUp ?? record.jobId);
      attemptByJobId.set(record.jobId, record.fields.attempt);
      scopeByJobId.set(record.jobId, scope);
    }
    if (record.kind === 'job-ended' && sessionOwnerByJobId.has(record.jobId)) {
      newestEnded = { jobId: record.jobId, outcome: record.fields.outcome };
      const endedScope = scopeByJobId.get(record.jobId);
      const endedAHomeBuild = endedScope?.stage === BUILD_STAGE_NUMBER || endedScope?.stage === ADAPT_STAGE_NUMBER;
      if (endedAHomeBuild && SESSION_CARRYING_OUTCOMES.includes(record.fields.outcome)) newestHomeBuildForAdapt = record.jobId;
    }
  }
  return sessionOwnerByJobId.get(job.id) ?? job.id;
}

/** The ticket's newest ended build or review job, whatever the pipeline says now: the worker that last changed the branch's code. */
export interface LastWorker {
  jobId: string;
  kind:  Extract<JobKind, 'build' | 'review'>;
  role:  JobRole;
}

/**
 * Read from history, never from the pipeline, so a review step removed since still gives the reviewer. A conflict re-reviewer is never
 * the last worker of a later merge: a freed Airlock slot puts the branch back at its own tip, so its fixes are gone with the merge. With a
 * `scope`, only a worker of that entity and stage counts, such as a crossed package's builder.
 */
function lastWorkerOf(logRecords: readonly LogRecord[], ticketId: string, scope?: SessionScope): LastWorker | null {
  const launchedWorkers = new Map<string, Omit<LastWorker, 'jobId'>>();
  let lastWorker: LastWorker | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId) && record.fields.role !== null
      && (scope === undefined || runsTheSameEntityAndStage(sessionScopeOf(record.fields), scope))) {
      const { kind, role } = record.fields;
      if (kind === 'build' || kind === 'review') launchedWorkers.set(record.jobId, { kind, role });
    }
    if (record.kind !== 'job-ended') continue;
    const launched = launchedWorkers.get(record.jobId);
    if (launched !== undefined) lastWorker = { jobId: record.jobId, ...launched };
  }
  return lastWorker;
}

interface AirlockAgentPredecessors {
  /** The ticket's last worker as the agent's launch found it: its build or review job. `null` for a conflict re-reviewer, a session of its own. */
  newestWorker:       LastWorker | null;
  siblingWasReplaced: boolean;
}

/**
 * A last worker of another entity or stage than the Airlock agent's is no worker it stands in for. An Airlock agent of an entity stands in
 * for the newest worker of its own entity and stage, so a package's builder resolving its part of a conflict resumes its session (E62).
 */
function airlockAgentPredecessorsOf(logRecords: readonly LogRecord[], job: Omit<SessionOwnerSubject, 'kind'>): AirlockAgentPredecessors {
  const ownLaunchIndex         = logRecords.findIndex((record) => record.kind === 'job-launched' && record.jobId === job.id);
  const recordsBeforeOwnLaunch = ownLaunchIndex === -1 ? logRecords : logRecords.slice(0, ownLaunchIndex);
  const siblingJobIds = new Set<string>();
  let siblingWasReplaced = false;
  for (const record of recordsBeforeOwnLaunch) {
    if (record.kind === 'job-launched' && job.parentJobId !== null && record.fields.parentJobId === job.parentJobId) siblingJobIds.add(record.jobId);
    if (record.kind === 'job-ended' && siblingJobIds.has(record.jobId) && record.fields.outcome === 'replaced') siblingWasReplaced = true;
  }
  const [ticketId] = job.ticketIds;
  const workerScope = job.entity === undefined ? undefined : sessionScopeOf(job);
  const lastWorker = job.role === 'conflict-re-reviewer' || ticketId === undefined ? null : lastWorkerOf(recordsBeforeOwnLaunch, ticketId, workerScope);
  const newestWorker = lastWorker !== null && runsTheSameEntityAndStage(launchScopeOf(recordsBeforeOwnLaunch, lastWorker.jobId), job) ? lastWorker : null;
  return { newestWorker, siblingWasReplaced };
}

/**
 * An Airlock agent carries on the session of its ticket's last worker: the reviewer's, or the builder's (itself perhaps carried on). After
 * an Airlock agent of the same merge job ended `replaced`, with no last worker, or as a conflict re-reviewer, it is a fresh session of its own.
 */
function airlockSessionOwnerJobIdOf(logRecords: readonly LogRecord[], job: Omit<SessionOwnerSubject, 'kind'>): string {
  const { newestWorker, siblingWasReplaced } = airlockAgentPredecessorsOf(logRecords, job);
  if (siblingWasReplaced || newestWorker === null) return job.id;
  return sessionOwnerJobIdOf(logRecords, {
    id: newestWorker.jobId, kind: newestWorker.kind, role: newestWorker.role, ticketIds: job.ticketIds, parentJobId: null, ...sessionScopeOf(job)
  });
}

/** The last worker an Airlock agent stands in for, whose launch pair it takes, even as a fresh session; `null` for every other job. */
function lastWorkerJobIdOf(logRecords: readonly LogRecord[], job: SessionOwnerSubject): string | null {
  return job.kind === 'merge-agent' ? airlockAgentPredecessorsOf(logRecords, job).newestWorker?.jobId ?? null : null;
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
 * The red handoff a fresh session takes over when the session it replaces, interrupted on a red handoff or resumed for a stale green, could
 * not be resumed: the same facts, its calls counted from its own first instance. `null` for every other job.
 */
function redHandoffTakenOverOf(trackerDirectory: string, logRecords: readonly LogRecord[], job: Readonly<Job>): RedHandoffFacts | null | StoredFileUnreadable {
  const predecessor = lastEndedPredecessorOf(logRecords, job);
  if (predecessor === null) return null;
  if (STALE_GREEN_TAKING_OUTCOMES.includes(predecessor.outcome)) return staleGreenHandoffOf(trackerDirectory, predecessor);
  const takesTheFolderOver = predecessor.outcome === 'replaced' && predecessor.interruption === HANDOFF_RED_INTERRUPTION;
  if (!takesTheFolderOver && !failedStaleGreenResume(trackerDirectory, predecessor)) return null;
  const facts = RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolderIn(trackerDirectory, predecessor.jobId));
  return facts === null || StoredFileUnreadable.isUnreadableFile(facts) ? facts : { ...facts, interruptedInstance: 0 };
}

function staleGreenSessionOwnerPathOf(trackerDirectory: string, jobId: string): string {
  return join(jobFolderIn(trackerDirectory, jobId), STALE_GREEN_SESSION_OWNER_FILE);
}

/** The answer the launch of the job's first instance recorded; `absent` before that launch. */
function recordedStaleGreenSessionOwnerOf(trackerDirectory: string, jobId: string): StaleGreenSessionOwnerReading {
  return new StaleGreenSessionOwnerIngestion(staleGreenSessionOwnerPathOf(trackerDirectory, jobId)).read();
}

/** Written at the launch of the job's first instance, so a same-work job that ends later never changes the session every instance resumes. */
function recordStaleGreenSessionOwner(trackerDirectory: string, job: Readonly<Job>, sessionOwnerJobId: string | null): void {
  if (isResumedInstance(job) || (job.kind !== 'build' && job.kind !== 'review')) return;
  const path = staleGreenSessionOwnerPathOf(trackerDirectory, job.id);
  mkdirSync(dirname(path), { recursive: true });
  createStaleGreenSessionOwnerWriter(path).write(sessionOwnerJobId);
}

/**
 * The ended session a fresh job resumes to fix a stale green that turned red: the session of the newest predecessor that left the stale-green
 * handoff, when its job folder shows that session started and it ran the job's entity and stage. `null` for every other job, and a fresh
 * session takes the handoff over. Once the first instance recorded its answer, every instance answers the same, so an interrupted
 * stale-green resume resumes that session again, never one of its own, though another same-work job ended in between. A recorded answer
 * that cannot be read is `unreadable`: nothing that needs it guesses another session.
 */
function staleGreenSessionOwnerOf(
  children: BoardChildren,
  trackerDirectory: string,
  logRecords: readonly LogRecord[],
  job: Readonly<Job>,
  adapter: AgentAdapter,
): SessionOwnerAnswer<string | null> {
  const resumesNoEndedSession = { verdict: 'answered', sessionOwnerJobId: null } as const;
  if (job.kind !== 'build' && job.kind !== 'review') return resumesNoEndedSession;
  const recorded = recordedStaleGreenSessionOwnerOf(trackerDirectory, job.id);
  if (recorded.verdict === 'readable') return { verdict: 'answered', sessionOwnerJobId: recorded.sessionOwnerJobId };
  if (recorded.verdict === 'unreadable') {
    return { verdict: 'unreadable', unreadableFile: { jobId: job.id, file: jobFileInDataFolderOf(job.id, STALE_GREEN_SESSION_OWNER_FILE), reason: recorded.reason } };
  }
  const predecessor = lastEndedPredecessorOf(logRecords, job);
  // One that cannot be read was still left; the launch that reads it for the handoff refuses before this owner is used.
  if (predecessor === null || !runsTheSameEntityAndStage(predecessor.scope, job) || staleGreenHandoffOf(trackerDirectory, predecessor) === null) return resumesNoEndedSession;
  if (!instanceSessionStarted(children, children.jobFolderOf(predecessor.jobId), FIRST_CHILD_INSTANCE, adapter)) return resumesNoEndedSession;
  return { verdict: 'answered', sessionOwnerJobId: sessionOwnerJobIdOf(logRecords, { ...job, id: predecessor.jobId, parentJobId: null }) };
}

/** The job whose session the launch of the job's current instance runs: the stale-green session it resumes, or the session it carries on. */
function launchSessionOwnerJobIdOf(
  children: BoardChildren,
  trackerDirectory: string,
  logRecords: readonly LogRecord[],
  job: Readonly<Job>,
  adapter: AgentAdapter,
): SessionOwnerAnswer<string> {
  const staleGreenSessionOwner = staleGreenSessionOwnerOf(children, trackerDirectory, logRecords, job, adapter);
  if (staleGreenSessionOwner.verdict === 'unreadable') return staleGreenSessionOwner;
  return { verdict: 'answered', sessionOwnerJobId: staleGreenSessionOwner.sessionOwnerJobId ?? sessionOwnerJobIdOf(logRecords, job) };
}

/** The message a resumed instance opens with: User's reopening text, the red handoff it resumes to fix, or the plain resume message. */
function resumeLineOf(trackerDirectory: string, board: Pick<Board, 'logRecordsSoFar'>, job: Readonly<Job>, messages: ResumeMessages): string | StoredFileUnreadable {
  const reopenText = reopenTextOf(board.logRecordsSoFar(), job);
  if (reopenText !== null) return reopenText;
  const redHandoff = job.interruption === HANDOFF_RED_INTERRUPTION ? RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolderIn(trackerDirectory, job.id)) : null;
  if (StoredFileUnreadable.isUnreadableFile(redHandoff)) return redHandoff;
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

/** Kept beside a fresh instance's launch files until a pass finds its child live, so a Hephaestus restart in between loses nothing. */
function storeFirstMessage(jobFolder: string, instance: number, message: string): void {
  writeFileAtomically(firstMessagePathOf(jobFolder, instance), message);
}

/**
 * The task text of each fresh instance, its session's first input, written once its child runs, with the pictures of a product owner's
 * request. The marker is written only after Talos took the line, so one not yet running is tried again on the next pass; a
 * Hephaestus that dies before the marker sends the line again, so the session can get its task text twice.
 */
async function deliverFirstMessages(
  children: BoardChildren, trackerDirectory: string, board: Pick<Board, 'jobs'>, adapter: Pick<AgentAdapter, 'chatLineOf'>
): Promise<void> {
  for (const job of board.jobs()) {
    if (isResumedInstance(job)) continue;
    const jobFolder   = children.jobFolderOf(job.id);
    const messagePath = firstMessagePathOf(jobFolder, job.childInstance);
    const marker      = firstMessageMarkerOf(jobFolder, job.childInstance);
    if (!existsSync(messagePath) || existsSync(marker) || children.livenessOf(jobFolder, job.childInstance).verdict !== 'live') continue;
    const pictures = PictureStore.attachmentsOf(trackerDirectory, IntakeSessions.firstMessagePicturesOf(job));
    const line = adapter.chatLineOf(readFileSync(messagePath, 'utf8'), pictures);
    if (await children.sendInput(jobFolder, job.childInstance, { act: 'write-line', line })) writeFileSync(marker, '');
  }
}

/**
 * The first line of each resumed instance, written once its child runs, with the pictures of User's reopening message; an answer
 * delivery is resumed with the answer instead. The marker is written only after Talos took the line, so a child not yet running is
 * tried again on the next pass.
 */
async function deliverResumeMessages(
  children: BoardChildren,
  trackerDirectory: string,
  board: Board,
  adapter: AgentAdapter,
  messages: ResumeMessages,
  answerAwaitsDelivery: (job: Readonly<Job>) => boolean,
): Promise<void> {
  for (const job of board.jobs()) {
    if (job.state !== 'running' || !isResumedInstance(job) || job.interruption === 'answer-delivery' || answerAwaitsDelivery(job)) continue;
    const jobFolder = children.jobFolderOf(job.id);
    const marker    = resumeMessageMarkerOf(jobFolder, job.childInstance);
    if (existsSync(marker) || children.livenessOf(jobFolder, job.childInstance).verdict !== 'live') continue;
    const pictures = PictureStore.attachmentsOf(trackerDirectory, reopenPicturesOf(board.logRecordsSoFar(), job));
    const resumeLine = resumeLineOf(trackerDirectory, board, job, messages);
    // Its launch refused on red handoff facts that cannot be read, so no session waits for this line.
    if (StoredFileUnreadable.isUnreadableFile(resumeLine)) continue;
    const line = adapter.chatLineOf(resumeLine, pictures);
    if (await children.sendInput(jobFolder, job.childInstance, { act: 'write-line', line })) writeFileSync(marker, '');
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
  lastWorkerJobIdOf,
  lastWorkerOf,
  newestReviewSectionOf,
  redHandoffTakenOverOf,
  staleGreenSessionOwnerOf,
  recordStaleGreenSessionOwner,
  launchSessionOwnerJobIdOf,
  resumeLineOf,
  storeFirstMessage,
  recordAnswerAsResumeLine,
  deliverFirstMessages,
  deliverResumeMessages,
});
