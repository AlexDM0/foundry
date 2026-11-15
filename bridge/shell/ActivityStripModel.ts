/**
 * The activity strip's facts, read from the jobs the board names as holding a launch slot: one chip per slot job with its role, ticket,
 * palette row and launch stamp, the building and reviewing counts, and how many in-progress tickets have no job. Which job holds a slot is
 * the Overseer's fact (`launchSlots`), joined on ids here; the Bridge keeps no copy of the rule.
 */
import type { DisplayState }                          from '../../src/lib/tracker-model/@types/Task.ts';
import type { IdentifiedRecord, LaunchSlotsDocument } from '../@types/BoardStateDocument.ts';
import { ElapsedTimeUtil }                            from '../utils/ElapsedTimeUtil.ts';
import { JobStateUtil }                               from '../utils/JobStateUtil.ts';
import type { AgentJobDocument }                      from '../views/agents/AgentJobDocument.ts';
import { AgentsModel }                                from '../views/agents/AgentsModel.ts';

export interface WorkerChip {
  readonly jobId:      string;
  /** The job's role as stored, `null` when it has none; the Flint slot's cue reads it. */
  readonly role:       string | null;
  readonly kind:       string;
  /** The job's state as stored; the Flint slot is cued by the first running job. */
  readonly state:      string;
  /** The job's role as stored, its kind when it has none; the chip prints it. */
  readonly roleLabel:  string;
  /** A running build `in-progress`, a running review `reviewing`, any other job state its nearest palette row. */
  readonly stateToken: DisplayState;
  readonly ticketId:   string | null;
  readonly title:      string;
  /** Only ever shown: `null` while the job launches, which the strip orders last and shows without a time. */
  readonly launchedAt: string | null;
}

export interface ActivityStripFacts {
  readonly chips:                 readonly WorkerChip[];
  /** How many launch slots the board has; `null` on a board that names none. */
  readonly slotLimit:             number | null;
  readonly buildingCount:         number;
  readonly reviewingCount:        number;
  readonly ticketCountWithoutJob: number;
}

export const IDLE_ACTIVITY_TEXT = 'No agent is working right now.';

export const NO_ACTIVITY: ActivityStripFacts = Object.freeze({
  chips: [], slotLimit: null, buildingCount: 0, reviewingCount: 0, ticketCountWithoutJob: 0,
});

const REVIEW_JOB_KIND = 'review';

const RUNNING_JOB_STATE = 'running';

type ActivityTicket = { readonly id: string; readonly title: string };

function stateTokenOf(job: Pick<AgentJobDocument, 'kind' | 'state'>): DisplayState {
  if (job.state !== RUNNING_JOB_STATE) return JobStateUtil.displayStateOf(job.state);
  return job.kind === REVIEW_JOB_KIND ? 'reviewing' : 'in-progress';
}

/** A stamp read only to order the chips, never to decide; an unreadable one sorts last. */
function launchOrderOf(launchedAt: string | null): number {
  const parsed = launchedAt === null ? Number.NaN : Date.parse(launchedAt);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function chipOf(job: AgentJobDocument, ticketTitleById: ReadonlyMap<string, string>): WorkerChip {
  const ticketId = job.ticketIds[0] ?? null;
  return {
    jobId:      job.id,
    role:       job.role,
    kind:       job.kind,
    state:      job.state,
    roleLabel:  job.role ?? job.kind,
    stateToken: stateTokenOf(job),
    ticketId,
    title:      (ticketId === null ? undefined : ticketTitleById.get(ticketId)) ?? job.id,
    launchedAt: typeof job.launchedAt === 'string' ? job.launchedAt : null,
  };
}

/**
 * One chip per job `launchSlots` names, the longest running first and jobs launched together in board order. A slot job counts as
 * reviewing by its kind, every other as building. Without `launchSlots` (an older Overseer, a spec's board) nothing shows.
 */
function activityStripFactsOf(
  launchSlots: LaunchSlotsDocument | undefined,
  jobs: readonly IdentifiedRecord[],
  tickets: readonly ActivityTicket[],
): ActivityStripFacts {
  if (launchSlots === undefined) return NO_ACTIVITY;
  const slotJobIds = new Set(launchSlots.slotJobIds);
  const ticketTitleById = new Map(tickets.map((ticket) => [ticket.id, ticket.title]));
  const slotJobs = jobs.filter(AgentsModel.isAgentJob).filter((job) => slotJobIds.has(job.id));
  const chips = slotJobs
    .map((job) => chipOf(job, ticketTitleById))
    .map((chip, position) => ({ chip, position }))
    .sort((a, b) => launchOrderOf(a.chip.launchedAt) - launchOrderOf(b.chip.launchedAt) || a.position - b.position)
    .map(({ chip }) => chip);
  const reviewingCount = slotJobs.filter((job) => job.kind === REVIEW_JOB_KIND).length;
  return {
    chips,
    slotLimit:             launchSlots.limit,
    buildingCount:         slotJobs.length - reviewingCount,
    reviewingCount,
    ticketCountWithoutJob: launchSlots.inProgressTicketIdsWithoutJob.length,
  };
}

/** Empty for a chip without a readable launch stamp. */
function elapsedTextOf(chip: Pick<WorkerChip, 'launchedAt'>, now: Date): string {
  return ElapsedTimeUtil.elapsedSinceText(chip.launchedAt, now) ?? '';
}

export const ActivityStripModel = Object.freeze({ activityStripFactsOf, elapsedTextOf });
