/**
 * The forge level's live page (MonoLive), pure: the merge train over every entity, the ticket the Airlock lets onto main first and then
 * the tickets queued for it, each with how long it has stood there, and the board's jobs in flight against its limit, worded in jobs.
 * The train shows no entity column and the page no cap per entity yet: the facts carry neither a ticket's entity nor a cap's use.
 */
import type { PipelineFlowFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ElapsedTimeUtil }        from '../../../utils/ElapsedTimeUtil.ts';
import { PipelinePhaseModel }     from '../flow/PipelinePhaseModel.ts';
import { FlowActivityPanelModel } from './FlowActivityPanelModel.ts';

export interface MergeTrainRowView {
  readonly key:          string;
  /** "1" for the ticket the Airlock holds, then the queue in order. */
  readonly positionText: string;
  readonly ticketId:     string;
  readonly href:         string;
  readonly inAirlock:    boolean;
  readonly stateText:    string;
  readonly waitingText:  string;
}

const IN_AIRLOCK_TEXT = 'In the Airlock · merging onto main';

const QUEUED_TEXT = 'Waiting for the Airlock';

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The tickets in the Airlock first, then the queue, each in the facts' order. */
function mergeTrainRowsOf(flow: Pick<PipelineFlowFacts, 'nodes' | 'occupants'>, now: Date): MergeTrainRowView[] {
  const trainNodeIds = new Set(PipelinePhaseModel.trainNodeIdsOf(flow));
  const queueNodeIds = new Set(PipelinePhaseModel.queueNodeIdsOf(flow));
  const tickets = flow.occupants.filter((occupant) => occupant.occupantKind === 'ticket');
  const inTrain = tickets.filter((occupant) => trainNodeIds.has(occupant.nodeId));
  const queued = tickets.filter((occupant) => queueNodeIds.has(occupant.nodeId));
  return [...inTrain, ...queued].map((occupant, i) => {
    const inAirlock = i < inTrain.length;
    const [chip] = FlowActivityPanelModel.inFlightChipsOf([occupant.occupantId]);
    return {
      key:          occupant.occupantId,
      positionText: String(i + 1),
      ticketId:     occupant.occupantId,
      href:         chip?.href ?? '',
      inAirlock,
      stateText:    inAirlock ? IN_AIRLOCK_TEXT : QUEUED_TEXT,
      waitingText:  ElapsedTimeUtil.ageSinceText(occupant.since, now) ?? '',
    };
  });
}

/** "1 of 2 jobs running"; "2 jobs at once" when the facts do not count the jobs in flight. */
function boardJobsTextOf(concurrency: { readonly limit: number; readonly agentsInFlight?: number }): string {
  if (concurrency.agentsInFlight === undefined) return `${countText(concurrency.limit, 'job', 'jobs')} at once`;
  return `${String(concurrency.agentsInFlight)} of ${countText(concurrency.limit, 'job', 'jobs')} running`;
}

export const ForgeLevelLiveModel = Object.freeze({
  mergeTrainRowsOf,
  boardJobsTextOf,
});
