/**
 * User's controls over a live job and the product owner's intake (design sections 7.4, 8.1 and 8.4): each records in the hold and the
 * Overseer carries it out, so every one works with the Overseer down. A stop or wind-down holds the job's ticket in the same hold.
 */
import type { JobChanged, Logged } from './@types/BoardChanges.ts';
import type {
  Job,
  JobEnding,
  JobStopMode,
  PictureReference
}                                           from './@types/Job.ts';
import type { LogRecord }      from './@types/LogRecord.ts';
import type { AgentQuestions } from './AgentQuestions.ts';
import type { BoardRecords }   from './BoardRecords.ts';
import { BoardRefusal }        from './BoardRefusal.ts';
import type { Decisions }      from './Decisions.ts';
import type { Jobs }           from './Jobs.ts';
import type { TicketSettings } from './TicketSettings.ts';

/** The states with no agent session to stop: a stop there ends the job in the same hold. */
const SESSIONLESS_STATES: readonly Job['state'][] = ['launching', 'preparing', 'interrupted', 'awaiting-answer'];

/** The jobs `job stop --all` reaches: the agents User started work through, never the Assistant or an Airlock's agents. */
const STOPPABLE_BY_ALL_KINDS: readonly Job['kind'][] = ['build', 'review', 'product-owner'];

const PRODUCT_OWNER_KIND = 'product-owner';

export const STOPPED_BY_USER_CAUSE = 'stopped by User';

export const FRESH_AGENT_CAUSE = 'fresh agent asked by User';

const TICKET_HOLD_PHRASE_OF_MODE: Readonly<Record<Exclude<JobStopMode, 'fresh'>, string>> = {
  'stop':      'stopped by User',
  'wind-down': 'wound down by User',
};

const WITHDRAWN_BY_STOP_REASON = 'its product-owner job was stopped by User';

export class JobControls {
  constructor(
    private readonly records: BoardRecords,
    private readonly jobRules: Jobs,
    private readonly decisionRules: Decisions,
    private readonly ticketSettings: TicketSettings,
    private readonly agentQuestions: AgentQuestions,
  ) {}

  /**
   * `stop` and `wind-down` hold the job's ticket "stopped by User (J<n>)" or "wound down by User (J<n>)", which the policy never undoes;
   * a stopped product owner is finished, its open questions withdrawn. A job with no session to stop ends here.
   */
  requestJobStop(jobId: string, mode: JobStopMode, at: string): JobChanged {
    const job = this.jobRules.requireJob(jobId);
    if (mode === 'fresh' && job.ticketIds.length === 0) throw new BoardRefusal({ reason: 'job-has-no-ticket', jobId });
    const logged: LogRecord[] = [...this.jobRules.recordStopRequest(jobId, mode, at).logged];
    if (mode !== 'fresh') logged.push(...this.holdTicketsOf(job, `${TICKET_HOLD_PHRASE_OF_MODE[mode]} (${jobId})`, at));
    if (mode === 'wind-down') return { job, logged };
    if (job.kind === PRODUCT_OWNER_KIND) {
      for (const decision of this.decisionRules.decisions().filter((open) => open.jobId === jobId)) {
        logged.push(...this.decisionRules.withdrawDecision(decision.id, WITHDRAWN_BY_STOP_REASON, at).logged);
      }
      if (job.state !== 'stopping') logged.push(...this.jobRules.moveJob(jobId, 'stopping', at).logged);
      return { job, logged };
    }
    if (SESSIONLESS_STATES.includes(job.state)) {
      const ending: JobEnding = mode === 'fresh' ? { outcome: 'replaced', cause: FRESH_AGENT_CAUSE } : { outcome: 'stopped', cause: STOPPED_BY_USER_CAUSE };
      return this.endJob(jobId, ending, logged, at);
    }
    if (job.state !== 'stopping') logged.push(...this.jobRules.moveJob(jobId, 'stopping', at).logged);
    return { job, logged };
  }

  /** `oversee pause` plus a stop or wind-down of every live build, review and product-owner job. */
  stopAllJobs(mode: Exclude<JobStopMode, 'fresh'>, pause: () => readonly LogRecord[], at: string): Logged {
    const jobIds = this.jobRules.jobs().filter((job) => STOPPABLE_BY_ALL_KINDS.includes(job.kind)).map((job) => job.id);
    return { logged: [...pause(), ...jobIds.flatMap((jobId) => this.requestJobStop(jobId, mode, at).logged)] };
  }

  /**
   * A product owner that closed, by its own `intake-close` or by `job stop`, is reopened: its session resumes with the text and pictures as
   * its first line, keeping the title its intake was given, and the log records the tickets its intake filed before. Every other finished
   * job is refused `job-finished`. Only a product owner takes pictures: any other job is refused `pictures-not-taken`.
   */
  messageJob(jobId: string, text: string, pictures: readonly PictureReference[], at: string): JobChanged {
    const ended = this.jobRules.endedJobOutcomeOf(jobId);
    const kind = ended?.kind ?? this.jobRules.jobById(jobId)?.kind;
    if (pictures.length > 0 && kind !== undefined && kind !== PRODUCT_OWNER_KIND) throw new BoardRefusal({ reason: 'pictures-not-taken', jobId, kind });
    if (ended?.kind !== PRODUCT_OWNER_KIND || ended.outcome !== 'closed') return this.jobRules.recordMessage(jobId, text, pictures, at);
    const offeredTicketIds = this.records.ticketRecords
      .filter(({ frontmatter }) => frontmatter.filedByJob !== undefined && this.intakeChainOfJobId(jobId).includes(frontmatter.filedByJob))
      .map(({ frontmatter }) => frontmatter.id);
    const title = this.newestIntakeTitleOf(jobId);
    const intake = { text, ...(title === undefined ? {} : { title }), ...(pictures.length === 0 ? {} : { pictures: [...pictures] }) };
    return this.jobRules.reopenEndedJob(jobId, {
      text, pictures, offeredTicketIds, intake
    }, at);
  }

  /**
   * Recorded `launching` with no ticket and no build slot, so it works with the Overseer down; several may run at once. A request of only
   * spaces is refused `intake-empty` unless pictures carry it.
   */
  startIntake(text: string, pictures: readonly PictureReference[], at: string): JobChanged {
    if (text.trim() === '' && pictures.length === 0) throw new BoardRefusal({ reason: 'intake-empty' });
    const intake = { text, ...(pictures.length === 0 ? {} : { pictures: [...pictures] }) };
    return this.jobRules.launchJob({
      kind: PRODUCT_OWNER_KIND, role: PRODUCT_OWNER_KIND, ticketIds: [], parentJobId: null, attempt: 1, target: null, intake,
    }, at);
  }

  /** Recorded `launching` with no ticket, target or build slot: the lifecycle's answer to `checks-not-set`, or `advise` on demand. */
  startOnboarder(at: string): JobChanged {
    return this.jobRules.launchJob({
      kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
    }, at);
  }

  /**
   * Closes the session's input; the Overseer ends it `closed` once its Watcher is gone. The caller submits the drafts the intake filed in
   * the same hold.
   */
  closeIntake(jobId: string, proposedDraftSets: readonly (readonly string[])[], at: string): JobChanged {
    const job = this.jobRules.requireJob(jobId);
    if (job.kind !== PRODUCT_OWNER_KIND) throw new BoardRefusal({ reason: 'job-not-intake', jobId, kind: job.kind });
    if (job.state === 'stopping') throw new BoardRefusal({ reason: 'job-finished', jobId });
    this.jobRules.setProposedDraftSets(jobId, proposedDraftSets);
    return { job, logged: [...this.jobRules.moveJob(jobId, 'stopping', at).logged] };
  }

  /** The product owner's short title for its intake, trimmed; a blank one is refused `intake-title-empty`. */
  titleIntake(jobId: string, title: string, at: string): JobChanged {
    const job = this.jobRules.requireJob(jobId);
    if (job.kind !== PRODUCT_OWNER_KIND) throw new BoardRefusal({ reason: 'job-not-intake', jobId, kind: job.kind });
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') throw new BoardRefusal({ reason: 'intake-title-empty', jobId });
    return this.jobRules.recordIntakeTitle(jobId, trimmedTitle, at);
  }

  /**
   * A fresh product owner for one past the bound: the request's pictures and the answers its questions got travel in its first message,
   * never a `--resume`.
   */
  refreshIntake(jobId: string, at: string): Logged {
    const job = this.jobRules.requireJob(jobId);
    const answeredRequestIds = new Set(job.answeredRequestIds);
    const carriedAnswers = this.logRecordsSoFar()
      .flatMap((record) => (record.kind === 'decision-answered' && record.fields.requestId !== undefined && answeredRequestIds.has(record.fields.requestId)
        ? [{ ...record.fields.answer }]
        : []));
    const ended = this.endJob(jobId, { outcome: 'replaced' }, [], at);
    const launched = this.jobRules.launchJob({
      kind:        PRODUCT_OWNER_KIND,
      role:        PRODUCT_OWNER_KIND,
      ticketIds:   [],
      parentJobId: jobId,
      attempt:     job.attempt + 1,
      target:      null,
      intake:      {
        text: job.intake?.text ?? '',
        ...(job.intake?.pictures === undefined ? {} : { pictures: [...job.intake.pictures] }),
        ...(carriedAnswers.length === 0 ? {} : { carriedAnswers }),
      },
    }, at);
    return { logged: [...ended.logged, ...launched.logged] };
  }

  /** The job and every product owner it took over from, through the `parentJobId` each launch recorded. */
  intakeChainOf(job: Readonly<Job>): string[] {
    return this.intakeChainOfJobId(job.id, job.parentJobId);
  }

  /** An ended job's parent is read from its launch record. */
  private intakeChainOfJobId(jobId: string, knownParentJobId?: string | null): string[] {
    const parentOf = new Map<string, string | null>();
    for (const record of this.logRecordsSoFar()) {
      if (record.kind === 'job-launched') parentOf.set(record.jobId, record.fields.parentJobId);
    }
    const chain = [jobId];
    let parent = knownParentJobId === undefined ? parentOf.get(jobId) ?? null : knownParentJobId;
    while (parent !== null && !chain.includes(parent)) {
      chain.push(parent);
      parent = parentOf.get(parent) ?? null;
    }
    return chain;
  }

  private newestIntakeTitleOf(jobId: string): string | undefined {
    const titled = this.logRecordsSoFar().findLast((record) => record.kind === 'intake-titled' && record.jobId === jobId);
    return titled?.kind === 'intake-titled' ? titled.fields.title : undefined;
  }

  private logRecordsSoFar(): LogRecord[] {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords];
  }

  private holdTicketsOf(job: Readonly<Job>, reason: string, at: string): LogRecord[] {
    return job.ticketIds.flatMap((ticketId) => {
      const ticket = this.records.ticketRecordById(ticketId);
      return ticket === undefined || ticket.frontmatter.hold !== undefined ? [] : [...this.ticketSettings.holdTicket(ticketId, reason, at).logged];
    });
  }

  private endJob(jobId: string, ending: JobEnding, loggedBefore: readonly LogRecord[], at: string): JobChanged {
    const ended = this.jobRules.endJob(jobId, ending, at);
    return { job: ended.job, logged: [...loggedBefore, ...ended.logged, ...this.agentQuestions.rebindQuestionsOfEndedJob(ended.job, at)] };
  }
}
