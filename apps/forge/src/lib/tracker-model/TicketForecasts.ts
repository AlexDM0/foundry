/**
 * The forecast of each open ticket: its lifecycle steps from the one under way, or the next one, to its landing, and the tickets that wait
 * on it. A forecast, never a decision: the Playbook decides; this reads the same facts and the Playbook's own counts, and
 * `src/lib/tracker-model/Playbook.forecast.spec.ts` holds its first step to the step the Playbook takes.
 */
import type { Job, JobState }                                       from './@types/Job.ts';
import type { Pipeline }                                            from './@types/Pipeline.ts';
import type { TicketFrontmatter, TicketStatus }                     from './@types/Ticket.ts';
import type { TicketDependent, TicketForecast, TicketForecastStep } from './@types/TicketForecast.ts';
import type { MergeTargetOf }                                       from './AirlockClaims.ts';
import type { BoardRecords }                                        from './BoardRecords.ts';
import type { Jobs }                                                from './Jobs.ts';
import type { MergeQueueMarks }                                     from './MergeQueueMarks.ts';
import type { NextLaunchNumbers }                                   from './Playbook.ts';
import { Playbook }                                                 from './Playbook.ts';
import { PipelineUtil }                                             from './utils/PipelineUtil.ts';
import { TicketDependencyUtil }                                     from './utils/TicketDependencyUtil.ts';

/** The statuses whose work still lies ahead under Hephaestus: every other ticket is unready, landed or closed. */
const FORECAST_TICKET_STATUSES: readonly TicketStatus[] = ['committed', 'in-progress', 'in-review'];

/** A filed ticket no builder can take yet, which can neither start nor be said to wait. */
const UNREADY_TICKET_STATUSES: readonly TicketStatus[] = ['draft', 'ready-for-review'];

/** The states in which a build job's handoff is in Customs or its gates run, the target's merge before User's Merge included. */
const CUSTOMS_JOB_STATES: readonly JobState[] = ['in-customs', 'gating', 'merging-main'];

/** The round of a review after a build still to come: finishing the ticket again starts its rounds over. */
const FIRST_REVIEW_ROUND = 1;

interface ForecastSteps {
  steps:            TicketForecastStep[];
  currentStepIndex: number | null;
}

/** What every ticket's forecast reads alike: the pipeline, the merge targets and the Playbook's launch numbers. */
interface ForecastReading {
  pipeline:      Readonly<Pipeline>;
  targetOf:      MergeTargetOf | null;
  launchNumbers: ReadonlyMap<string, NextLaunchNumbers>;
}

export class TicketForecasts {
  constructor(
    private readonly records: BoardRecords,
    private readonly jobRules: Jobs,
    private readonly mergeQueueMarks: MergeQueueMarks,
  ) {}

  /** In board order, one per committed, in-progress or in-review ticket; none while no pipeline is set, since nothing launches then. */
  ticketForecastsOf(targetOf: MergeTargetOf | null): TicketForecast[] {
    const { pipeline } = this.records;
    if (pipeline === null) return [];
    const tickets         = this.records.ticketRecords.map((ticket) => ticket.frontmatter);
    const forecastTickets = tickets.filter((ticket) => FORECAST_TICKET_STATUSES.includes(ticket.status));
    const logRecords      = [...this.records.storedLogRecords, ...this.records.loggedRecords];
    const reading: ForecastReading = { pipeline, targetOf, launchNumbers: Playbook.nextLaunchNumbersOf(forecastTickets, logRecords) };
    const statusById      = this.records.ticketStatusById();
    return forecastTickets.map((ticket) => ({
      ticketId:   ticket.id,
      ...this.stepsOf(ticket, reading),
      dependents: dependentsOf(ticket.id, tickets, statusById),
    }));
  }

  private stepsOf(ticket: Readonly<TicketFrontmatter>, reading: ForecastReading): ForecastSteps {
    const launchNumbers = reading.launchNumbers.get(ticket.id) ?? { buildAttempt: 1, reviewRound: FIRST_REVIEW_ROUND };
    const gateNames     = PipelineUtil.gatesOfPhase(PipelineUtil.ticketPipelineOf(reading.pipeline, ticket.entity), 'build').map((gate) => gate.name);
    const reviewIsSet   = PipelineUtil.ticketReviewIsSet(reading.pipeline, ticket.entity);
    const target        = reading.targetOf === null ? null : reading.targetOf(ticket);
    const approvalSteps: TicketForecastStep[] = reading.pipeline.approvals?.merge === true && !this.mergeQueueMarks.ticketIsMergeAccepted(ticket.id)
      ? [{ kind: 'merge-approval', target }]
      : [];
    const landingSteps    = [...approvalSteps, landingStepOf(ticket, target)];
    const reviewStepsOf   = (round: number): TicketForecastStep[] => (reviewIsSet ? [{ kind: 'review', round, jobId: null }] : []);
    const afterBuildSteps = [...reviewStepsOf(FIRST_REVIEW_ROUND), ...landingSteps];
    const liveJob         = this.liveJobOf(ticket.id);
    switch (liveJob?.kind) {
      case 'build':
        if (CUSTOMS_JOB_STATES.includes(liveJob.state)) return { steps: [{ kind: 'customs-and-gates', gateNames, jobId: liveJob.id }, ...afterBuildSteps], currentStepIndex: 0 };
        return {
          steps:            [{ kind: 'build', attempt: liveJob.attempt, jobId: liveJob.id }, { kind: 'customs-and-gates', gateNames, jobId: null }, ...afterBuildSteps],
          currentStepIndex: 0,
        };
      case 'review':
        return { steps: [{ kind: 'review', round: liveJob.attempt, jobId: liveJob.id }, ...landingSteps], currentStepIndex: 0 };
      case 'merge':
      case 'merge-agent':
        return { steps: [landingStepOf(ticket, target)], currentStepIndex: 0 };
      default:
        break;
    }
    if (ticket.status !== 'in-review') {
      return {
        steps:            [{ kind: 'build', attempt: launchNumbers.buildAttempt, jobId: null }, { kind: 'customs-and-gates', gateNames, jobId: null }, ...afterBuildSteps],
        currentStepIndex: null,
      };
    }
    // A passed review queued the ticket to land: it waits for its Airlock, never for another review.
    const reviewSteps = this.mergeQueueMarks.ticketIsMergeQueued(ticket.id) ? [] : reviewStepsOf(launchNumbers.reviewRound);
    return { steps: [...reviewSteps, ...landingSteps], currentStepIndex: null };
  }

  /** The build, review or Airlock job working on the ticket: the Playbook keeps at most one on a ticket. */
  private liveJobOf(ticketId: string): Readonly<Job> | undefined {
    return this.jobRules.jobs().find((job) => job.ticketIds.includes(ticketId));
  }
}

/** A group's ticket integrates into its group's branch; its release ticket, and a ticket of no group, land on the main line. */
function landingStepOf(ticket: Readonly<TicketFrontmatter>, target: string | null): TicketForecastStep {
  if (ticket.group !== undefined && ticket.releasesGroup !== true) return { kind: 'integrate', target, group: ticket.group };
  return { kind: 'land', target };
}

/** Every ticket a builder can take or has taken whose unsettled dependencies name the ticket, in board order. */
function dependentsOf(ticketId: string, tickets: readonly Readonly<TicketFrontmatter>[], statusById: ReadonlyMap<string, TicketStatus>): TicketDependent[] {
  return tickets
    .filter((candidate) => !UNREADY_TICKET_STATUSES.includes(candidate.status))
    .flatMap((candidate) => {
      const waitingOn = TicketDependencyUtil.waitingOnOf(candidate, statusById);
      if (!waitingOn.includes(ticketId)) return [];
      return [{ ticketId: candidate.id, stillWaitingOnTicketIds: waitingOn.filter((dependencyId) => dependencyId !== ticketId) }];
    });
}
