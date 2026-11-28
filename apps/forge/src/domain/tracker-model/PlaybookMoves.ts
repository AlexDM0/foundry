/** The steps the Playbook derives from the board, applied in order, each through the part of the board that owns its move. */
import type { LifecycleAdvanced, Logged } from './@types/BoardChanges.ts';
import type { JobEnding }                 from './@types/Job.ts';
import type { LifecycleLimits }           from './@types/LifecycleLimits.ts';
import type { LogRecord }                 from './@types/LogRecord.ts';
import type {
  DecisionDraft,
  DecisionWording,
  PlaybookLaunchStage,
  PlaybookObservations,
  PlaybookStep
} from './@types/PlaybookStep.ts';
import type { Ticket }                                       from './@types/Ticket.ts';
import type { BoardRecords }                                 from './BoardRecords.ts';
import type { Decisions }                                    from './Decisions.ts';
import { DOCUMENTS_HOLD_REASON, type DispatchQueries }       from './DispatchQueries.ts';
import type { IncidentMoves }                                from './IncidentMoves.ts';
import type { Incidents }                                    from './Incidents.ts';
import type { JobControls }                                  from './JobControls.ts';
import type { Jobs }                                         from './Jobs.ts';
import type { MergeQueueMarks }                              from './MergeQueueMarks.ts';
import { Playbook, type PlaybookFacts, type PlaybookTicket } from './Playbook.ts';
import type { TicketDependencies }                           from './TicketDependencies.ts';
import type { TicketSettings }                               from './TicketSettings.ts';
import type { TrackerChanges }                               from './TrackerChanges.ts';
import { PARKED_HOLD_PREFIX, RETIRED_DECISION_REASON }       from './constants/DecisionAndIncidentVocabulary.ts';

export interface PlaybookMovesInput {
  records:            BoardRecords;
  jobRules:           Jobs;
  jobControls:        JobControls;
  decisionRules:      Decisions;
  incidentRules:      Incidents;
  incidentMoves:      IncidentMoves;
  dispatchQueries:    DispatchQueries;
  mergeQueueMarks:    MergeQueueMarks;
  ticketSettings:     TicketSettings;
  ticketDependencies: TicketDependencies;
  trackerChanges:     TrackerChanges;
  /** The Board's end of a job, which also rebinds the job's open questions to its ticket. */
  endJob:             (jobId: string, ending: JobEnding, at: string) => Logged;
}

/** The entity and stage a launch step names, which the job carries only when set. */
function launchStageOf(step: PlaybookLaunchStage): PlaybookLaunchStage {
  return { ...(step.entity === undefined ? {} : { entity: step.entity }), ...(step.stage === undefined ? {} : { stage: step.stage }) };
}

export class PlaybookMoves {
  constructor(private readonly input: PlaybookMovesInput) {}

  /**
   * Applies every step the Playbook derives from this board, in order, each record stamped `limits.now`. A decision the policy
   * opens is worded by `decisionWordingOf`, since the policy holds no words.
   */
  followPlaybook(limits: LifecycleLimits, observations: PlaybookObservations, decisionWordingOf: (draft: DecisionDraft) => DecisionWording): LifecycleAdvanced {
    const steps = Playbook.nextStepsOf(this.playbookFactsOf(observations), limits);
    const logged = steps.flatMap((step) => this.applyPlaybookStep(step, decisionWordingOf, limits.now));
    return { steps, logged };
  }

  private playbookFactsOf(observations: PlaybookObservations): PlaybookFacts {
    return {
      tickets:                     this.input.records.ticketRecords.map((ticket) => this.playbookTicketOf(ticket)),
      jobs:                        this.input.jobRules.jobs(),
      decisions:                   this.input.decisionRules.decisions(),
      incidents:                   this.input.incidentRules.incidents(),
      logRecords:                  [...this.input.records.storedLogRecords, ...this.input.records.loggedRecords],
      readinessPositionByTicketId: this.input.dispatchQueries.readinessPositionByTicketId(),
      concurrencyLimit:            this.input.dispatchQueries.concurrency().limit,
      hephaestusState:             this.input.dispatchQueries.hephaestusState(),
      pipelineIsSet:               this.input.records.pipeline !== null,
      assistantIsOn:               this.input.records.assistantIsOn(),
      reviewIsSet:                 this.input.records.pipeline?.review !== undefined,
      pipelineHasEntities:         this.input.records.pipeline?.entities !== undefined,
      entitiesWithReview:          Object.entries(this.input.records.pipeline?.entities ?? {})
        .filter(([, entity]) => entity.review !== undefined)
        .map(([entityKey]) => entityKey),
      concurrencyByEntity: Object.fromEntries(Object.entries(this.input.records.pipeline?.entities ?? {})
        .flatMap(([entityKey, entity]): [string, number][] => (entity.concurrency === undefined ? [] : [[entityKey, entity.concurrency]]))),
      ticketDocuments: Playbook.ticketDocumentFactsOf(this.input.records.ticketDocumentRecords),
      observations,
    };
  }

  /** The ticket as the Playbook reads it: its frontmatter, whether it is queued to land, and the stage its row stores once it crosses. */
  private playbookTicketOf(ticket: Readonly<Ticket>): PlaybookTicket {
    const stage = this.input.records.linkedTaskRecordOf(ticket)?.stage;
    const documentsHold = ticket.frontmatter.hold === undefined && this.input.dispatchQueries.ticketIsHeldByItsDocuments(ticket) ? { hold: DOCUMENTS_HOLD_REASON } : {};
    return {
      ...ticket.frontmatter,
      ...documentsHold,
      mergeQueued: this.input.mergeQueueMarks.ticketIsMergeQueued(ticket.frontmatter.id),
      ...(stage === undefined ? {} : { stage: { ...stage } }),
    };
  }

  private applyPlaybookStep(step: PlaybookStep, decisionWordingOf: (draft: DecisionDraft) => DecisionWording, at: string): readonly LogRecord[] {
    const openDecision = (draft: DecisionDraft): readonly LogRecord[] => this.input.decisionRules.openDecision({
      ...draft, askedBy: 'hephaestus', requestId: null, ...decisionWordingOf(draft)
    }, at).logged;
    switch (step.kind) {
      case 'launch-build':
        return this.input.jobRules.launchJob({
          kind: 'build', role: 'builder', ticketIds: [step.ticketId], parentJobId: null, attempt: step.attempt, target: step.base, ...launchStageOf(step)
        }, at).logged;
      case 'launch-review':
        return this.input.jobRules.launchJob({
          kind:        'review',
          role:        step.round > 1 ? 're-reviewer' : 'reviewer',
          ticketIds:   [step.ticketId],
          parentJobId: null,
          attempt:     step.round,
          target:      step.target,
          ...launchStageOf(step),
        }, at).logged;
      case 'boot-assistant':
        return this.input.jobRules.launchJob({
          kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
        }, at).logged;
      case 'withdraw-retired-decision':
        return this.input.decisionRules.withdrawDecision(step.decisionId, RETIRED_DECISION_REASON, at).logged;
      case 'resume-job':
        return this.input.jobRules.moveJob(step.jobId, 'running', at, { instructed: step.instructed }).logged;
      case 'replace-job':
        return this.input.endJob(step.jobId, { outcome: 'replaced' }, at).logged;
      case 'await-answer':
        return this.input.jobRules.moveJob(step.jobId, 'awaiting-answer', at).logged;
      case 'refresh-intake':
        return this.input.jobControls.refreshIntake(step.jobId, at).logged;
      case 'park':
        return [
          ...step.jobId === undefined ? [] : this.input.endJob(step.jobId, { outcome: 'failed', cause: step.cause }, at).logged,
          ...this.input.ticketSettings.holdTicket(step.ticketId, `${PARKED_HOLD_PREFIX}${step.cause}`, at).logged,
          ...openDecision({ kind: 'parked', ticketIds: [step.ticketId], jobId: null }),
        ];
      case 'release-abandoned-need':
        return [
          ...this.input.ticketDependencies.removeTicketDependencies(step.ticketId, [step.needTicketId], at).logged,
          ...openDecision({ kind: 'need-abandoned', ticketIds: [step.ticketId], jobId: null }),
        ];
      case 'open-decision':
        return openDecision(step.decision);
      case 'open-incident':
        return this.input.incidentRules.openIncident(step.incident, at).logged;
      case 'default-incident':
        return this.input.incidentMoves.defaultIncident(step.incidentId, step.cause, decisionWordingOf, at);
      case 'pause-hephaestus':
        return this.input.trackerChanges.setHephaestusState('paused', at).logged;
      case 'await-machine-slot':
        return [];
      case 'launch-document-agent':
        return this.input.jobRules.launchOrResumeDocumentAgent(step.ticketId, step.document, at).logged;
      // Hephaestus acts on it in the same hold: the stored proposals and the worktree's tree are outside the board.
      case 'act-on-waiver-answer':
        return [];
    }
  }
}
