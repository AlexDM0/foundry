/**
 * What the Bridge reads from a job's state: whether its session is up, and the [data-state] palette row its pill takes. Only ticket
 * display states have palette rows, so each job state takes the nearest one; an unknown state reads as waiting.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

const NOT_YET_UP_STATES: ReadonlySet<string> = new Set(['launching', 'preparing', 'interrupted', 'stopping']);

const PALETTE_STATE_OF_JOB_STATE: Readonly<Record<string, DisplayState>> = {
  'launching':          'pending',
  'preparing':          'pending',
  'running':            'in-progress',
  'waiting-for-answer': 'paused',
  'awaiting-answer':    'paused',
  'interrupted':        'paused',
  'stopping':           'paused',
  'in-customs':         'in-review',
  'gating':             'in-review',
  'merging':            'reviewed',
  'landing':            'reviewed',
};

const UNKNOWN_JOB_STATE_PALETTE_STATE: DisplayState = 'pending';

function isUp(jobState: string): boolean {
  return !NOT_YET_UP_STATES.has(jobState);
}

function paletteStateOf(jobState: string): DisplayState {
  return Object.hasOwn(PALETTE_STATE_OF_JOB_STATE, jobState) ? PALETTE_STATE_OF_JOB_STATE[jobState] ?? UNKNOWN_JOB_STATE_PALETTE_STATE : UNKNOWN_JOB_STATE_PALETTE_STATE;
}

export const JobStateUtil = Object.freeze({ isUp, paletteStateOf });
