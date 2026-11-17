/**
 * The Overseer's jobs on the board: their launch, their moves through the one legality table, their interruptions, resumes, end and
 * reopening, and the cursor, answered requests, option notes and Airlock each carries. Only a launch, an interruption, a resume, an end, a
 * reopening, a stop request, a message and an intake title are logged.
 */
import type { JobChanged, Logged } from './@types/BoardChanges.ts';
import type {
  InterruptionCause,
  Job,
  JobEnding,
  JobEventCursor,
  JobIntake,
  JobLaunch,
  JobMoveTarget,
  JobOutcome,
  JobState,
  JobStopMode,
  Airlock,
  OverseerStopReason,
  PictureReference
}                                   from './@types/Job.ts';
import type { HatchAppliedRecord, LogRecord, LogRecordFieldsOf }    from './@types/LogRecord.ts';
import type { QuestionOptionNotes }                                 from './@types/OptionConsequences.ts';
import type { BoardRecords }                                        from './BoardRecords.ts';
import { BoardRefusal }                                             from './BoardRefusal.ts';
import { LEGAL_SOURCE_STATES_FOR_JOB_MOVE, PROCESSLESS_JOB_STATES } from './constants/JobMoveLegality.ts';
import {
  CRASH_INTERRUPTION_CAUSES,
  FIRST_WATCHER_INSTANCE,
  FIRST_JOB_NUMBER,
  FORCED_STOP_REFUSED_INTERRUPTION,
  JOB_ID_PREFIX
}                                   from './constants/JobStates.ts';
import { OptionConsequencesUtil } from './utils/OptionConsequencesUtil.ts';

/** The states a plain move names: an interruption carries its cause. The table refuses `launching`, which only a launch enters. */
export type SteppedJobState = Exclude<JobState, 'interrupted'>;

const FIRST_EVENT_SEQUENCE = 0;

/** A job keeps the newest notes for this many question texts; an older one no question took is dropped. */
const PENDING_OPTION_NOTES_PER_JOB = 8;

/** A chat turn for a session: its text, the pictures it carries, and who wrote it. */
export interface JobMessage {
  text:     string;
  pictures: readonly PictureReference[];
  sender:   JobMessageSender;
}

/** Who wrote a message's text: User, or the Overseer wording User's setup move for the pipeline agent. */
export type JobMessageSender = 'user' | 'overseer';

/** The message that reopens a closed session, with the pictures it carries, and the tickets its intake filed before. */
export interface JobReopening {
  text:             string;
  pictures:         readonly PictureReference[];
  offeredTicketIds: readonly string[];
  sender:           JobMessageSender;
  intake?:          JobIntake;
}

/** Set only for the Overseer, so User's message logs as it always did. */
function senderFieldOf(sender: JobMessageSender): { byOverseer?: true } {
  return sender === 'overseer' ? { byOverseer: true } : {};
}

function picturesCopyOf(pictures: readonly PictureReference[]): PictureReference[] {
  return pictures.map((picture) => ({ pictureId: picture.pictureId, name: picture.name }));
}

function jobNumberOf(jobId: string): number | null {
  const match = new RegExp(`^${JOB_ID_PREFIX}([1-9][0-9]*)$`).exec(jobId);
  return match?.[1] === undefined ? null : Number(match[1]);
}

function isProcessless(state: JobState): boolean {
  return (PROCESSLESS_JOB_STATES as readonly JobState[]).includes(state);
}

function isCrash(cause: InterruptionCause): boolean {
  return (CRASH_INTERRUPTION_CAUSES as readonly InterruptionCause[]).includes(cause);
}

export class Jobs {
  constructor(private readonly records: BoardRecords) {}

  /** In launch order. */
  jobs(): readonly Readonly<Job>[] {
    return this.records.progress.jobs ?? [];
  }

  jobById(jobId: string): Readonly<Job> | undefined {
    return this.jobs().find((job) => job.id === jobId);
  }

  launchJob(launch: JobLaunch, at: string): JobChanged {
    const job: Job = {
      id:                 this.takeNextJobId(),
      kind:               launch.kind,
      role:               launch.role,
      ticketIds:          [...launch.ticketIds],
      parentJobId:        launch.parentJobId,
      attempt:            launch.attempt,
      target:             launch.target,
      state:              'launching',
      watcherInstance:    FIRST_WATCHER_INSTANCE,
      eventCursor:        { instance: FIRST_WATCHER_INSTANCE, sequence: FIRST_EVENT_SEQUENCE },
      answeredRequestIds: [],
      crashResumes:       0,
      ...(launch.intake === undefined ? {} : { intake: { ...launch.intake } }),
      ...(launch.entity === undefined ? {} : { entity: launch.entity }),
      ...(launch.stage === undefined ? {} : { stage: launch.stage }),
    };
    this.liveJobRecords().push(job);
    const logged = this.records.logger.log({
      kind:   'job-launched',
      jobId:  job.id,
      fields: {
        kind:        job.kind,
        role:        job.role,
        ticketIds:   [...job.ticketIds],
        attempt:     job.attempt,
        target:      job.target,
        parentJobId: job.parentJobId,
        ...(job.intake === undefined ? {} : { intakeText: job.intake.text }),
        ...(job.intake?.pictures === undefined ? {} : { intakePictures: picturesCopyOf(job.intake.pictures) }),
        ...(job.entity === undefined ? {} : { entity: job.entity }),
        ...(job.stage === undefined ? {} : { stage: job.stage }),
      },
    }, at);
    return { job, logged: [logged] };
  }

  /** A move into `running` from a state with no process is a resume: it spawns the next Watcher instance and is logged. */
  moveJob(jobId: string, targetState: SteppedJobState, at: string): JobChanged {
    const job = this.requireLiveJob(jobId);
    this.refuseIllegalMove(job, targetState);
    const resumes = targetState === 'running' && isProcessless(job.state);
    job.state     = targetState;
    if (!resumes) return { job, logged: [] };

    const cause      = job.interruption ?? 'watcher-lost';
    job.watcherInstance += 1;
    if (isCrash(cause)) job.crashResumes += 1;
    return { job, logged: [this.records.logger.log({ kind: 'job-resumed', jobId, fields: { watcherInstance: job.watcherInstance, cause } }, at)] };
  }

  /** A job interrupted `forced-stop-refused` takes the cause a later forced stop settles, staying interrupted. */
  interruptJob(jobId: string, cause: InterruptionCause, at: string): JobChanged {
    const job = this.requireLiveJob(jobId);
    const settlesARefusedStop = job.state === 'interrupted' && job.interruption === FORCED_STOP_REFUSED_INTERRUPTION;
    if (!settlesARefusedStop) this.refuseIllegalMove(job, 'interrupted');
    job.state        = 'interrupted';
    job.interruption = cause;
    return { job, logged: [this.records.logger.log({ kind: 'job-interrupted', jobId, fields: { cause, watcherInstance: job.watcherInstance } }, at)] };
  }

  /** The only way a job finishes: it leaves the board in this hold and lives on in the log, and every later move of it is refused. */
  endJob(jobId: string, ending: JobEnding, at: string): JobChanged {
    const job = this.requireLiveJob(jobId);
    this.refuseIllegalMove(job, 'ended');
    const liveJobs = this.liveJobRecords();
    liveJobs.splice(liveJobs.indexOf(job), 1);
    job.outcome = ending.outcome;
    const logged = this.records.logger.log({
      kind:   'job-ended',
      jobId,
      fields: {
        outcome:           ending.outcome,
        ...(ending.cause === undefined ? {} : { cause: ending.cause }),
        ...(ending.commit === undefined ? {} : { commit: ending.commit }),
        deniedPermissions: [...(ending.deniedPermissions ?? [])],
      },
    }, at);
    return { job, logged: [logged] };
  }

  setJobEventCursor(jobId: string, cursor: JobEventCursor): Readonly<Job> {
    const job       = this.requireLiveJob(jobId);
    job.eventCursor = { instance: cursor.instance, sequence: cursor.sequence };
    return job;
  }

  /** A request id answered twice is kept once. */
  addAnsweredRequestId(jobId: string, requestId: string): Readonly<Job> {
    const job = this.requireLiveJob(jobId);
    if (!job.answeredRequestIds.includes(requestId)) job.answeredRequestIds.push(requestId);
    return job;
  }

  /** Kept on the job so the Overseer sends its frames from the board; a later request replaces an earlier one. */
  recordStopRequest(jobId: string, mode: JobStopMode, at: string): JobChanged {
    const job       = this.requireLiveJob(jobId);
    job.stopRequest = mode;
    return { job, logged: [this.records.logger.log({ kind: 'job-stop-requested', jobId, fields: { mode } }, at)] };
  }

  /** The outcome and kind of a job that left the board, read from its log records; `undefined` for a live or unknown one. */
  endedJobOutcomeOf(jobId: string): { kind: Job['kind']; outcome: JobOutcome } | undefined {
    if (this.jobById(jobId) !== undefined) return undefined;
    const records  = this.logRecordsSoFar();
    const launched = records.find((record) => record.kind === 'job-launched' && record.jobId === jobId);
    const ended    = records.findLast((record) => record.kind === 'job-ended' && record.jobId === jobId);
    if (launched?.kind !== 'job-launched' || ended?.kind !== 'job-ended') return undefined;
    return { kind: launched.fields.kind, outcome: ended.fields.outcome };
  }

  /**
   * Puts an ended job back on the board from its log records, `running` in its next Watcher instance, so the Overseer launches it resuming the
   * same session; the caller decides which ended jobs may come back.
   */
  reopenEndedJob(jobId: string, reopening: JobReopening, at: string): JobChanged {
    const records  = this.logRecordsSoFar().filter((record) => 'jobId' in record && record.jobId === jobId);
    const launched = records.find((record) => record.kind === 'job-launched');
    if (launched?.kind !== 'job-launched' || this.jobById(jobId) !== undefined) {
      return this.recordMessage(jobId, { text: reopening.text, pictures: reopening.pictures, sender: reopening.sender }, at);
    }
    const lastWatcherInstance = records.reduce((highest, record) => (
      (record.kind === 'job-resumed' || record.kind === 'job-interrupted' || record.kind === 'job-reopened') ? Math.max(highest, record.fields.watcherInstance) : highest
    ), FIRST_WATCHER_INSTANCE);
    const watcherInstance = lastWatcherInstance + 1;
    const job: Job = {
      id:                 jobId,
      kind:               launched.fields.kind,
      role:               launched.fields.role,
      ticketIds:          [...launched.fields.ticketIds],
      parentJobId:        launched.fields.parentJobId,
      attempt:            launched.fields.attempt,
      target:             launched.fields.target,
      state:              'running',
      watcherInstance,
      eventCursor:        { instance: watcherInstance, sequence: FIRST_EVENT_SEQUENCE },
      answeredRequestIds: [],
      crashResumes:       0,
      ...(reopening.intake === undefined ? {} : { intake: { ...reopening.intake } }),
      ...(launched.fields.entity === undefined ? {} : { entity: launched.fields.entity }),
      ...(launched.fields.stage === undefined ? {} : { stage: launched.fields.stage }),
    };
    this.liveJobRecords().push(job);
    const fields = {
      watcherInstance,
      text:             reopening.text,
      offeredTicketIds: [...reopening.offeredTicketIds],
      ...(reopening.pictures.length === 0 ? {} : { pictures: picturesCopyOf(reopening.pictures) }),
      ...senderFieldOf(reopening.sender),
    };
    return { job, logged: [this.records.logger.log({ kind: 'job-reopened', jobId, fields }, at)] };
  }

  /** A finished session is continued only by `reopenEndedJob`: a session whose input is closing is refused like an ended job. */
  /** `pictures` are recorded only when there are some, so a message without them logs as it always did. */
  recordMessage(jobId: string, message: JobMessage, at: string): JobChanged {
    const job = this.requireLiveJob(jobId);
    if (job.state === 'stopping') throw new BoardRefusal({ reason: 'job-finished', jobId });
    const { text, pictures, sender } = message;
    const fields = { text, ...(pictures.length === 0 ? {} : { pictures: picturesCopyOf(pictures) }), ...senderFieldOf(sender) };
    return { job, logged: [this.records.logger.log({ kind: 'job-messaged', jobId, fields }, at)] };
  }

  /** Kept on the job for the Bridge and logged, so the title outlives the job; a later title replaces an earlier one. */
  recordIntakeTitle(jobId: string, title: string, at: string): JobChanged {
    const job  = this.requireLiveJob(jobId);
    job.intake = { ...job.intake ?? { text: '' }, title };
    return { job, logged: [this.records.logger.log({ kind: 'intake-titled', jobId, fields: { title } }, at)] };
  }

  /** Notes for a question text the job noted before replace the earlier ones; not logged, as they only wait for the question. */
  recordQuestionOptionNotes(jobId: string, notes: Readonly<QuestionOptionNotes>): JobChanged {
    const job  = this.requireLiveJob(jobId);
    const kept = (job.pendingOptionNotes ?? []).filter((pending) => pending.question !== notes.question);
    const options = notes.options.map((option) => ({ label: option.label, ...OptionConsequencesUtil.consequencesCopyOf(option) }));
    job.pendingOptionNotes = [...kept, { question: notes.question, options }].slice(-PENDING_OPTION_NOTES_PER_JOB);
    return { job, logged: [] };
  }

  /** Removes and gives back the notes for the questions asked; the key goes with the last note, so a job with none stores none. */
  takeQuestionOptionNotes(jobId: string, isAsked: (notes: Readonly<QuestionOptionNotes>) => boolean): QuestionOptionNotes[] {
    const job     = this.requireLiveJob(jobId);
    const pending = job.pendingOptionNotes ?? [];
    const taken   = pending.filter(isAsked);
    if (taken.length === 0) return [];
    const left = pending.filter((notes) => !taken.includes(notes));
    if (left.length === 0) delete job.pendingOptionNotes;
    else job.pendingOptionNotes = left;
    return taken;
  }

  setProposedDraftSets(jobId: string, proposedDraftSets: readonly (readonly string[])[]): Readonly<Job> {
    const job = this.requireLiveJob(jobId);
    job.intake = { ...job.intake ?? { text: '' }, proposedDraftSets: proposedDraftSets.map((draftSet) => [...draftSet]) };
    return job;
  }

  /** Refused `unknown-job` or `job-finished` like every other move, so a control names why it cannot act. */
  requireJob(jobId: string): Readonly<Job> {
    return this.requireLiveJob(jobId);
  }

  /** A `null` slot frees the one the job held. */
  setJobSlot(jobId: string, slot: Airlock | null): Readonly<Job> {
    const job = this.requireLiveJob(jobId);
    if (slot === null) delete job.airlock;
    else job.airlock = {
      target: slot.target, targetTip: slot.targetTip, branchTip: slot.branchTip, phase: slot.phase
    };
    return job;
  }

  recordOverseerStarted(versions: { codeVersion: string; installVersion: number }, at: string): Logged {
    this.records.progress.overseerFirstStartedAt ??= at;
    return { logged: [this.records.logger.log({ kind: 'overseer-started', fields: { codeVersion: versions.codeVersion, installVersion: versions.installVersion } }, at)] };
  }

  recordOverseerStopped(reason: OverseerStopReason, at: string): Logged {
    return { logged: [this.records.logger.log({ kind: 'overseer-stopped', fields: { reason } }, at)] };
  }

  recordFlintBrainEnded(run: LogRecordFieldsOf<'flint-brain-ended'>, at: string): Logged {
    const fields = {
      startedBy: run.startedBy, startedAt: run.startedAt, endedAt: run.endedAt, endedReason: run.endedReason, tokens: run.tokens, calls: run.calls
    };
    return { logged: [this.records.logger.log({ kind: 'flint-brain-ended', fields }, at)] };
  }

  recordBatonPassFailed(failure: { successorCodeVersion: string; step: string; error: string }, at: string): Logged {
    const fields = { successorCodeVersion: failure.successorCodeVersion, step: failure.step, error: failure.error };
    return { logged: [this.records.logger.log({ kind: 'baton-pass-failed', fields }, at)] };
  }

  recordUsageLimitHit(jobId: string, limit: { window: string; resetsAt: string }, at: string): Logged {
    return { logged: [this.records.logger.log({ kind: 'usage-limit-hit', jobId, fields: { window: limit.window, resetsAt: limit.resetsAt } }, at)] };
  }

  recordHatchApplied(jobId: string, applied: LogRecordFieldsOf<'hatch-applied'>, at: string): Logged {
    const fields = {
      requestId:   applied.requestId,
      commandKind: applied.commandKind,
      outcome:     applied.outcome,
      ...(applied.ticketIds === undefined ? {} : { ticketIds: [...applied.ticketIds] }),
      ...(applied.status === undefined ? {} : { status: applied.status }),
      ...(applied.detail === undefined ? {} : { detail: applied.detail }),
    };
    return { logged: [this.records.logger.log({ kind: 'hatch-applied', jobId, fields }, at)] };
  }

  /** Read from the stored log and this hold's records alike, so a request answered in an earlier pass or earlier in this one is never applied again. */
  hatchAppliedRecordOf(requestId: string): HatchAppliedRecord | null {
    const isTheRequest = (record: LogRecord): record is HatchAppliedRecord => record.kind === 'hatch-applied' && record.fields.requestId === requestId;
    return this.records.storedLogRecords.find(isTheRequest) ?? this.records.loggedRecords.find(isTheRequest) ?? null;
  }

  private logRecordsSoFar(): LogRecord[] {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords];
  }

  private refuseIllegalMove(job: Readonly<Job>, targetState: JobMoveTarget): void {
    if (LEGAL_SOURCE_STATES_FOR_JOB_MOVE[targetState].includes(job.state)) return;
    throw new BoardRefusal({
      reason: 'job-move-illegal', jobId: job.id, state: job.state, targetState
    });
  }

  /** A job leaves the board only by ending, so a well-formed id below the counter that the board no longer holds is a finished job. */
  private requireLiveJob(jobId: string): Job {
    const job = this.records.progress.jobs?.find((candidate) => candidate.id === jobId);
    if (job !== undefined) return job;
    const jobNumber = jobNumberOf(jobId);
    if (jobNumber !== null && jobNumber < (this.records.progress.nextJobId ?? FIRST_JOB_NUMBER)) throw new BoardRefusal({ reason: 'job-finished', jobId });
    throw new BoardRefusal({ reason: 'unknown-job', jobId });
  }

  /** Adds the list on first use, so a tracker that never launched a job stores none. */
  private liveJobRecords(): Job[] {
    this.records.progress.jobs ??= [];
    return this.records.progress.jobs;
  }

  /** The counter is stored and never wound back, so an ended job's id is never handed to a new one. */
  private takeNextJobId(): string {
    const highestLiveNumber        = this.jobs().reduce((highest, job) => Math.max(highest, jobNumberOf(job.id) ?? 0), 0);
    const allocated                = Math.max(this.records.progress.nextJobId ?? FIRST_JOB_NUMBER, highestLiveNumber + 1);
    this.records.progress.nextJobId = allocated + 1;
    return `${JOB_ID_PREFIX}${allocated}`;
  }
}
