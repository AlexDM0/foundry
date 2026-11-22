/**
 * The tracker's aggregate for one invocation and the one domain class callers use: the compound changes to rows and tickets, the queries
 * over them, and which tickets it changed. It does no I/O, logs through the `Logger` and refuses with a `BoardRefusal`; it changes the
 * records it was handed in place. Each rule lives in the module beside it that the method hands it to.
 */
import type {
  AgentChoice,
  AgentStopRecorded,
  EntityAssignment,
  ConcurrencyLimitSet,
  DraftChanged,
  DraftClaimChanged,
  EpicChanged,
  EpicEdited,
  GateProfileChanged,
  DecisionAnswered,
  DecisionClosed,
  DecisionOpened,
  IncidentClosed,
  IncidentEscalated,
  IncidentOpened,
  JobChanged,
  LifecycleAdvanced,
  Logged,
  NeedDeclared,
  PipelineApplyChanged,
  PipelineChanged,
  PipelineSetupChanged,
  ReviewBarRequest,
  ReviewBarStarted,
  ReviewRecorded,
  ReviewRecording,
  TaskAddition,
  TaskAnnotation,
  TaskCorrection,
  TicketChanged,
  TicketClaim,
  TicketDependenciesChanged,
  TicketEpicsChanged,
  TicketMoved,
  TicketMoveRequest,
  TicketRelease,
  TicketsClaimed,
  DraftsSubmitted,
  TicketsReadied,
  TicketsReleased,
  TokenCredit,
  TrackerCleared,
  HephaestusStateSet
}                                                           from './@types/BoardChanges.ts';
import type { Concurrency, DispatchCapacity }                 from './@types/Concurrency.ts';
import type { Decision, DecisionAnswerForm, DecisionOpening } from './@types/Decision.ts';
import type {
  Draft,
  DraftNoteAddition,
  DraftOpening,
  DraftQuestionAsking,
  DraftState,
  DraftSummary
}                                                           from './@types/Draft.ts';
import type {
  Epic,
  EpicAddition,
  EpicEdit,
  EpicRollup
}                                                           from './@types/Epic.ts';
import type { GatePhase, GateRunStamp } from './@types/GatePhase.ts';
import type {
  GateProfileRequest,
  GateProfileRun,
  GateProfileRunEnd,
  GateProfilesReading,
  GateProfiles as StoredGateProfiles
}                                                           from './@types/GateProfile.ts';
import type {
  Incident,
  IncidentDefaultCause,
  IncidentDeliveryTurn,
  IncidentMove,
  IncidentOpening
}                                              from './@types/Incident.ts';
import type {
  InterruptionCause,
  Job,
  JobEnding,
  JobEventCursor,
  JobLaunch,
  JobOutcome,
  JobStopMode,
  LostLineKind,
  Airlock,
  HephaestusStopReason,
  PictureReference,
  PipelineStepRun
}                                              from './@types/Job.ts';
import type { LaunchSlots }                          from './@types/LaunchSlots.ts';
import type { LifecycleLimits, LifecycleThresholds } from './@types/LifecycleLimits.ts';
import type {
  AgentUsage,
  HatchAppliedRecord,
  LogRecord,
  LogRecordFieldsOf
} from './@types/LogRecord.ts';
import type { DeclaredNeed, NeedDeclaration } from './@types/Need.ts';
import type { QuestionOptionNotes }           from './@types/OptionConsequences.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineApproval,
  PipelineBilling,
  PipelineGate,
  PipelineStep
} from './@types/Pipeline.ts';
import type {
  ApplyFinishing,
  ApplyHolding,
  ApplyMainReading,
  ApplyRefusal,
  ApplyRequesting,
  ConstitutionEdit,
  ConstitutionSetting,
  ConstitutionSourcesReading,
  DraftEditRequest,
  EntityChangeRefusalReason,
  PipelineCheckEnding,
  PipelineCheckStart,
  PipelineSetup,
  PipelineSetupOpening,
  PipelineSetupReading,
  PipelineSetupStep,
  ResearchFindingRecording,
  SetupQuestionAsking,
  SetupQuestionReply,
  SetupQuestionStep,
  SnapshotRefusal,
  StoredConstitutionSources
} from './@types/PipelineSetup.ts';
import type {
  DecisionDraft,
  DecisionWording,
  PlaybookLaunchStage,
  PlaybookObservations,
  PlaybookStep
}                                              from './@types/PlaybookStep.ts';
import type {
  DisplayState,
  Task,
  TaskStatus,
  TicketStage
} from './@types/Task.ts';
import type {
  ReadinessGap,
  ReadyTicket,
  Ticket,
  TicketPriority,
  TicketSize,
  TicketStatus
}                                                         from './@types/Ticket.ts';
import type { TicketForecast }                              from './@types/TicketForecast.ts';
import type { HephaestusState, TrackerProgress, ViewRange } from './@types/TrackerProgress.ts';
import { AgentQuestions }                                   from './AgentQuestions.ts';
import {
  type MergeCandidate,
  type MergeLanding,
  AirlockClaims,
  type AirlockClaim,
  type BranchTreeOf,
  type ConstitutionCommitSlotClaim,
  type MergeTargetOf,
  type RefreshSlotClaim,
  type TicketAwaitingGreen
}                                              from './AirlockClaims.ts';
import { BoardRecords }                                  from './BoardRecords.ts';
import { BoardRefusal, type BoardRefusalDetail }         from './BoardRefusal.ts';
import { Decisions }                                     from './Decisions.ts';
import { DispatchQueries }                               from './DispatchQueries.ts';
import { DisplayQueries }                                from './DisplayQueries.ts';
import { DraftContents }                                 from './DraftContents.ts';
import { Drafts }                                        from './Drafts.ts';
import { Epics }                                         from './Epics.ts';
import { Findings }                                      from './Findings.ts';
import { GateProfiles }                                  from './GateProfiles.ts';
import { GroupReleases }                                 from './GroupReleases.ts';
import { IncidentMoves }                                 from './IncidentMoves.ts';
import type { IncidentEscalation }                       from './Incidents.ts';
import { Incidents }                                     from './Incidents.ts';
import { JobControls }                                   from './JobControls.ts';
import type { JobMoveOptions, SteppedJobState }          from './Jobs.ts';
import { Jobs }                                          from './Jobs.ts';
import type { Logger }                                   from './Logger.ts';
import { MergeQueueMarks }                               from './MergeQueueMarks.ts';
import { MoveOffers, type JobOffers, type TicketOffers } from './MoveOffers.ts';
import { Needs }                                         from './Needs.ts';
import { PipelineSetups }                                from './PipelineSetups.ts';
import type { PlaybookFacts, PlaybookTicket }            from './Playbook.ts';
import { Playbook }                                      from './Playbook.ts';
import { ReviewBars }                                    from './ReviewBars.ts';
import type { ReviewStatisticsReport }                   from './ReviewStatistics.ts';
import { ReviewStatistics }                              from './ReviewStatistics.ts';
import { TaskRows }                                      from './TaskRows.ts';
import { TicketClaims }                                  from './TicketClaims.ts';
import { TicketDependencies }                            from './TicketDependencies.ts';
import type { TicketEdit, TicketEdited }                 from './TicketEdits.ts';
import { TicketEdits }                                   from './TicketEdits.ts';
import { TicketForecasts }                               from './TicketForecasts.ts';
import { TicketLinks }                                   from './TicketLinks.ts';
import { TicketMoves, type WorkFilesOf }                 from './TicketMoves.ts';
import { TicketSettings }                                from './TicketSettings.ts';
import { TicketStageRows }                               from './TicketStageRows.ts';
import { TokenCredits }                                  from './TokenCredits.ts';
import { TrackerChanges }                                from './TrackerChanges.ts';
import { PARKED_HOLD_PREFIX, RETIRED_DECISION_REASON }   from './constants/DecisionAndIncidentVocabulary.ts';
import { SETTLED_TICKET_STATUSES }                       from './constants/Statuses.ts';
import { GroupNameUtil }                                 from './utils/GroupNameUtil.ts';
import type { MergeForecast }                            from './utils/MergeQueueUtil.ts';
import { OptionConsequencesUtil }                        from './utils/OptionConsequencesUtil.ts';
import { PipelineUtil }                                  from './utils/PipelineUtil.ts';

/** The entity and stage a launch step names, which the job carries only when set. */
function launchStageOf(step: PlaybookLaunchStage): PlaybookLaunchStage {
  return { ...(step.entity === undefined ? {} : { entity: step.entity }), ...(step.stage === undefined ? {} : { stage: step.stage }) };
}

export interface BoardInput {
  progress:             TrackerProgress;
  tickets:              Ticket[];
  epics:                Epic[];
  /** Absent for a caller that reads no drafts, which reads as none. */
  drafts?:              Draft[];
  logger:               Logger;
  /** The log as stored, which orders the ready tickets by readiness; absent reads as an empty log. */
  storedLogRecords?:    readonly LogRecord[];
  /** The stored pipeline; absent or `null` when none is stored or it could not be read, which reads as no gates set. */
  pipeline?:            Pipeline | null;
  /** `pipeline-setup.json` as read; absent reads as no open record. */
  pipelineSetup?:       PipelineSetupReading;
  /** `gate-profiles.json` as read; absent reads as no run. */
  gateProfiles?:        GateProfilesReading;
  /** `constitution-sources.json` as read; absent reads as none stored. */
  constitutionSources?: ConstitutionSourcesReading;
}

export class Board {
  private readonly records: BoardRecords;

  private readonly trackerChanges: TrackerChanges;

  private readonly taskRows: TaskRows;

  private readonly tokenCredits: TokenCredits;

  private readonly ticketMoves: TicketMoves;

  private readonly ticketDependencies: TicketDependencies;

  private readonly ticketLinks: TicketLinks;

  private readonly ticketSettings: TicketSettings;

  private readonly ticketClaims: TicketClaims;

  private readonly ticketEdits: TicketEdits;

  private readonly groupReleases: GroupReleases;

  private readonly reviewBars: ReviewBars;

  private readonly dispatchQueries: DispatchQueries;

  private readonly displayQueries: DisplayQueries;

  private readonly reviewStatistics: ReviewStatistics;

  private readonly epicRules: Epics;

  private readonly draftRules: Drafts;

  private readonly draftContents: DraftContents;

  private readonly pipelineSetups: PipelineSetups;

  private readonly gateProfiles: GateProfiles;

  private readonly jobRules: Jobs;

  private readonly mergeQueueMarks: MergeQueueMarks;

  private readonly ticketStageRows: TicketStageRows;

  private readonly airlockClaims: AirlockClaims;

  private readonly decisionRules: Decisions;

  private readonly incidentRules: Incidents;

  private readonly agentQuestions: AgentQuestions;

  private readonly jobControls: JobControls;

  private readonly needRules: Needs;

  private readonly incidentMoves: IncidentMoves;

  private readonly findings: Findings;

  private readonly ticketForecasts: TicketForecasts;

  private readonly moveOffers: MoveOffers;

  constructor(input: BoardInput) {
    this.records            = new BoardRecords(input.progress, input.tickets, input.epics, input.drafts ?? [], input.logger, input.storedLogRecords ?? [], input.pipeline ?? null,
      input.pipelineSetup ?? { verdict: 'absent' }, input.gateProfiles ?? { verdict: 'absent' }, input.constitutionSources ?? { verdict: 'absent' });
    this.reviewBars         = new ReviewBars(this.records);
    this.groupReleases      = new GroupReleases(this.records);
    this.dispatchQueries    = new DispatchQueries(this.records, this.groupReleases);
    this.displayQueries     = new DisplayQueries(this.records, this.reviewBars);
    this.reviewStatistics   = new ReviewStatistics(this.records, this.reviewBars);
    this.ticketDependencies = new TicketDependencies(this.records);
    this.ticketLinks        = new TicketLinks(this.records);
    this.ticketMoves        = new TicketMoves(this.records, this.reviewBars, this.ticketDependencies, this.groupReleases);
    this.ticketClaims       = new TicketClaims(this.records, this.ticketMoves, this.reviewBars, this.dispatchQueries, this.groupReleases);
    this.ticketSettings     = new TicketSettings(this.records);
    this.ticketEdits        = new TicketEdits(this.records);
    this.taskRows           = new TaskRows(this.records);
    this.tokenCredits       = new TokenCredits(this.records, this.reviewBars);
    this.trackerChanges     = new TrackerChanges(this.records, this.dispatchQueries);
    this.epicRules          = new Epics(this.records, this.displayQueries);
    this.draftRules         = new Drafts(this.records);
    this.draftContents      = new DraftContents(this.records, this.draftRules);
    this.gateProfiles       = new GateProfiles(this.records);
    this.jobRules           = new Jobs(this.records);
    this.mergeQueueMarks    = new MergeQueueMarks(this.records);
    this.ticketStageRows    = new TicketStageRows(this.records, this.reviewBars);
    this.airlockClaims    = new AirlockClaims(this.records, this.jobRules, this.mergeQueueMarks);
    this.decisionRules      = new Decisions(this.records);
    this.pipelineSetups     = new PipelineSetups(this.records, this.trackerChanges, this.decisionRules);
    this.incidentRules      = new Incidents(this.records, this.decisionRules);
    this.agentQuestions     = new AgentQuestions(this.records, this.jobRules, this.decisionRules, this.ticketSettings, this.ticketEdits);
    this.jobControls        = new JobControls(this.records, this.jobRules, this.decisionRules, this.ticketSettings, this.agentQuestions);
    this.needRules          = new Needs(this.records, this.jobRules);
    this.findings           = new Findings(this.records, this.jobRules, this.ticketDependencies, this.ticketMoves);
    this.ticketForecasts    = new TicketForecasts(this.records, this.jobRules, this.mergeQueueMarks);
    this.moveOffers         = new MoveOffers(this.records, this.ticketMoves, this.jobRules, this.mergeQueueMarks);
    this.incidentMoves      = new IncidentMoves({
      records:        this.records,
      incidentRules:  this.incidentRules,
      decisionRules:  this.decisionRules,
      agentQuestions: this.agentQuestions,
      ticketSettings: this.ticketSettings,
      jobRules:       this.jobRules,
      endJob:         (jobId, ending, at) => this.endJob(jobId, ending, at),
      requestFresh:   (jobId, at) => this.jobControls.requestJobStop(jobId, 'fresh', at),
    });
  }

  /** Refuses `unknown-incident` or `incident-closed`. */
  requireOpenIncident(incidentId: string): Readonly<Incident> {
    return this.incidentRules.requireOpenIncident(incidentId);
  }

  /** Records a finding under an open incident, which stays open. */
  noteIncident(incidentId: string, text: string, at: string): Logged {
    return this.incidentMoves.noteIncident(incidentId, text, at);
  }

  /** Answers a `system-question` or `malformed-ticket`: its waiting job takes the answer, and a malformed ticket's goes under `## Questions`. */
  answerIncident(incidentId: string, text: string, at: string): Logged {
    return this.incidentMoves.answerIncident(incidentId, text, at);
  }

  /** Holds `parked:<kind>`, stops the incident's waiting job and opens a `parked` decision to User, carrying the agent's questions. */
  parkTicket(ticketId: string, reason: string, incidentId: string | null, at: string): Logged {
    return this.incidentMoves.parkTicket(ticketId, reason, incidentId, at);
  }

  /** User's stop, wind-down or fresh agent; `stop` and `wind-down` hold the job's ticket in this hold. */
  requestJobStop(jobId: string, mode: JobStopMode, at: string): JobChanged {
    return this.jobControls.requestJobStop(jobId, mode, at);
  }

  /** Asks every Assistant not yet asked to stop to wind down, as the switch going off does. */
  windDownAssistants(at: string): Logged {
    return this.jobControls.windDownAssistants(at);
  }

  /** Pauses the board, then stops or winds down every live build, review and product-owner job. */
  stopAllJobs(mode: Exclude<JobStopMode, 'fresh'>, at: string): Logged {
    const pause = (): readonly LogRecord[] => (this.hephaestusState() === 'paused' ? [] : this.setHephaestusState('paused', at).logged);
    return this.jobControls.stopAllJobs(mode, pause, at);
  }

  messageJob(jobId: string, text: string, pictures: readonly PictureReference[], at: string): JobChanged {
    return this.jobControls.messageJob(jobId, { text, pictures, sender: 'user' }, at);
  }

  /** Hephaestus's wording of User's setup move for the pipeline agent: delivered like User's message, never read as User's words. */
  messageJobAsHephaestus(jobId: string, text: string, at: string): JobChanged {
    return this.jobControls.messageJob(jobId, { text, pictures: [], sender: 'hephaestus' }, at);
  }

  startIntake(text: string, pictures: readonly PictureReference[], at: string): JobChanged {
    return this.jobControls.startIntake(text, pictures, at);
  }

  /**
   * The product owner's close submits every draft its intake chain filed: readied, or ready for review when ticket review is on. Work
   * outside an entity (E85) is refused before the job moves, so a corrected retry can still close.
   */
  closeIntake(
    jobId: string,
    proposedDraftSets: readonly (readonly string[])[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    at: string,
    workFilesOf?: WorkFilesOf,
  ): JobChanged {
    const drafts = this.draftsFiledByIntakeOf(jobId);
    if (workFilesOf !== undefined) this.refuseWorkOutsideTheEntity(drafts, readinessGapsOf, workFilesOf);
    const closed    = this.jobControls.closeIntake(jobId, proposedDraftSets, at);
    const draftIds  = this.draftsFiledByIntakeOf(jobId).map((ticket) => ticket.frontmatter.id);
    const submitted = draftIds.length === 0 ? [] : this.submitDraftTickets(draftIds, readinessGapsOf, at, workFilesOf).logged;
    return { job: closed.job, logged: [...closed.logged, ...submitted] };
  }

  /** The product owner's short title for its intake, kept on the job and logged `intake-titled`. */
  titleIntake(jobId: string, title: string, at: string): JobChanged {
    return this.jobControls.titleIntake(jobId, title, at);
  }

  /** An agent's notes for the options of a question it is about to ask, kept on its job until the question opens a decision. */
  noteQuestionOptions(jobId: string, notes: unknown): JobChanged {
    return this.jobControls.noteQuestionOptions(jobId, notes);
  }

  /**
   * A build job's need for another entity, kept for Hephaestus to file as that entity's ticket. `readinessGapsOf` reads the body as
   * `ticket ready` does.
   */
  declareNeed(jobId: string, declaration: NeedDeclaration, readinessGapsOf: (body: string) => readonly ReadinessGap[]): NeedDeclared {
    return this.needRules.declareNeed(jobId, declaration, readinessGapsOf);
  }

  /** The needs build jobs declared, in declaring order. */
  needs(): readonly Readonly<DeclaredNeed>[] {
    return this.needRules.needs();
  }

  /** The job's needs, taken off the board for Hephaestus to file. */
  takeNeedsOf(jobId: string): DeclaredNeed[] {
    return this.needRules.takeNeedsOf(jobId);
  }

  /** Removes and gives back the job's notes for the questions of one request, matched by each question's text. */
  takeQuestionOptionNotes(jobId: string, questionTexts: readonly string[]): QuestionOptionNotes[] {
    return this.jobRules.takeQuestionOptionNotes(jobId, (notes) => questionTexts.some((text) => OptionConsequencesUtil.notesAreForQuestion(notes, text)));
  }

  /** The drafts a product owner and every session it took over from filed, still drafts. */
  draftsFiledByIntakeOf(jobId: string): readonly Readonly<Ticket>[] {
    const job = this.jobRules.jobById(jobId);
    if (job === undefined) return [];
    const filingJobIds = this.jobControls.intakeChainOf(job);
    return this.tickets().filter(({ frontmatter }) => frontmatter.status === 'draft' && frontmatter.filedByJob !== undefined
      && filingJobIds.includes(frontmatter.filedByJob));
  }

  /** Hephaestus's end of a closed intake: the job ends `closed`. */
  endIntakeJob(jobId: string, at: string): Logged {
    return { logged: this.endJob(jobId, { outcome: 'closed' }, at).logged };
  }

  startPipelineAgent(at: string, entityKey?: EntityKey): JobChanged {
    return this.jobControls.startPipelineAgent(at, entityKey);
  }

  launchJob(launch: JobLaunch, at: string): JobChanged {
    return this.jobRules.launchJob(launch, at);
  }

  moveJob(jobId: string, targetState: SteppedJobState, at: string, options: JobMoveOptions = {}): JobChanged {
    return this.jobRules.moveJob(jobId, targetState, at, options);
  }

  interruptJob(jobId: string, cause: InterruptionCause, at: string): JobChanged {
    return this.jobRules.interruptJob(jobId, cause, at);
  }

  /** A ticket job ended `replaced` or `stopped` leaves its open questions on its ticket, held until User answers them. */
  endJob(jobId: string, ending: JobEnding, at: string): JobChanged {
    const ended = this.jobRules.endJob(jobId, ending, at);
    return { job: ended.job, logged: [...ended.logged, ...this.agentQuestions.rebindQuestionsOfEndedJob(ended.job, at)] };
  }

  setJobEventCursor(jobId: string, cursor: JobEventCursor): Readonly<Job> {
    return this.jobRules.setJobEventCursor(jobId, cursor);
  }

  addAnsweredRequestId(jobId: string, requestId: string): Readonly<Job> {
    return this.jobRules.addAnsweredRequestId(jobId, requestId);
  }

  setJobSlot(jobId: string, slot: Airlock | null): Readonly<Job> {
    return this.jobRules.setJobSlot(jobId, slot);
  }

  recordHephaestusStarted(versions: { codeVersion: string; installVersion: number }, at: string): Logged {
    return this.jobRules.recordHephaestusStarted(versions, at);
  }

  recordHephaestusStopped(reason: HephaestusStopReason, at: string): Logged {
    return this.jobRules.recordHephaestusStopped(reason, at);
  }

  recordStartClassified(start: LogRecordFieldsOf<'start-classified'>, at: string): Logged {
    return this.jobRules.recordStartClassified(start, at);
  }

  /**
   * User's resume of an interrupted job, or of one whose lost line waits, logged at its current child instance; refused `job-not-interrupted`
   * for any other. The move is the Playbook's next pass, under every hold a resume obeys, or the launch's, which runs the lost line again.
   */
  instructResume(jobId: string, at: string): Logged {
    return this.jobRules.recordJobResumeInstructed(jobId, at);
  }

  /**
   * User's resume of every interrupted job whose policy waits for one, a crash past its bound included, and of every job whose lost line
   * waits; none logged when none waits.
   */
  instructResumeOfEveryWaitingJob(limits: LifecycleThresholds, at: string): Logged {
    const waiting = this.jobs().filter((job) => (
      job.state === 'interrupted' ? Playbook.resumePolicyOf(job, limits) === 'waits-for-instruction' : this.lostLineAwaitsResume(job)
    ));
    return this.instructResumeOfEach(waiting, at);
  }

  /** A start found the job's install or gate line lost: the job keeps its state, and the line waits for User's resume. */
  recordLineLost(jobId: string, line: LostLineKind, cause: InterruptionCause, at: string): Logged {
    return this.jobRules.recordLineLost(jobId, line, cause, at);
  }

  lostLineAwaitsResume(job: Readonly<Job>): boolean {
    return Playbook.lostLineAwaitsResume(job, this.logRecordsSoFar());
  }

  /** User's resume of every job that ended on a network outage (decision 35); none logged when none did. */
  instructResumeOfEveryNetworkOutageJob(at: string): Logged {
    return this.instructResumeOfEach(this.interruptedJobs().filter((job) => job.interruption === 'network-outage'), at);
  }

  recordRestartFailed(failure: { successorCodeVersion: string; step: string; error: string }, at: string): Logged {
    return this.jobRules.recordRestartFailed(failure, at);
  }

  recordUsageLimitHit(jobId: string, limit: { window: string; resetsAt: string }, at: string): Logged {
    return this.jobRules.recordUsageLimitHit(jobId, limit, at);
  }

  recordHatchApplied(jobId: string, applied: LogRecordFieldsOf<'hatch-applied'>, at: string): Logged {
    return this.jobRules.recordHatchApplied(jobId, applied, at);
  }

  recordNeedDeclared(ticketId: string, need: LogRecordFieldsOf<'need-declared'>, at: string): Logged {
    return this.jobRules.recordNeedDeclared(ticketId, need, at);
  }

  hatchAppliedRecordOf(requestId: string): HatchAppliedRecord | null {
    return this.jobRules.hatchAppliedRecordOf(requestId);
  }

  setTicketMergeQueued(ticketId: string, queued: boolean, at: string): Readonly<Task> | null {
    return this.mergeQueueMarks.setTicketMergeQueued(ticketId, queued, at);
  }

  queueTicketForMerge(ticketId: string, target: string, headTree: string | null, at: string): Logged {
    return this.mergeQueueMarks.queueTicketForMerge(ticketId, target, headTree, at);
  }

  ticketIsMergeQueued(ticketId: string): boolean {
    return this.mergeQueueMarks.ticketIsMergeQueued(ticketId);
  }

  ticketStageOf(ticketId: string): TicketStage | null {
    return this.ticketStageRows.ticketStageOf(ticketId);
  }

  ticketSealsOf(ticketId: string): Readonly<Record<string, string>> {
    return this.ticketStageRows.ticketSealsOf(ticketId);
  }

  moveTicketStage(ticketId: string, stage: TicketStage, at: string): Logged {
    return this.ticketStageRows.moveTicketStage(ticketId, stage, at);
  }

  /** A crossing ticket's package change dropped or turned into a need: the package's seal is lifted, the ticket goes back to build (E19, E22). */
  moveTicketBackToBuild(ticketId: string, homeEntity: string, packageEntity: string, at: string): Logged {
    return this.ticketStageRows.moveTicketBackToBuild(ticketId, homeEntity, packageEntity, at);
  }

  /** The ticket no longer crosses into a package: its row's stage and seals go (E15). */
  clearTicketStage(ticketId: string): void {
    this.ticketStageRows.clearTicketStage(ticketId);
  }

  /**
   * A crossing ticket goes back into the package build of `packageEntity` (E41, E65) once. A second return opens `second-return` instead,
   * which holds the ticket at its stage until User answers (E45); one already open is not opened again.
   */
  returnTicketToThePackage(ticketId: string, packageEntity: string, decisionWordingOf: (draft: DecisionDraft) => DecisionWording, at: string): Logged {
    const packageBuild: TicketStage = { name: 'package-build', entity: packageEntity };
    if (!this.ticketStageRows.stageMoveIsASecondPackageReturn(ticketId, packageBuild)) return this.moveTicketStage(ticketId, packageBuild, at);
    const draft: DecisionDraft = {
      kind: 'second-return', ticketIds: [ticketId], jobId: null, subject: { packageEntity }
    };
    if (this.decisions().some((decision) => decision.kind === draft.kind && decision.ticketIds.includes(ticketId))) return { logged: [] };
    return {
      logged: this.openDecision({
        ...draft, askedBy: 'hephaestus', requestId: null, ...decisionWordingOf(draft), context: packageEntity
      }, at).logged
    };
  }

  /** Whether `returnTicketToThePackage` would open `second-return` rather than move the ticket into the package's build (E45). */
  returnToThePackageIsASecondReturn(ticketId: string, packageEntity: string): boolean {
    return this.ticketStageRows.stageMoveIsASecondPackageReturn(ticketId, { name: 'package-build', entity: packageEntity });
  }

  sealTicketPackage(ticketId: string, packageEntity: string, seal: string, at: string): Logged {
    return this.ticketStageRows.sealTicketPackage(ticketId, packageEntity, seal, at);
  }

  ticketPackageReturnsOf(ticketId: string): number {
    return this.ticketStageRows.ticketPackageReturnsOf(ticketId);
  }

  closeStageReviewBars(ticketId: string, at: string): Logged {
    return this.ticketStageRows.closeStageReviewBars(ticketId, at);
  }

  greenIsCurrent(ticketId: string, headTree: string | null, phase: GatePhase | null, entitiesItMustName: readonly EntityKey[] = []): boolean {
    return this.mergeQueueMarks.greenIsCurrent(ticketId, headTree, phase, entitiesItMustName);
  }

  greenPhaseOf(ticketId: string): GatePhase | null {
    return this.mergeQueueMarks.greenPhaseOf(ticketId);
  }

  /** The pipeline a ticket's own work reads (`PipelineUtil.ticketPipelineOf`); `null` with none stored. */
  ticketPipelineOf(ticketId: string): Readonly<Pipeline> | null {
    const { pipeline } = this.records;
    return pipeline === null ? null : PipelineUtil.ticketPipelineOf(pipeline, this.records.ticketRecordById(ticketId)?.frontmatter.entity);
  }

  /** Whether the ticket's build goes on to a review: its entity's review on a pipeline with entities, the pipeline's own on any other. */
  reviewIsSetFor(ticketId: string): boolean {
    return PipelineUtil.ticketReviewIsSet(this.records.pipeline, this.records.ticketRecordById(ticketId)?.frontmatter.entity);
  }

  setTicketMergeAccepted(ticketId: string, accepted: boolean, at: string): Logged & { changed?: false } {
    return this.mergeQueueMarks.setTicketMergeAccepted(ticketId, accepted, at);
  }

  ticketIsMergeAccepted(ticketId: string): boolean {
    return this.mergeQueueMarks.ticketIsMergeAccepted(ticketId);
  }

  recordMergeUpdated(ticketId: string, target: string, outcome: 'merged' | 'conflicted', at: string): Logged {
    return this.mergeQueueMarks.recordMergeUpdated(ticketId, target, outcome, at);
  }

  mergeApprovalIsOn(): boolean {
    return this.records.mergeApprovalIsOn();
  }

  /** The live job working on the ticket, which a delivery by hand is refused for. */
  liveJobOfTicket(ticketId: string): Readonly<Job> | undefined {
    return this.moveOffers.liveJobOfTicket(ticketId);
  }

  mergeUpdateIsOpenTo(ticketId: string): boolean {
    return this.moveOffers.mergeUpdateIsOpenTo(ticketId);
  }

  /** User's moves the ticket accepts now; `mergeWait` is git's prediction while it waits for merge, as the merge queue read it. */
  ticketOffersOf(ticketId: string, mergeWait: MergeForecast | null): TicketOffers {
    return this.moveOffers.ticketOffersOf(ticketId, mergeWait);
  }

  jobOffersOf(jobId: string): JobOffers {
    return this.moveOffers.jobOffersOf(jobId);
  }

  airlockHolderOf(target: string): Readonly<Job> | undefined {
    return this.airlockClaims.slotHolderOf(target);
  }

  mergeCandidatesOf(target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf): MergeCandidate[] {
    return this.airlockClaims.mergeCandidatesOf(target, targetOf, branchTreeOf);
  }

  ticketsWaitingForMergeOf(target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf): MergeCandidate[] {
    return this.airlockClaims.ticketsWaitingForMergeOf(target, targetOf, branchTreeOf);
  }

  ticketsAwaitingGreenOf(target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf): TicketAwaitingGreen[] {
    return this.airlockClaims.ticketsAwaitingGreenOf(target, targetOf, branchTreeOf);
  }

  claimAirlock(claim: AirlockClaim, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf, at: string): JobChanged {
    return this.airlockClaims.claimAirlock(claim, targetOf, branchTreeOf, at);
  }

  claimRefreshSlot(claim: RefreshSlotClaim, at: string): JobChanged {
    return this.airlockClaims.claimRefreshSlot(claim, at);
  }

  /**
   * Launches the constitution commit job of the record's waiting Apply request, holding the main line's slot, and the request is
   * committing under it. Refuses `no-setup-open` or `no-apply-pending` without a waiting request, and `airlock-held` while a job holds the slot.
   */
  claimConstitutionCommitSlot(claim: ConstitutionCommitSlotClaim, at: string): JobChanged {
    this.pipelineSetups.requirePendingApply(claim.setupId);
    const claimed = this.airlockClaims.claimConstitutionCommitSlot(claim, at);
    this.pipelineSetups.attachApplyCommitJob(claim.setupId, claimed.job.id);
    return claimed;
  }

  /** Ends a constitution commit job; a request it was committing waits for the next job, unless the same hold holds or refuses it. */
  endConstitutionCommitJob(jobId: string, ending: JobEnding, at: string): JobChanged {
    const ended = this.endJob(jobId, ending, at);
    this.pipelineSetups.detachApplyCommitJob(jobId);
    return ended;
  }

  /** The group's release ticket id while it is queued to merge or holds the main line's slot. */
  groupReleaseQueuedOrSlotted(group: string): string | null {
    return this.airlockClaims.releaseIsQueuedOrSlotted(group);
  }

  /** The tickets the group's release delivers, walked through `dependsOn` from its open release ticket. */
  releaseBundleTicketIdsOf(group: string): string[] {
    return this.airlockClaims.releaseBundleOf(group).map((ticket) => ticket.frontmatter.id);
  }

  recordMergeLanded(jobId: string, landing: MergeLanding, at: string): Logged {
    return this.airlockClaims.recordMergeLanded(jobId, landing, at);
  }

  recordedLandingsOn(target: string): string[] {
    return this.airlockClaims.recordedLandingsOn(target);
  }

  /** The unsettled jobs, in launch order. */
  jobs(): readonly Readonly<Job>[] {
    return this.jobRules.jobs();
  }

  jobById(jobId: string): Readonly<Job> | undefined {
    return this.jobRules.jobById(jobId);
  }

  /** A job's kind and how it ended, read from the log; `undefined` while it is on the board, or for a job never launched. */
  endedJobOutcomeOf(jobId: string): { kind: Job['kind']; outcome: JobOutcome } | undefined {
    return this.jobRules.endedJobOutcomeOf(jobId);
  }

  openDecision(opening: DecisionOpening, at: string): DecisionOpened {
    return this.decisionRules.openDecision(opening, at);
  }

  /** The first answer wins; the answered request joins its live job's `answeredRequestIds`, so a replay of it opens nothing. */
  answerDecision(decisionId: string, answers: readonly string[], at: string): DecisionAnswered {
    const answered                    = this.decisionRules.answerDecision(decisionId, answers, at);
    const { jobId, requestId }        = answered.decision;
    if (jobId !== null && requestId !== null && this.jobRules.jobById(jobId) !== undefined) this.jobRules.addAnsweredRequestId(jobId, requestId);
    return { ...answered, logged: [...answered.logged, ...this.agentQuestions.afterAnswer(answered.decision, answered.answer, at)] };
  }

  /** `decide`'s forms: option letters per question, multi-select letters joined, or one free text for a one-question decision. */
  answerDecisionInForm(decisionId: string, form: DecisionAnswerForm, at: string): DecisionAnswered {
    return this.answerDecision(decisionId, this.agentQuestions.answersOf(decisionId, form), at);
  }

  /** Puts a question incident's own questions to User as an `agent-question`, with no word of the Assistant's. */
  escalateQuestionIncident(incidentId: string, at: string): IncidentEscalated {
    const incident   = this.incidentRules.incidentById(incidentId);
    const escalation = incident === undefined ? null : this.agentQuestions.escalationOf(incident);
    if (incident === undefined) throw new BoardRefusal({ reason: 'unknown-incident', incidentId });
    if (escalation === null) throw new BoardRefusal({ reason: 'decision-without-questions' });
    return this.incidentRules.escalateIncident(incidentId, escalation, at);
  }

  /** Hephaestus's first start puts the v16 low `committed` tickets in `ready-for-review`, whatever the ticket review switch says. */
  submitFirstRunLeftovers(at: string): Logged {
    return this.findings.submitFirstRunLeftovers(at);
  }

  withdrawDecision(decisionId: string, reason: string, at: string): DecisionClosed {
    return this.decisionRules.withdrawDecision(decisionId, reason, at);
  }

  /** The open decisions for the user, in opening order. */
  decisions(): readonly Readonly<Decision>[] {
    return this.decisionRules.decisions();
  }

  decisionById(decisionId: string): Readonly<Decision> | undefined {
    return this.decisionRules.decisionById(decisionId);
  }

  openIncident(opening: IncidentOpening, at: string): IncidentOpened {
    return this.incidentRules.openIncident(opening, at);
  }

  markIncidentDelivered(incidentId: string, turn: IncidentDeliveryTurn): Readonly<Incident> {
    return this.incidentRules.markIncidentDelivered(incidentId, turn);
  }

  withdrawIncidentDelivery(incidentId: string): Readonly<Incident> {
    return this.incidentRules.withdrawIncidentDelivery(incidentId);
  }

  handleIncident(incidentId: string, move: IncidentMove, at: string): IncidentClosed {
    return this.incidentRules.handleIncident(incidentId, move, at);
  }

  defaultIncident(incidentId: string, cause: IncidentDefaultCause, at: string): IncidentClosed {
    return this.incidentRules.defaultIncident(incidentId, cause, at);
  }

  escalateIncident(incidentId: string, escalation: IncidentEscalation, at: string): IncidentEscalated {
    return this.incidentRules.escalateIncident(incidentId, escalation, at);
  }

  /** The open incidents for the Assistant, in opening order. */
  incidents(): readonly Readonly<Incident>[] {
    return this.incidentRules.incidents();
  }

  /**
   * Applies every step the Playbook derives from this board, in order, each record stamped `limits.now`. A decision the policy
   * opens is worded by `decisionWordingOf`, since the policy holds no words.
   */
  followPlaybook(limits: LifecycleLimits, observations: PlaybookObservations, decisionWordingOf: (draft: DecisionDraft) => DecisionWording): LifecycleAdvanced {
    const steps = Playbook.nextStepsOf(this.playbookFactsOf(observations), limits);
    const logged = steps.flatMap((step) => this.applyPlaybookStep(step, decisionWordingOf, limits.now));
    return { steps, logged };
  }

  private refuseAnUnportableGroup(group: string | undefined): void {
    if (group === undefined) return;
    if (!GroupNameUtil.groupNameIsWellFormed(group)) throw new BoardRefusal({ reason: 'malformed-group-name', group });
    const existingGroups = this.records.ticketRecords.flatMap(({ frontmatter }) => frontmatter.group ?? []);
    const existingGroup  = GroupNameUtil.caseFoldedTwinOf(group, existingGroups);
    if (existingGroup !== null) throw new BoardRefusal({ reason: 'group-name-case-twin', group, existingGroup });
  }

  private playbookFactsOf(observations: PlaybookObservations): PlaybookFacts {
    return {
      tickets:                     this.records.ticketRecords.map((ticket) => this.playbookTicketOf(ticket)),
      jobs:                        this.jobs(),
      decisions:                   this.decisions(),
      incidents:                   this.incidents(),
      logRecords:                  [...this.records.storedLogRecords, ...this.records.loggedRecords],
      readinessPositionByTicketId: this.dispatchQueries.readinessPositionByTicketId(),
      concurrencyLimit:            this.concurrency().limit,
      hephaestusState:             this.hephaestusState(),
      pipelineIsSet:               this.records.pipeline !== null,
      assistantIsOn:               this.assistantIsOn(),
      reviewIsSet:                 this.records.pipeline?.review !== undefined,
      pipelineHasEntities:         this.records.pipeline?.entities !== undefined,
      entitiesWithReview:          Object.entries(this.records.pipeline?.entities ?? {})
        .filter(([, entity]) => entity.review !== undefined)
        .map(([entityKey]) => entityKey),
      concurrencyByEntity: Object.fromEntries(Object.entries(this.records.pipeline?.entities ?? {})
        .flatMap(([entityKey, entity]): [string, number][] => (entity.concurrency === undefined ? [] : [[entityKey, entity.concurrency]]))),
      observations,
    };
  }

  /** The ticket as the Playbook reads it: its frontmatter, whether it is queued to land, and the stage its row stores once it crosses. */
  private playbookTicketOf(ticket: Readonly<Ticket>): PlaybookTicket {
    const stage = this.records.linkedTaskRecordOf(ticket)?.stage;
    return { ...ticket.frontmatter, mergeQueued: this.ticketIsMergeQueued(ticket.frontmatter.id), ...(stage === undefined ? {} : { stage: { ...stage } }) };
  }

  private interruptedJobs(): readonly Readonly<Job>[] {
    return this.jobs().filter((job) => job.state === 'interrupted');
  }

  private instructResumeOfEach(jobs: readonly Readonly<Job>[], at: string): Logged {
    return { logged: jobs.flatMap((job) => this.instructResume(job.id, at).logged) };
  }

  private applyPlaybookStep(step: PlaybookStep, decisionWordingOf: (draft: DecisionDraft) => DecisionWording, at: string): readonly LogRecord[] {
    const openDecision = (draft: DecisionDraft): readonly LogRecord[] => this.openDecision({
      ...draft, askedBy: 'hephaestus', requestId: null, ...decisionWordingOf(draft)
    }, at).logged;
    switch (step.kind) {
      case 'launch-build':
        return this.launchJob({
          kind: 'build', role: 'builder', ticketIds: [step.ticketId], parentJobId: null, attempt: step.attempt, target: step.base, ...launchStageOf(step)
        }, at).logged;
      case 'launch-review':
        return this.launchJob({
          kind:        'review',
          role:        step.round > 1 ? 're-reviewer' : 'reviewer',
          ticketIds:   [step.ticketId],
          parentJobId: null,
          attempt:     step.round,
          target:      step.target,
          ...launchStageOf(step),
        }, at).logged;
      case 'boot-assistant':
        return this.launchJob({
          kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
        }, at).logged;
      case 'withdraw-retired-decision':
        return this.withdrawDecision(step.decisionId, RETIRED_DECISION_REASON, at).logged;
      case 'resume-job':
        return this.moveJob(step.jobId, 'running', at, { instructed: step.instructed }).logged;
      case 'replace-job':
        return this.endJob(step.jobId, { outcome: 'replaced' }, at).logged;
      case 'await-answer':
        return this.moveJob(step.jobId, 'awaiting-answer', at).logged;
      case 'refresh-intake':
        return this.jobControls.refreshIntake(step.jobId, at).logged;
      case 'park':
        return [
          ...step.jobId === undefined ? [] : this.endJob(step.jobId, { outcome: 'failed', cause: step.cause }, at).logged,
          ...this.holdTicket(step.ticketId, `${PARKED_HOLD_PREFIX}${step.cause}`, at).logged,
          ...openDecision({ kind: 'parked', ticketIds: [step.ticketId], jobId: null }),
        ];
      case 'release-abandoned-need':
        return [
          ...this.ticketDependencies.removeTicketDependencies(step.ticketId, [step.needTicketId], at).logged,
          ...openDecision({ kind: 'need-abandoned', ticketIds: [step.ticketId], jobId: null }),
        ];
      case 'open-decision':
        return openDecision(step.decision);
      case 'open-incident':
        return this.openIncident(step.incident, at).logged;
      case 'default-incident':
        return this.incidentMoves.defaultIncident(step.incidentId, step.cause, decisionWordingOf, at);
      case 'pause-hephaestus':
        return this.setHephaestusState('paused', at).logged;
      case 'await-machine-slot':
        return [];
      // Hephaestus acts on it in the same hold: the stored proposals and the worktree's tree are outside the board.
      case 'act-on-waiver-answer':
        return [];
    }
  }

  incidentById(incidentId: string): Readonly<Incident> | undefined {
    return this.incidentRules.incidentById(incidentId);
  }

  setChartRange(view: ViewRange, at: string): Logged {
    return this.trackerChanges.setChartRange(view, at);
  }

  setConcurrencyLimit(limit: number, at: string): ConcurrencyLimitSet {
    return this.trackerChanges.setConcurrencyLimit(limit, at);
  }

  setHephaestusState(state: HephaestusState, at: string): HephaestusStateSet {
    return this.trackerChanges.setHephaestusState(state, at);
  }

  setBranchNamespace(branchNamespace: string, at: string): Logged {
    return this.trackerChanges.setBranchNamespace(branchNamespace, at);
  }

  setPrepareStep(step: PipelineStep, at: string): PipelineChanged {
    return this.trackerChanges.setPrepareStep(step, at);
  }

  setReach(paths: readonly string[], at: string): PipelineChanged {
    return this.trackerChanges.setReach(paths, at);
  }

  addGate(gate: PipelineGate, at: string, phases: readonly GatePhase[] | null = null): PipelineChanged {
    return this.trackerChanges.addGate(gate, at, phases);
  }

  orderPhaseGates(phase: GatePhase, names: readonly string[], at: string): PipelineChanged {
    return this.trackerChanges.orderPhaseGates(phase, names, at);
  }

  setNoGates(at: string): PipelineChanged {
    return this.trackerChanges.setNoGates(at);
  }

  removeGate(name: string, at: string): PipelineChanged {
    return this.trackerChanges.removeGate(name, at);
  }

  setApproval(approval: PipelineApproval, on: boolean, at: string): PipelineChanged {
    return this.trackerChanges.setApproval(approval, on, at);
  }

  /** The board's switch for the Assistant: a pass boots one only while it is on. */
  setAssistant(on: boolean, at: string): PipelineChanged {
    return this.trackerChanges.setAssistant(on, at);
  }

  assistantIsOn(): boolean {
    return this.records.pipeline?.assistant === true;
  }

  recordPipelineJudgedBy(ticketId: string, greenTree: string | null, stamp: GateRunStamp | null, at: string): void {
    this.trackerChanges.recordPipelineJudgedBy(ticketId, greenTree, stamp, at);
  }

  recordWorktreeRepaired(ticketId: string, fields: LogRecordFieldsOf<'worktree-repaired'>, at: string): Logged {
    return this.trackerChanges.recordWorktreeRepaired(ticketId, fields, at);
  }

  recordGateRan(fields: LogRecordFieldsOf<'gate-ran'>, at: string): Logged {
    return this.trackerChanges.recordGateRan(fields, at);
  }

  recordPipelineStepsRan(stepRuns: readonly PipelineStepRun[], phase: GatePhase | null, at: string): Logged {
    return this.trackerChanges.recordPipelineStepsRan(stepRuns, phase, at);
  }

  recordNote(text: string, at: string): Logged {
    return this.trackerChanges.recordNote(text, at);
  }

  addTask(addition: TaskAddition, at: string): Readonly<Task> {
    return this.taskRows.addTask(addition, at);
  }

  moveTask(taskId: number, status: TaskStatus, request: { movesAnyway: boolean }, at: string): Readonly<Task> {
    return this.taskRows.moveTask(taskId, status, request, at);
  }

  correctTask(taskId: number, correction: TaskCorrection, request: { movesAnyway: boolean }): Readonly<Task> {
    return this.taskRows.correctTask(taskId, correction, request);
  }

  annotateTask(taskId: number, annotation: TaskAnnotation): Readonly<Task> {
    return this.taskRows.annotateTask(taskId, annotation);
  }

  removeTask(taskId: number): Readonly<Task> {
    return this.taskRows.removeTask(taskId);
  }

  recordAgentStop(usage: AgentUsage, credits: readonly TokenCredit[], at: string): AgentStopRecorded {
    return this.tokenCredits.recordAgentStop(usage, credits, at);
  }

  fileTicket(ticket: Ticket, at: string): TicketChanged {
    this.refuseAnUnportableGroup(ticket.frontmatter.group);
    this.epicRules.refuseUnknownEpicKeys(ticket.frontmatter.epics ?? []);
    this.ticketLinks.refuseUnworkableLinksOfAFiledTicket(ticket.frontmatter);
    return this.ticketMoves.fileTicket(ticket, at);
  }

  /**
   * Puts a ticket that has no group into one, a started ticket too: refused as a filing's group is, and for a delivered or abandoned ticket.
   * Its next landing goes to the group's branch.
   */
  setTicketGroup(ticketId: string, group: string, at: string): TicketChanged {
    const ticket = this.records.requireTicket(ticketId);
    const { status, group: currentGroup } = ticket.frontmatter;
    if (SETTLED_TICKET_STATUSES.includes(status)) throw new BoardRefusal({ reason: 'group-of-a-settled-ticket', ticketId, status });
    if (currentGroup !== undefined) throw new BoardRefusal({ reason: 'ticket-already-in-a-group', ticketId, group: currentGroup });
    this.refuseAnUnportableGroup(group);
    ticket.frontmatter.group = group;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-grouped', ticketId, fields: { group } }, at)], ticket };
  }

  /** E26: a ticket of each dependent that the crossing ticket's package change breaks was filed in the crossing ticket's group. */
  recordDependentFixFiled(ticketId: string, fix: LogRecordFieldsOf<'dependent-fix-filed'>, at: string): Logged {
    this.records.requireTicket(ticketId);
    return { logged: [this.records.logger.log({ kind: 'dependent-fix-filed', ticketId, fields: { entity: fix.entity, fixTicketIds: [...fix.fixTicketIds] } }, at)] };
  }

  /** A `null` cause clears the link. */
  setTicketIntroducedBy(ticketId: string, causeTicketId: string | null, at: string): TicketChanged {
    return this.ticketLinks.setIntroducedBy(ticketId, causeTicketId, at);
  }

  addEpic(addition: EpicAddition, at: string): EpicChanged {
    return this.epicRules.addEpic(addition, at);
  }

  editEpic(epicKey: string, edit: EpicEdit, at: string): EpicEdited {
    return this.epicRules.editEpic(epicKey, edit, at);
  }

  removeEpic(epicKey: string, at: string): EpicChanged {
    return this.epicRules.removeEpic(epicKey, at);
  }

  setTicketEpics(ticketId: string, epicKeys: readonly string[], at: string): TicketEpicsChanged {
    return this.epicRules.setTicketEpics(ticketId, epicKeys, at);
  }

  addTicketEpics(ticketId: string, addedEpicKeys: readonly string[], at: string): TicketEpicsChanged {
    return this.epicRules.addTicketEpics(ticketId, addedEpicKeys, at);
  }

  removeTicketEpics(ticketId: string, removedEpicKeys: readonly string[], at: string): TicketEpicsChanged {
    return this.epicRules.removeTicketEpics(ticketId, removedEpicKeys, at);
  }

  openDraft(opening: DraftOpening, at: string): DraftChanged {
    return this.draftRules.openDraft(opening, at);
  }

  claimDraft(draftId: string, request: { owner: string; forces: boolean }, at: string): DraftClaimChanged {
    return this.draftRules.claimDraft(draftId, request, at);
  }

  releaseDraft(draftId: string, at: string): DraftClaimChanged {
    return this.draftRules.releaseDraft(draftId, at);
  }

  closeDraft(draftId: string, ticketReferences: readonly string[], at: string): DraftChanged {
    return this.draftRules.closeDraft(draftId, ticketReferences, at);
  }

  abandonDraft(draftId: string, reason: string, at: string): DraftChanged {
    return this.draftRules.abandonDraft(draftId, reason, at);
  }

  addDraftNote(draftId: string, addition: DraftNoteAddition, at: string): DraftChanged {
    return this.draftContents.addDraftNote(draftId, addition, at);
  }

  askDraftQuestion(draftId: string, asking: DraftQuestionAsking, at: string): DraftChanged {
    return this.draftContents.askDraftQuestion(draftId, asking, at);
  }

  answerDraftQuestion(draftId: string, questionId: string, answerText: string, at: string): DraftChanged {
    return this.draftContents.answerDraftQuestion(draftId, questionId, answerText, at);
  }

  dropDraftItem(draftId: string, itemId: string, at: string): DraftChanged {
    return this.draftContents.dropDraftItem(draftId, itemId, at);
  }

  /** Refuses `setup-in-progress` beside an open record, and `no-pipeline-to-update` for an update or advise with no stored pipeline. */
  openSetup(opening: PipelineSetupOpening, at: string): PipelineSetupChanged {
    return this.pipelineSetups.openSetup(opening, at);
  }

  setSetupBilling(setupId: string, billing: PipelineBilling, at: string): PipelineSetupChanged {
    return this.pipelineSetups.setSetupBilling(setupId, billing, at);
  }

  continueSetupStep(setupId: string, step: PipelineSetupStep, at: string): PipelineSetupChanged {
    return this.pipelineSetups.continueSetupStep(setupId, step, at);
  }

  suggestSetupStepReady(setupId: string, step: SetupQuestionStep, at: string): PipelineSetupChanged {
    return this.pipelineSetups.suggestSetupStepReady(setupId, step, at);
  }

  reopenSetupStep(setupId: string, step: PipelineSetupStep, at: string): PipelineSetupChanged {
    return this.pipelineSetups.reopenSetupStep(setupId, step, at);
  }

  resumeSetup(setupId: string, snapshotCommit: string, changedPaths: readonly string[], at: string): PipelineSetupChanged {
    return this.pipelineSetups.resumeSetup(setupId, snapshotCommit, changedPaths, at);
  }

  attachSetupAgent(setupId: string, agentJobId: string, snapshotCommit: string | null, entityKey?: EntityKey): PipelineSetupChanged {
    return this.pipelineSetups.attachSetupAgent(setupId, agentJobId, snapshotCommit, entityKey);
  }

  openSetupAtEntity(setupId: string, entityKey: EntityKey): PipelineSetupChanged {
    return this.pipelineSetups.openAtEntity(setupId, entityKey);
  }

  recordSetupSnapshotTouched(setupId: string, refusal: SnapshotRefusal, at: string): PipelineSetupChanged {
    return this.pipelineSetups.recordSetupSnapshotTouched(setupId, refusal, at);
  }

  setupSnapshotIsTouched(setupId: string): boolean {
    return this.pipelineSetups.setupSnapshotIsTouched(setupId);
  }

  recordFinding(setupId: string, recording: ResearchFindingRecording, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    return this.pipelineSetups.recordFinding(setupId, recording, at, entityKey);
  }

  /** A first setup walks the `entities` step once the forge's research found several stand-alone codebases; else nothing changes. */
  walkEntitiesStepAfterLayout(setupId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.walkEntitiesStepAfterLayout(setupId, at);
  }

  askSetupQuestion(setupId: string, asking: SetupQuestionAsking, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    return this.pipelineSetups.askSetupQuestion(setupId, asking, at, entityKey);
  }

  answerSetupQuestion(setupId: string, questionId: string, reply: SetupQuestionReply, at: string): PipelineSetupChanged {
    return this.pipelineSetups.answerSetupQuestion(setupId, questionId, reply, at);
  }

  setConstitution(setupId: string, setting: ConstitutionSetting, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    return this.pipelineSetups.setConstitution(setupId, setting, at, entityKey);
  }

  editConstitution(setupId: string, edit: ConstitutionEdit, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    return this.pipelineSetups.editConstitution(setupId, edit, at, entityKey);
  }

  /** The draft the edits would leave, with nothing stored; refused as `editDraft` refuses them. */
  draftAfterEdits(setupId: string, request: DraftEditRequest): Pipeline {
    return this.pipelineSetups.draftAfterEdits(setupId, request);
  }

  editDraft(setupId: string, request: DraftEditRequest, at: string): PipelineSetupChanged {
    return this.pipelineSetups.editDraft(setupId, request, at);
  }

  /** The draft the Undo would leave, with nothing stored; refused as `undoDraftEdit` refuses it. */
  draftAfterUndo(setupId: string, editId: string): Pipeline {
    return this.pipelineSetups.draftAfterUndo(setupId, editId);
  }

  undoDraftEdit(setupId: string, editId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.undoDraftEdit(setupId, editId, at);
  }

  /** The draft the set's Undo would leave, with nothing stored; refused as `undoDraftBatch` refuses it. */
  draftAfterBatchUndo(setupId: string, editId: string): Pipeline {
    return this.pipelineSetups.draftAfterBatchUndo(setupId, editId);
  }

  undoDraftBatch(setupId: string, editId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.undoDraftBatch(setupId, editId, at);
  }

  discardDraft(setupId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.discardDraft(setupId, at);
  }

  startOverSetup(setupId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.startOverSetup(setupId, at);
  }

  /** Refuses `no-gate-to-check` and `pipeline-check-running`; Hephaestus runs the check, one per entity the draft touched. */
  requestPipelineCheck(setupId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.requestCheck(setupId, at);
  }

  /** The record's queued checks: the forge's own as `null`, else each entity's key. */
  queuedPipelineCheckLevels(): (EntityKey | null)[] {
    return this.pipelineSetups.queuedCheckLevels();
  }

  startPipelineCheck(setupId: string, entityKey?: EntityKey): PipelineCheckStart | null {
    return this.pipelineSetups.startCheck(setupId, entityKey);
  }

  endPipelineCheck(setupId: string, ending: PipelineCheckEnding, entityKey?: EntityKey): PipelineSetupChanged | null {
    return this.pipelineSetups.endCheck(setupId, ending, entityKey);
  }

  stopRunningPipelineCheck(): PipelineSetupChanged | null {
    return this.pipelineSetups.stopRunningCheck();
  }

  /** Refuses `gate-profile-running` while the gate and phase have a run queued or running. */
  queueGateProfile(request: GateProfileRequest, at: string): GateProfileChanged {
    return this.gateProfiles.queueGateProfile(request, at);
  }

  markGateProfileRunning(profileRunId: string): GateProfileChanged & { changed?: false } {
    return this.gateProfiles.markGateProfileRunning(profileRunId);
  }

  endGateProfile(profileRunId: string, end: GateProfileRunEnd, at: string): GateProfileChanged & { changed?: false } {
    return this.gateProfiles.endGateProfile(profileRunId, end, at);
  }

  /** Refuses `unknown-profile-run`. */
  stopGateProfile(profileRunId: string, at: string): GateProfileChanged & { changed?: false } {
    return this.gateProfiles.stopGateProfile(profileRunId, at);
  }

  stopGateProfilesLeftRunning(at: string): GateProfileChanged[] {
    return this.gateProfiles.stopRunsLeftRunning(at);
  }

  gateProfileRuns(): readonly Readonly<GateProfileRun>[] {
    return this.gateProfiles.runs();
  }

  /** What the hold writes for the profile runs: the runs, or `unchanged`. */
  gateProfilesWrite(): { write: 'profiles'; profiles: StoredGateProfiles } | { write: 'unchanged' } {
    const reading = this.records.gateProfilesReading;
    return this.records.gateProfilesChanged && reading.verdict === 'readable' ? { write: 'profiles', profiles: reading.profiles } : { write: 'unchanged' };
  }

  /** The refusal `requestApply` would give the open record's current draft now against main's texts as read; `null` when it would proceed. */
  applyRefusalOf(setupId: string, reading: ApplyMainReading): BoardRefusalDetail | null {
    return this.pipelineSetups.applyRefusalOf(setupId, reading);
  }

  /** Stage 1 of an Apply: it refuses, waits for the constitution commit, or runs stage 2 at once when main already holds the text. */
  requestApply(setupId: string, requesting: ApplyRequesting, at: string): PipelineApplyChanged {
    return this.withTheAppliedSetupAgentStopped(this.pipelineSetups.requestApply(setupId, requesting, at), requesting, at);
  }

  /**
   * Stage 2 of an Apply: the pipeline, the constitution's sources, the board's settings and the log, and last the record's close. The
   * record's pipeline agent is stopped in the same hold.
   */
  finishApply(setupId: string, finishing: ApplyFinishing, at: string): PipelineApplyChanged {
    return this.withTheAppliedSetupAgentStopped(this.pipelineSetups.finishApply(setupId, finishing, at), finishing, at);
  }

  /** At Hephaestus's start: an open record whose draft is already the stored pipeline finishes its Apply; `null` when there is none. */
  finishHalfAppliedSetup(reading: ApplyMainReading, at: string): PipelineApplyChanged | null {
    const finished = this.pipelineSetups.finishHalfAppliedSetup(reading, at);
    return finished === null ? null : this.withTheAppliedSetupAgentStopped(finished, reading, at);
  }

  /**
   * An applied record leaves its pipeline agents nothing to serve: each live one, the forge's and every entity's, is stopped, as a start
   * over stops them, and Hephaestus removes the snapshot once no pipeline agent is left. Stage 1 that only waits for the commit stops
   * nothing. The first Apply over entities starts the product owner that gives the committed tickets without an entity one, in the same hold.
   */
  private withTheAppliedSetupAgentStopped(changed: PipelineApplyChanged, reading: ApplyMainReading, at: string): PipelineApplyChanged {
    const setup = changed.outcome === 'applied' ? changed.setup : null;
    if (setup === null) return changed;
    const agentJobIds = [setup.agentJobId, ...Object.values(setup.entities ?? {}).map((entityPart) => entityPart.agentJobId)];
    const stopped = agentJobIds.flatMap((agentJobId) => {
      const agent = agentJobId === null ? undefined : this.jobById(agentJobId);
      return agent === undefined || agent.state === 'stopping' ? [] : this.requestJobStop(agent.id, 'stop', at).logged;
    });
    const ticketIds = changed.ticketsAwaitingEntity ?? [];
    const requestOf = reading.entityAssignmentRequestOf;
    const assignment = ticketIds.length === 0 || requestOf === undefined ? [] : this.jobControls.startEntityAssignment(requestOf(ticketIds), ticketIds, at).logged;
    const added = [...stopped, ...assignment];
    return added.length === 0 ? changed : { ...changed, logged: [...changed.logged, ...added] };
  }

  holdApply(setupId: string, holding: ApplyHolding, at: string): PipelineSetupChanged {
    return this.pipelineSetups.holdApply(setupId, holding, at);
  }

  refuseApply(setupId: string, refusal: ApplyRefusal, at: string): PipelineSetupChanged {
    return this.pipelineSetups.refuseApply(setupId, refusal, at);
  }

  /** Whether stage 2 would refuse `pipeline-moved`: the stored pipeline is neither the record's base nor its draft as applied. */
  storedPipelineMovedSince(setupId: string, reading: ApplyMainReading): boolean {
    return this.pipelineSetups.storedPipelineMovedSince(setupId, reading);
  }

  /** The E91 or E94 refusal stage 2 would give: a ticket started, or took an entity the draft removes, while the request waited. */
  entityChangeRefusalOf(setupId: string): EntityChangeRefusalReason | null {
    return this.pipelineSetups.entityChangeRefusalOf(setupId);
  }

  /** Clears the record's Apply request, which leaves it editable at the design step; refused `no-apply-pending` with none. */
  cancelApply(setupId: string, at: string): PipelineSetupChanged {
    return this.pipelineSetups.cancelApply(setupId, at);
  }

  /** The stored sources of the constitution main holds; `null` when none are stored or the file could not be read. */
  storedConstitutionSources(): Readonly<StoredConstitutionSources> | null {
    const reading = this.records.constitutionSourcesReading;
    return reading.verdict === 'readable' ? reading.sources : null;
  }

  /** What the hold writes to `constitution-sources.json`: the sources an Apply stored, or nothing. */
  constitutionSourcesWrite(): { write: 'sources'; sources: StoredConstitutionSources } | { write: 'unchanged' } {
    const reading = this.records.constitutionSourcesReading;
    if (!this.records.constitutionSourcesChanged || reading.verdict !== 'readable') return { write: 'unchanged' };
    return { write: 'sources', sources: reading.sources };
  }

  /** Abandoning a ticket hands its unstarted findings to User's review in the same hold. */
  moveTicket(ticketId: string, targetStatus: TicketStatus, request: TicketMoveRequest, at: string): TicketMoved {
    const moved = this.ticketMoves.moveTicket(ticketId, targetStatus, request, at);
    if (targetStatus !== 'abandoned') return moved;
    return { ...moved, logged: [...moved.logged, ...this.findings.releaseFindingsOfAbandoned(ticketId, at)] };
  }

  rereviewTicket(ticketId: string, at: string): TicketChanged {
    return this.ticketMoves.rereviewTicket(ticketId, at);
  }

  /** Refused while the board holds any job of the ticket: a build job launches while its ticket is still committed. */
  unreadyTicket(ticketId: string, at: string): TicketChanged {
    return this.ticketMoves.unreadyTicket(ticketId, this.jobs(), at);
  }

  /** The caller reads each body for its gaps, since what a complete ticket holds is its document's format, not a Board rule. */
  readyDraftTickets(
    ticketIds: readonly string[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    at: string,
    readiableStatuses?: readonly TicketStatus[],
    workFilesOf?: WorkFilesOf,
  ): TicketsReadied {
    return this.ticketMoves.readyDraftTickets(ticketIds, readinessGapsOf, at, readiableStatuses, workFilesOf);
  }

  /** The filer's close of its drafts, judged by the board's ticket review switch; `workFilesOf` refuses work outside an entity (E85). */
  submitDraftTickets(
    ticketIds: readonly string[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    at: string,
    workFilesOf?: WorkFilesOf,
  ): DraftsSubmitted {
    return this.ticketMoves.submitDraftTickets(ticketIds, this.ticketReviewIsOn(), readinessGapsOf, at, workFilesOf);
  }

  /** Refuses E85 for the complete tickets a submit would move, judged before anything moves; a ticket not yet filed may be judged. */
  refuseWorkOutsideTheEntity(
    tickets: readonly Readonly<Ticket>[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    workFilesOf: WorkFilesOf,
  ): void {
    this.ticketMoves.refuseWorkOutsideTheEntityOfCompleteTickets(tickets, readinessGapsOf, workFilesOf);
  }

  /** Refuses `ticket-without-entity` for the complete tickets a submit with ticket review off would make `committed`, judged before anything moves. */
  refuseASubmitWithoutAnEntity(tickets: readonly Readonly<Ticket>[], readinessGapsOf: (body: string) => readonly ReadinessGap[]): void {
    this.ticketMoves.refuseASubmitWithoutAnEntity(tickets, this.ticketReviewIsOn(), readinessGapsOf);
  }

  /** Without an `approvals.tickets` key, ticket review is on. */
  ticketReviewIsOn(): boolean {
    return this.records.pipeline?.approvals?.tickets !== false;
  }

  startReviewBar(ticketId: string, request: ReviewBarRequest, at: string): ReviewBarStarted {
    return this.reviewBars.startReviewBar(ticketId, request, at);
  }

  recordReview(ticketId: string, recording: ReviewRecording, at: string, bundleBarTaskId: number | null = null): ReviewRecorded {
    return this.reviewBars.recordReview(ticketId, recording, at, bundleBarTaskId);
  }

  setTicketDependencies(ticketId: string, dependsOn: readonly string[], at: string): TicketDependenciesChanged {
    return this.ticketDependencies.setTicketDependencies(ticketId, dependsOn, at);
  }

  addTicketDependencies(ticketId: string, addedTicketIds: readonly string[], at: string): TicketDependenciesChanged {
    return this.ticketDependencies.addTicketDependencies(ticketId, addedTicketIds, at);
  }

  removeTicketDependencies(ticketId: string, removedTicketIds: readonly string[], at: string): TicketDependenciesChanged {
    return this.ticketDependencies.removeTicketDependencies(ticketId, removedTicketIds, at);
  }

  claimTickets(ticketIds: readonly string[], claim: TicketClaim, at: string): TicketsClaimed {
    return this.ticketClaims.claimTickets(ticketIds, claim, at);
  }

  releaseTickets(ticketIds: readonly string[], release: TicketRelease, at: string): TicketsReleased {
    return this.ticketMoves.releaseTickets(ticketIds, release, at);
  }

  linkTicketToTask(ticketId: string, taskId: number, request: { movesTheLink: boolean }): Readonly<Ticket> {
    return this.taskRows.linkTicketToTask(ticketId, taskId, request);
  }

  setTicketPriority(ticketId: string, priority: TicketPriority, at: string): TicketChanged {
    return this.ticketSettings.setTicketPriority(ticketId, priority, at);
  }

  setTicketSize(ticketId: string, size: TicketSize, at: string): TicketChanged {
    return this.ticketSettings.setTicketSize(ticketId, size, at);
  }

  setTicketAgents(ticketId: string, agents: AgentChoice, at: string): TicketChanged {
    return this.ticketSettings.setTicketAgents(ticketId, agents, at);
  }

  setTicketNetwork(ticketId: string, domains: readonly string[], at: string): TicketChanged {
    return this.ticketSettings.setTicketNetwork(ticketId, domains, at);
  }

  /** Judged before a filing names the entity, since the Board keeps no undo of the filing. */
  refuseAnUnknownEntity(ticketId: string, entity: string): void {
    this.ticketSettings.refuseAnUnknownEntity(ticketId, entity);
  }

  setTicketEntity(ticketId: string, assignment: EntityAssignment, at: string, options: { allowsPastCommitted?: boolean } = {}): TicketChanged {
    return this.ticketSettings.setTicketEntity(ticketId, assignment, at, options);
  }

  holdTicket(ticketId: string, reason: string, at: string): TicketChanged {
    return this.ticketSettings.holdTicket(ticketId, reason, at);
  }

  unholdTicket(ticketId: string, at: string): TicketChanged {
    return this.ticketSettings.unholdTicket(ticketId, at);
  }

  liftInterruptedHold(ticketId: string, at: string): TicketChanged {
    return this.ticketSettings.liftInterruptedHold(ticketId, at);
  }

  liftInterruptedApply(at: string): Logged {
    return this.pipelineSetups.liftInterruptedApply(at);
  }

  markReleaseTicket(ticketId: string, at: string): TicketChanged {
    return this.groupReleases.markReleaseTicket(ticketId, at);
  }

  clearReleaseTicket(ticketId: string, at: string): TicketChanged {
    return this.groupReleases.clearReleaseTicket(ticketId, at);
  }

  editTicket(ticketId: string, edit: TicketEdit, at: string): TicketEdited {
    return this.ticketEdits.editTicket(ticketId, edit, at);
  }

  restoreKeptTicketContent(ticketId: string, at: string): Logged {
    return this.ticketEdits.restoreKeptContent(ticketId, at);
  }

  clearTracker(request: { ticketsSurvive: boolean }, at: string): TrackerCleared {
    return this.trackerChanges.clearTracker(request, at);
  }

  tasks(): readonly Readonly<Task>[] {
    return this.records.progress.tasks;
  }

  tickets(): readonly Readonly<Ticket>[] {
    return this.records.ticketRecords;
  }

  /** Ordered by key. */
  epics(): readonly Readonly<Epic>[] {
    return this.records.epicRecords;
  }

  epicByKey(epicKey: string): Readonly<Epic> | undefined {
    return this.records.epicRecordByKey(epicKey);
  }

  /** Ordered by id number. */
  drafts(): readonly Readonly<Draft>[] {
    return this.draftRules.draftsInIdOrder();
  }

  /** Every open draft, ordered by id number, as `status --json` and the page's `boardFacts` list them. */
  openDraftSummaries(): DraftSummary[] {
    return this.draftRules.openDraftSummaries();
  }

  /** `waiting` while a question is open, else `researching` while claimed and `resumable` while not. */
  draftStateOf(draft: Readonly<Draft>): DraftState {
    return this.draftRules.draftStateOf(draft);
  }

  /** One per epic, ordered by key. */
  epicRollups(): EpicRollup[] {
    return this.records.epicRecords.map((epic) => this.epicRules.epicRollupOf(epic));
  }

  epicRollupOf(epic: Readonly<Epic>): EpicRollup {
    return this.epicRules.epicRollupOf(epic);
  }

  /** Reads `3`, `#3` and `003` alike, as a typed reference may be any of them. */
  ticketByReference(reference: string): Readonly<Ticket> | undefined {
    return this.records.ticketRecordByReference(reference);
  }

  concurrency(): Concurrency {
    return this.dispatchQueries.concurrency();
  }

  launchSlots(): LaunchSlots {
    return this.dispatchQueries.launchSlots();
  }

  hephaestusState(): HephaestusState {
    return this.dispatchQueries.hephaestusState();
  }

  /** `null` on a board whose branches have bare names. */
  branchNamespace(): string | null {
    return this.records.progress.branchNamespace ?? null;
  }

  /** `null` when none is stored, or the stored one could not be read: either way no gate is set. */
  pipeline(): Readonly<Pipeline> | null {
    return this.records.pipeline;
  }

  /** Whether the hold has a changed pipeline to write. */
  pipelineChanged(): boolean {
    return this.records.pipelineChanged;
  }

  /** The open setup record; `null` when none is open or the stored one could not be read. */
  pipelineSetup(): Readonly<PipelineSetup> | null {
    return this.pipelineSetups.openSetupRecord();
  }

  /** What the hold writes for the record: the record, `removed` after a start over, or `unchanged`. */
  pipelineSetupWrite(): { write: 'record'; setup: PipelineSetup } | { write: 'removed' } | { write: 'unchanged' } {
    if (!this.records.pipelineSetupChanged) return { write: 'unchanged' };
    const reading = this.records.pipelineSetupReading;
    return reading.verdict === 'readable' ? { write: 'record', setup: reading.setup } : { write: 'removed' };
  }

  /** What a gate run of `phase` that starts now records on a row: the stored pipeline's hash of that phase; `null` with none stored. */
  gateRunStampOf(phase: GatePhase): GateRunStamp | null {
    return this.records.pipeline === null ? null : PipelineUtil.gateRunStampOf(this.records.pipeline, phase);
  }

  gateWritablePaths(): readonly string[] {
    return this.records.pipeline === null ? [] : PipelineUtil.writablePathsOf(this.records.pipeline);
  }

  readyTickets(): readonly Readonly<Ticket>[] {
    return this.dispatchQueries.readyTickets();
  }

  readyTicketEntries(): ReadyTicket[] {
    return this.dispatchQueries.readyTicketEntries();
  }

  heldTicketIds(): string[] {
    return this.dispatchQueries.heldTicketIds();
  }

  dispatchCapacity(): DispatchCapacity {
    return this.dispatchQueries.dispatchCapacity();
  }

  unsettledDependenciesOf(ticketId: string): string[] {
    return this.dispatchQueries.unsettledDependenciesOf(ticketId);
  }

  waitingOnOf(ticket: Readonly<Ticket>): string[] {
    return this.dispatchQueries.waitingOnOf(ticket);
  }

  releaseBundleOf(group: string): string[] {
    return this.groupReleases.releaseBundleOf(group);
  }

  pausedBuildRowOf(ticketId: string): Readonly<Task> | null {
    return this.dispatchQueries.pausedBuildRowOf(ticketId);
  }

  pausedBuildTickets(): readonly Readonly<Ticket>[] {
    return this.dispatchQueries.pausedBuildTickets();
  }

  inProgressTicketIds(): string[] {
    return this.dispatchQueries.inProgressTicketIds();
  }

  inProgressReviewOfIds(): string[] {
    return this.dispatchQueries.inProgressReviewOfIds();
  }

  reviewRowsOf(ticketId: string): readonly Readonly<Task>[] {
    return this.displayQueries.reviewRowsOf(ticketId);
  }

  /** The log the Board was opened with, then every record logged since, as the Playbook reads it. */
  logRecordsSoFar(): readonly LogRecord[] {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords];
  }

  /** The log is the caller's to hand in, since the Board holds no log records. */
  reviewStatisticsOf(logRecords: readonly LogRecord[]): ReviewStatisticsReport {
    return this.reviewStatistics.reviewStatisticsOf(logRecords);
  }

  reviewWaitingTickets(): readonly Readonly<Ticket>[] {
    return this.dispatchQueries.reviewWaitingTickets();
  }

  linkedRowOf(ticketId: string): Readonly<Task> | null {
    return this.displayQueries.linkedRowOf(ticketId);
  }

  ticketIsReleasable(ticket: Readonly<Ticket>, releasedTicketIds: readonly string[]): boolean {
    return this.ticketMoves.ticketIsReleasable(ticket, releasedTicketIds);
  }

  taskIsTicketWork(task: Readonly<Task>): boolean {
    return this.displayQueries.taskIsTicketWork(task);
  }

  taskIsSettled(task: Readonly<Task>): boolean {
    return this.displayQueries.taskIsSettled(task);
  }

  ticketIsSettled(ticket: Readonly<Ticket>): boolean {
    return this.displayQueries.ticketIsSettled(ticket);
  }

  /** Over every ticket, settled ones included. */
  ticketCountByStatus(): Record<TicketStatus, number> {
    return this.displayQueries.ticketCountByStatusOf(this.records.ticketRecords);
  }

  reviewBarsOf(ticketId: string): readonly Readonly<Task>[] {
    return this.displayQueries.reviewBarsOf(ticketId);
  }

  ownRowOf(ticketId: string): Readonly<Task> | null {
    return this.displayQueries.ownRowOf(ticketId);
  }

  rowDisplayStateOf(task: Readonly<Task>): DisplayState {
    return this.displayQueries.rowDisplayStateOf(task);
  }

  ticketDisplayStateOf(ticket: Readonly<Ticket>): DisplayState {
    return this.displayQueries.ticketDisplayStateOf(ticket);
  }

  deliveredRowCountsAsReviewed(task: Readonly<Task>): boolean {
    return this.displayQueries.deliveredRowCountsAsReviewed(task);
  }

  /** `targetOf` `null` leaves every target `null`, as a reading without a repository to name them does. */
  ticketForecastsOf(targetOf: MergeTargetOf | null): TicketForecast[] {
    return this.ticketForecasts.ticketForecastsOf(targetOf);
  }

  changedTickets(): readonly Ticket[] {
    return this.records.changedTicketRecords;
  }

  changedEpics(): readonly Epic[] {
    return this.records.changedEpicRecords;
  }

  removedEpics(): readonly Epic[] {
    return this.records.removedEpicRecords;
  }

  changedDrafts(): readonly Draft[] {
    return this.records.changedDraftRecords;
  }

  removedDrafts(): readonly Draft[] {
    return this.records.removedDraftRecords;
  }
}
