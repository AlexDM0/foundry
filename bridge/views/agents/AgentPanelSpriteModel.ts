/**
 * What the agent panel habitat cues and copies, from the Agents view's facts (`09-bridge-wiring.md`, "Copy: the agent panel"): the copy
 * intent of a job, first row that matches; which job Flint copies; whether some agent has work to copy or all are idle; which jobs
 * appeared; and the cues of a change between two payloads. A launch has one answer, the `strike-spark` of the copy: a job that appears
 * launching is not greeted, and the rise of the slots while a job launches is that launch, so it is not cued.
 */
import type { SpriteCue, SpriteIntent }                                       from '../../../flint/SpriteHabitat.ts';
import type { OverseerFactsDocument }                                         from '../../@types/BoardStateDocument.ts';
import type { CueOccasion }                                                   from '../../flint/UseCueOnChange.ts';
import type { AgentJobDocument, EndedAgentJobDocument, JobLiveFactsDocument } from './AgentJobDocument.ts';
import { AGENT_PANEL_CUES }                                                   from './AgentPanelSpriteHabitat.ts';

export type PanelJob = Pick<AgentJobDocument, 'id' | 'kind' | 'state' | 'crashResumes' | 'interruption' | 'stopRequest' | 'airlock'> & {
  readonly live: Pick<JobLiveFactsDocument, 'silentSweeps'>;
};

/** The board's `concurrency`; the Overseer also sends the ready and the held ticket ids in it, which an older board may lack. */
export interface PanelConcurrency {
  readonly limit:           number;
  readonly agentsInFlight:  number;
  readonly readyTicketIds?: readonly string[];
  readonly heldTicketIds?:  readonly string[];
}

/** What the agent panel compares between two payloads. */
export interface AgentPanelFacts {
  readonly jobs:        readonly PanelJob[];
  readonly endedJobs:   readonly EndedAgentJobDocument[];
  readonly concurrency: PanelConcurrency | null;
}

export interface CopiedJob {
  readonly jobId:        string;
  readonly intent:       SpriteIntent;
  /** The cue of a one action; null for every other intent. */
  readonly oneActionCue: SpriteCue | null;
}

/** The keys of the one actions already shown, one per job and intent. */
export type ShownOneActions = ReadonlySet<string>;

/**
 * A one action is shown one time through its cue and the habitat's suggestion, never copied: a copied one action would start again each
 * time it ends. The copy then takes the next row that matches; a second job's one action waits for the next payload.
 */
export interface CopyStep {
  readonly oneActionCue:    SpriteCue | null;
  readonly copiedJob:       CopiedJob | null;
  readonly shownOneActions: ShownOneActions;
}

interface CopyRow {
  readonly intent:  SpriteIntent;
  readonly matches: (job: PanelJob) => boolean;
}

const stateIs = (state: string) => (job: PanelJob): boolean => job.state === state;
const mergingIn = (phase: string) => (job: PanelJob): boolean => job.state === 'merging' && job.airlock?.phase === phase;
const runningAs = (kind: string) => (job: PanelJob): boolean => job.state === 'running' && job.kind === kind;

/**
 * The copy table, first row that matches. `interruption` is the cause of the job's last interruption and stays once the job resumes, so
 * only an interrupted job is out of fuel.
 */
const COPY_ROWS: readonly CopyRow[] = Object.freeze([
  { intent: 'out-of-fuel', matches: (job) => job.state === 'interrupted' && job.interruption === 'usage-limit' },
  { intent: 'listen', matches: (job) => job.live.silentSweeps > 0 },
  { intent: 'wind-down', matches: (job) => job.stopRequest === 'wind-down' },
  { intent: 'strike-spark', matches: stateIs('launching') },
  { intent: 'fasten', matches: stateIs('preparing') },
  { intent: 'ask', matches: (job) => job.state === 'waiting-for-answer' || job.state === 'awaiting-answer' },
  { intent: 'customs', matches: stateIs('in-customs') },
  { intent: 'gate-run', matches: stateIs('gating') },
  { intent: 'merge', matches: mergingIn('merge-in') },
  { intent: 'conflict', matches: mergingIn('resolving') },
  { intent: 'gate-run', matches: mergingIn('gating') },
  { intent: 'type-busy', matches: mergingIn('fixing') },
  { intent: 'airlock', matches: (job) => mergingIn('landing')(job) || job.state === 'landing' },
  { intent: 'type', matches: runningAs('build') },
  { intent: 'review', matches: runningAs('review') },
  { intent: 'interview', matches: runningAs('product-owner') },
  { intent: 'survey', matches: runningAs('onboarder') },
  { intent: 'merge', matches: (job) => runningAs('merge')(job) || runningAs('merge-agent')(job) },
  { intent: 'fasten', matches: runningAs('refresh') },
  { intent: 'research', matches: runningAs('assistant') },
] satisfies CopyRow[]);

const ONE_ACTION_CUE_BY_INTENT: ReadonlyMap<SpriteIntent, SpriteCue> = new Map<SpriteIntent, SpriteCue>([
  ['strike-spark', AGENT_PANEL_CUES.COPIED_JOB_LAUNCHES],
  ['wind-down', AGENT_PANEL_CUES.COPIED_JOB_WINDS_DOWN],
]);

const NO_ONE_ACTION_SHOWN: ShownOneActions = new Set();

const LANDING_OUTCOMES: ReadonlySet<string> = new Set(['landed', 'integrated']);

function oneActionKeyOf(jobId: string, intent: SpriteIntent): string {
  return `${jobId} ${intent}`;
}

/** The first row that matches; a one action already shown for this job is passed over, so the next row that matches shows. */
function copyIntentOf(job: PanelJob, shownOneActions: ShownOneActions): SpriteIntent | null {
  const row = COPY_ROWS.find((candidate) => (
    candidate.matches(job) && !(ONE_ACTION_CUE_BY_INTENT.has(candidate.intent) && shownOneActions.has(oneActionKeyOf(job.id, candidate.intent)))
  ));
  return row?.intent ?? null;
}

function copyOf(job: PanelJob, shownOneActions: ShownOneActions): CopiedJob | null {
  const intent = copyIntentOf(job, shownOneActions);
  return intent === null ? null : { jobId: job.id, intent, oneActionCue: ONE_ACTION_CUE_BY_INTENT.get(intent) ?? null };
}

/** The selected job while it has something to copy, else the first that has. */
function copiedJobOf(jobs: readonly PanelJob[], selectedJobId: string | null, shownOneActions: ShownOneActions): CopiedJob | null {
  const selected = jobs.find((job) => job.id === selectedJobId);
  const selectedCopy = selected === undefined ? null : copyOf(selected, shownOneActions);
  if (selectedCopy !== null) return selectedCopy;
  for (const job of jobs) {
    const copy = copyOf(job, shownOneActions);
    if (copy !== null) return copy;
  }
  return null;
}

/** The one actions the jobs show now, as if each were shown: the view takes them as it mounts, since a mount is no change of a job. */
function oneActionsOf(jobs: readonly PanelJob[]): ShownOneActions {
  return new Set(jobs.flatMap((job) => COPY_ROWS
    .filter((row) => ONE_ACTION_CUE_BY_INTENT.has(row.intent) && row.matches(job))
    .map((row) => oneActionKeyOf(job.id, row.intent))));
}

function copyStepOf(jobs: readonly PanelJob[], selectedJobId: string | null, shownOneActions: ShownOneActions): CopyStep {
  const chosen = copiedJobOf(jobs, selectedJobId, shownOneActions);
  if (chosen === null || chosen.oneActionCue === null) return { oneActionCue: null, copiedJob: chosen, shownOneActions };
  const shownNow = new Set([...shownOneActions, oneActionKeyOf(chosen.jobId, chosen.intent)]);
  const next = copiedJobOf(jobs, selectedJobId, shownNow);
  return { oneActionCue: chosen.oneActionCue, copiedJob: next?.oneActionCue === null ? next : null, shownOneActions: shownNow };
}

/** Some agent has work to copy; else all are idle, which is a happening only while the Overseer serves and is not paused. */
function activityOccasionOf(jobs: readonly PanelJob[], overseer: Pick<OverseerFactsDocument, 'state' | 'paused'> | null): CueOccasion | null {
  const someAgentWorks = jobs.some((job) => copyIntentOf(job, NO_ONE_ACTION_SHOWN) !== null);
  if (someAgentWorks) return { cueName: AGENT_PANEL_CUES.AGENT_WORKS, occasionKey: AGENT_PANEL_CUES.AGENT_WORKS };
  if (overseer?.state !== 'serving' || overseer.paused) return null;
  return { cueName: AGENT_PANEL_CUES.ALL_AGENTS_IDLE, occasionKey: AGENT_PANEL_CUES.ALL_AGENTS_IDLE };
}

/** The ids in `jobIds` that `previousJobIds` lacks, in the order of `jobIds`. */
function appearedJobIdsOf(previousJobIds: readonly string[], jobIds: readonly string[]): readonly string[] {
  const previous = new Set(previousJobIds);
  return jobIds.filter((jobId) => !previous.has(jobId));
}

const isLaunching = (job: PanelJob): boolean => job.state === 'launching';

/** The jobs that appeared and are greeted: a job that appears launching is answered by its `strike-spark` alone. */
function greetedJobIdsOf(previousJobIds: readonly string[], jobs: readonly PanelJob[]): readonly string[] {
  const appeared = new Set(appearedJobIdsOf(previousJobIds, jobs.map((job) => job.id)));
  return jobs.filter((job) => appeared.has(job.id) && !isLaunching(job)).map((job) => job.id);
}

function isRedHandoff(job: PanelJob | undefined): boolean {
  return job?.state === 'interrupted' && job.interruption === 'handoff-red';
}

function noSlotIsFree(concurrency: PanelConcurrency | null): boolean {
  if (concurrency === null || concurrency.agentsInFlight < concurrency.limit) return false;
  const heldTicketIds = new Set(concurrency.heldTicketIds ?? []);
  return (concurrency.readyTicketIds ?? []).some((ticketId) => !heldTicketIds.has(ticketId));
}

/**
 * The cues of the change from `previous` to `current`, each once, in the order of the table. A red handoff counts when the job enters the
 * interruption, since `interruption` keeps its last cause. The slots are not cued while a job launches: the launch took the slot, and its
 * `strike-spark` is the one answer.
 */
function changeCuesOf(previous: AgentPanelFacts, current: AgentPanelFacts): readonly SpriteCue[] {
  const previousJobById = new Map(previous.jobs.map((job) => [job.id, job]));
  const jobChanged = (changed: (previousJob: PanelJob | undefined, job: PanelJob) => boolean): boolean => (
    current.jobs.some((job) => changed(previousJobById.get(job.id), job))
  );
  const previousEndedJobIds = new Set(previous.endedJobs.map((job) => job.id));
  const previousInFlight = previous.concurrency?.agentsInFlight ?? null;
  const { concurrency } = current;
  const aJobLaunches = current.jobs.some(isLaunching);
  const happenings: readonly (readonly [SpriteCue, boolean])[] = [
    [AGENT_PANEL_CUES.GATE_FAILED, jobChanged((previousJob, job) => isRedHandoff(job) && !isRedHandoff(previousJob))],
    [AGENT_PANEL_CUES.JOB_RESUMED_AFTER_CRASH, jobChanged((previousJob, job) => previousJob !== undefined && job.crashResumes > previousJob.crashResumes)],
    [AGENT_PANEL_CUES.JOB_STOP_REQUESTED, jobChanged((previousJob, job) => job.stopRequest === 'stop' && previousJob?.stopRequest !== 'stop')],
    [AGENT_PANEL_CUES.JOB_FRESH_REQUESTED, jobChanged((previousJob, job) => job.stopRequest === 'fresh' && previousJob?.stopRequest !== 'fresh')],
    [AGENT_PANEL_CUES.JOB_LANDED, current.endedJobs.some((job) => !previousEndedJobIds.has(job.id) && LANDING_OUTCOMES.has(job.outcome))],
    [
      AGENT_PANEL_CUES.SLOT_FILLED,
      !aJobLaunches && concurrency !== null && previousInFlight !== null && concurrency.agentsInFlight > previousInFlight && concurrency.agentsInFlight < concurrency.limit,
    ],
    [AGENT_PANEL_CUES.NO_SLOT_FREE, !aJobLaunches && noSlotIsFree(concurrency) && !noSlotIsFree(previous.concurrency)],
  ];
  return happenings.flatMap(([cueName, happened]) => (happened ? [cueName] : []));
}

export const AgentPanelSpriteModel = Object.freeze({
  copyIntentOf, copiedJobOf, oneActionsOf, copyStepOf, activityOccasionOf, appearedJobIdsOf, greetedJobIdsOf, changeCuesOf,
});
