/**
 * What the board reads from a job's state: whether its session is up, and the display state it looks like. Each job state takes the
 * nearest display state, whose look `StateToneUtil` gives. Whether a job takes a fresh agent is the forge's, served in the job's offers.
 */
import type { BoardDisplayState, BoardJobState } from '../../@types/board/BoardVocabulary.ts';

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

function isUp(jobState: BoardJobState): boolean {
  return !NOT_YET_UP_STATES.has(jobState);
}

function displayStateOf(jobState: BoardJobState): BoardDisplayState {
  return DISPLAY_STATE_OF_JOB_STATE[jobState];
}

export const JobStateUtil = Object.freeze({ isUp, displayStateOf });
