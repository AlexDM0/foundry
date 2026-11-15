/**
 * What the Bridge reads from a job's state and kind: whether its session is up, the display state it looks like, and whether it is
 * offered a fresh agent. Each job state takes the nearest display state, whose look `StateToneUtil` gives; an unknown state reads as
 * waiting.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

const NOT_YET_UP_STATES: ReadonlySet<string> = new Set(['launching', 'preparing', 'interrupted', 'stopping']);

const DISPLAY_STATE_OF_JOB_STATE: Readonly<Record<string, DisplayState>> = {
  'launching':          'pending',
  'preparing':          'pending',
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
};

const UNKNOWN_JOB_STATE_DISPLAY_STATE: DisplayState = 'pending';

/** Fresh agent replaces a builder or reviewer on its worktree; the other kinds have no worktree of their own to hand on. */
const FRESH_AGENT_KINDS: readonly string[] = ['build', 'review'];

function isUp(jobState: string): boolean {
  return !NOT_YET_UP_STATES.has(jobState);
}

function displayStateOf(jobState: string): DisplayState {
  return Object.hasOwn(DISPLAY_STATE_OF_JOB_STATE, jobState) ? DISPLAY_STATE_OF_JOB_STATE[jobState] ?? UNKNOWN_JOB_STATE_DISPLAY_STATE : UNKNOWN_JOB_STATE_DISPLAY_STATE;
}

function offersFreshAgent(jobKind: string): boolean {
  return FRESH_AGENT_KINDS.includes(jobKind);
}

export const JobStateUtil = Object.freeze({ isUp, displayStateOf, offersFreshAgent });
