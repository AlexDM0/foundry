/**
 * What the agent panel habitat cues and copies, from the Agents view's jobs: which job Flint copies (the selected one while it works, else
 * the first that works) and with which gesture its kind of work shows; whether some agent works or all are idle; and which jobs appeared.
 */
import type { SpriteIntent }     from '../../../flint/SpriteHabitat.ts';
import type { CueOccasion }      from '../../flint/UseCueOnChange.ts';
import type { AgentJobDocument } from './AgentJobDocument.ts';
import { AGENT_PANEL_CUES }      from './AgentPanelSpriteHabitat.ts';

export interface CopiedJob {
  readonly jobId:  string;
  readonly intent: SpriteIntent;
}

type PanelJob = Pick<AgentJobDocument, 'id' | 'kind' | 'state'>;

/** The job states in which an agent does its work; launching, waiting, stopping and the checks of its work are not. */
const WORKING_JOB_STATES: ReadonlySet<string> = new Set(['running', 'merging']);

/** The gesture that shows each kind of work. */
const COPY_INTENT_BY_JOB_KIND: Readonly<Record<string, SpriteIntent>> = Object.freeze({
  'build':         'type',
  'review':        'review',
  'product-owner': 'make-ticket',
  'merge':         'merge',
  'merge-agent':   'merge',
  'refresh':       'fasten',
  'onboarder':     'research',
  'assistant':     'research',
});

function copyIntentOf(job: PanelJob): SpriteIntent | null {
  return Object.hasOwn(COPY_INTENT_BY_JOB_KIND, job.kind) ? COPY_INTENT_BY_JOB_KIND[job.kind] ?? null : null;
}

function isCopyable(job: PanelJob): boolean {
  return WORKING_JOB_STATES.has(job.state) && copyIntentOf(job) !== null;
}

function copiedJobOf(jobs: readonly PanelJob[], selectedJobId: string | null): CopiedJob | null {
  const copied = jobs.find((job) => job.id === selectedJobId && isCopyable(job)) ?? jobs.find(isCopyable);
  const intent = copied === undefined ? null : copyIntentOf(copied);
  return copied === undefined || intent === null ? null : { jobId: copied.id, intent };
}

function activityOccasionOf(jobs: readonly PanelJob[]): CueOccasion {
  const someAgentWorks = jobs.some((job) => WORKING_JOB_STATES.has(job.state));
  const cueName = someAgentWorks ? AGENT_PANEL_CUES.AGENT_WORKS : AGENT_PANEL_CUES.ALL_AGENTS_IDLE;
  return { cueName, occasionKey: cueName };
}

/** The ids in `jobIds` that `previousJobIds` lacks, in the order of `jobIds`. */
function appearedJobIdsOf(previousJobIds: readonly string[], jobIds: readonly string[]): readonly string[] {
  const previous = new Set(previousJobIds);
  return jobIds.filter((jobId) => !previous.has(jobId));
}

export const AgentPanelSpriteModel = Object.freeze({ copiedJobOf, activityOccasionOf, appearedJobIdsOf });
