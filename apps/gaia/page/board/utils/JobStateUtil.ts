/**
 * What the board reads from a job's state: whether its session is up, and the display state it looks like. Each job state takes the
 * nearest display state, whose look `StateToneUtil` gives. Whether a job takes a fresh agent is the forge's, served in the job's offers.
 */
import type { BoardJobDocument }                                         from '../../@types/board/BoardJobDocuments.ts';
import type { BoardDisplayState, BoardInterruptionCause, BoardJobState } from '../../@types/board/BoardVocabulary.ts';
import type { InterruptionWaitState, JobDisplayState }                   from '../@types/JobDisplayState.ts';

const NOT_YET_UP_STATES: ReadonlySet<BoardJobState> = new Set<BoardJobState>(['launching', 'preparing', 'interrupted', 'stopping']);

/** A `Record` over every job state, so a new state does not compile until it has a display state. */
const DISPLAY_STATE_OF_JOB_STATE: Readonly<Record<BoardJobState, BoardDisplayState>> = Object.freeze({
  'launching':          'committed',
  'preparing':          'committed',
  'running':            'in-progress',
  'waiting-for-answer': 'paused',
  'awaiting-answer':    'paused',
  'interrupted':        'paused',
  'stopping':           'paused',
  'in-customs':         'in-review',
  'gating':             'in-review',
  'merging-main':       'in-review',
  'merging':            'reviewed',
  'landing':            'reviewed',
});

/** The causes an interrupted job is worded by; every other interrupted job reads as paused. */
const INTERRUPTION_WAIT_STATE_OF_CAUSE: Readonly<Partial<Record<BoardInterruptionCause, InterruptionWaitState>>> = Object.freeze({
  'network-outage': 'network-outage',
  'lease-ended':    'not-supervised',
});

function isUp(jobState: BoardJobState): boolean {
  return !NOT_YET_UP_STATES.has(jobState);
}

function displayStateOf(jobState: BoardJobState): BoardDisplayState {
  return DISPLAY_STATE_OF_JOB_STATE[jobState];
}

/** The forge's served cause of an interrupted job decides its wait; `interruption` stays once a job resumes, so only `interrupted` counts. */
function interruptionWaitStateOf(job: Pick<BoardJobDocument, 'state' | 'interruption'>): InterruptionWaitState | null {
  if (job.state !== 'interrupted' || job.interruption === null) return null;
  return INTERRUPTION_WAIT_STATE_OF_CAUSE[job.interruption] ?? null;
}

function displayStateOfJob(job: Pick<BoardJobDocument, 'state' | 'interruption'>): JobDisplayState {
  return interruptionWaitStateOf(job) ?? displayStateOf(job.state);
}

/** The one reading of a refused launch: forge refused the job's launch for its agent's program, so it never reached the state it names. */
function launchIsRefused(job: Partial<Pick<BoardJobDocument, 'notLaunched'>>): boolean {
  return job.notLaunched !== undefined && job.notLaunched !== null;
}

export const JobStateUtil = Object.freeze({
  isUp, displayStateOf, interruptionWaitStateOf, displayStateOfJob, launchIsRefused
});
