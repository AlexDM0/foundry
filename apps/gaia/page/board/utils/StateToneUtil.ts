/**
 * How each display state of the board looks in the design system's palette: its state tone and the flags of its shape. The package knows
 * no state of the board, so every badge, dot, pill, meter and state-coloured element of the board takes its tone and shape from here. A
 * job state looks like the display state nearest its meaning.
 */
import type { StateDotShape, StateTone } from 'design-system/StateTone';

import type { BoardJobDocument } from '../../@types/board/BoardJobDocuments.ts';
import type { BoardJobState }    from '../../@types/board/BoardVocabulary.ts';
import type { JobDisplayState }  from '../@types/JobDisplayState.ts';
import { JobStateUtil }          from './JobStateUtil.ts';

export interface StateLook {
  readonly tone:     StateTone;
  readonly dotShape: StateDotShape;
  readonly dashed:   boolean;
  readonly struck:   boolean;
  readonly checked:  boolean;
  readonly pulsing:  boolean;
}

export interface StateDotLook {
  readonly tone:  StateTone;
  readonly shape: StateDotShape;
}

/** The flags a state pill takes from a state; its colours it reads from the head it sits in. */
export interface StatePillLook {
  readonly dashed: boolean;
  readonly struck: boolean;
}

/** The props a `state` tag takes from a state: its tone, and the shape of its dot when it shows one. */
export interface StateTagLook {
  readonly tone:      'state';
  readonly stateTone: StateTone;
  readonly dotShape:  StateDotShape;
}

const PLAIN_LOOK: Omit<StateLook, 'tone'> = {
  dotShape: 'solid', dashed: false, struck: false, checked: false, pulsing: false
};
const NOT_STARTED_LOOK: Omit<StateLook, 'tone'> = { ...PLAIN_LOOK, dotShape: 'dashed-ring', dashed: true };
const UNDER_WAY_LOOK: Omit<StateLook, 'tone'> = { ...PLAIN_LOOK, pulsing: true };
/** Dashed, as everything that waits is: an interruption the user may resume is never the failure tone. */
const WAITING_LOOK: StateLook = { ...NOT_STARTED_LOOK, tone: 'neutral' };

/** A `Record` over every display state, so a new state does not compile until it has a look. */
const LOOK_OF_DISPLAY_STATE: Readonly<Record<JobDisplayState, StateLook>> = Object.freeze({
  'draft':            { ...NOT_STARTED_LOOK, tone: 'accent-outline' },
  'ready-for-review': { ...NOT_STARTED_LOOK, tone: 'accent-outline' },
  'committed':        { ...NOT_STARTED_LOOK, tone: 'neutral' },
  'in-progress':      { ...UNDER_WAY_LOOK, tone: 'accent' },
  'paused':           { ...PLAIN_LOOK, tone: 'neutral' },
  'in-review':        {
    ...PLAIN_LOOK, tone: 'info-outline', dotShape: 'ring', dashed: true
  },
  'reviewing': { ...UNDER_WAY_LOOK, tone: 'info' },
  're-review': { ...UNDER_WAY_LOOK, tone: 'info-deep' },
  'reviewed':  { ...PLAIN_LOOK, tone: 'success' },
  'delivered': { ...PLAIN_LOOK, tone: 'ink', checked: true },
  'abandoned': {
    ...PLAIN_LOOK, tone: 'muted', dotShape: 'ring', struck: true
  },
  'network-outage': WAITING_LOOK,
  'not-supervised': WAITING_LOOK,
});

/** A ticket nothing holds back: the accent tone, plain. */
const READY_LOOK: StateLook = Object.freeze({ ...PLAIN_LOOK, tone: 'accent' });

function lookOf(state: JobDisplayState): StateLook {
  return LOOK_OF_DISPLAY_STATE[state];
}

function toneOf(state: JobDisplayState): StateTone {
  return LOOK_OF_DISPLAY_STATE[state].tone;
}

/** The tone of a state that may be absent: no tone when there is no state, so the element reads the colours around it. */
function optionalToneOf(state: JobDisplayState | null | undefined): StateTone | undefined {
  return state === null || state === undefined ? undefined : LOOK_OF_DISPLAY_STATE[state].tone;
}

function dotOf(state: JobDisplayState): StateDotLook {
  const look = LOOK_OF_DISPLAY_STATE[state];
  return { tone: look.tone, shape: look.dotShape };
}

function pillLookOf(state: JobDisplayState): StatePillLook {
  const look = LOOK_OF_DISPLAY_STATE[state];
  return { dashed: look.dashed, struck: look.struck };
}

function tagLookOf(state: JobDisplayState): StateTagLook {
  const look = LOOK_OF_DISPLAY_STATE[state];
  return { tone: 'state', stateTone: look.tone, dotShape: look.dotShape };
}

function lookOfJobState(jobState: BoardJobState): StateLook {
  return lookOf(JobStateUtil.displayStateOf(jobState));
}

/** The look of a job as it waits or works: an interruption the board words by its cause looks as that wait. */
function lookOfJob(job: Pick<BoardJobDocument, 'state' | 'interruption'>): StateLook {
  return lookOf(JobStateUtil.displayStateOfJob(job));
}

function readyLook(): StateLook {
  return READY_LOOK;
}

export const StateToneUtil = Object.freeze({
  lookOf, toneOf, optionalToneOf, dotOf, pillLookOf, tagLookOf, lookOfJobState, lookOfJob, readyLook
});
