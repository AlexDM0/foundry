/**
 * Implements `02-animations.md`, "Sleep": the sleep level, the landing hover and back lean, the breath, the glow, and the wake. The mind
 * keeps a `SleepState` and changes it only through the transitions here, so this module owns the state's shape. The level is a pure
 * function of the state and the time: it rises at the falling-asleep rate and drops at the waking rate.
 */
import { easingFractionOf }                                 from '../PoseEasing.ts';
import type { EmberPose, PosePart }                         from '../SpritePose.ts';
import { EASING_RATES_PER_SECOND, MILLISECONDS_PER_SECOND } from '../constants/Easing.ts';
import { SLEEP_LEVELS, SLEEP_POSE }                         from '../constants/SleepMotion.ts';
import type { FadingEmbers }                                from './Embers.ts';
import { emberFadeAt, embersOf }                            from './Embers.ts';

/**
 * `levelAtStart` is the level when the phase began. `fadingEmbers` are the embers of an earlier sleep that still fade out; a sleep's own
 * embers start from its `sinceMilliseconds` and its `levelAtStart`.
 */
export type SleepState =
  | { readonly phase: 'awake' }
  | { readonly phase: 'asleep'; readonly sinceMilliseconds: number; readonly levelAtStart: number; readonly fadingEmbers: FadingEmbers | null }
  | { readonly phase: 'waking'; readonly sinceMilliseconds: number; readonly levelAtStart: number; readonly fadingEmbers: FadingEmbers | null };

export type AsleepState = Extract<SleepState, { readonly phase: 'asleep' }>;

export const SLEEP_AWAKE: SleepState = Object.freeze({ phase: 'awake' });

export interface SleepInput {
  readonly state:               SleepState;
  /** The frame source's elapsed time; the handoff's `t`. */
  readonly elapsedMilliseconds: number;
  /** The eye height of the layers below, which the closing eyes follow: height + (1.6 - height) × level. */
  readonly incomingEyeHeight:   number;
  /** No breath and no embers: Flint lies still, and the glow holds its mean brightness. */
  readonly reducedMotion:       boolean;
}

/** The sleep level, from 0 awake to 1 fully asleep, at this time. */
export function sleepLevelAt(state: SleepState, elapsedMilliseconds: number): number {
  if (state.phase === 'awake') return 0;
  const sincePhaseStart = Math.max(0, elapsedMilliseconds - state.sinceMilliseconds);
  if (state.phase === 'asleep') {
    const risen = easingFractionOf(EASING_RATES_PER_SECOND.FALLING_ASLEEP, sincePhaseStart);
    return state.levelAtStart + ((1 - state.levelAtStart) * risen);
  }
  return state.levelAtStart * (1 - easingFractionOf(EASING_RATES_PER_SECOND.WAKING, sincePhaseStart));
}

/** Flint lies down; a Flint that already sleeps keeps its sleep, and embers of an earlier sleep go on fading. */
export function sleepStateFallingAsleep(state: SleepState, elapsedMilliseconds: number): AsleepState {
  if (state.phase === 'asleep') return state;
  return {
    phase:             'asleep',
    sinceMilliseconds: elapsedMilliseconds,
    levelAtStart:      sleepLevelAt(state, elapsedMilliseconds),
    fadingEmbers:      state.phase === 'waking' ? state.fadingEmbers : null,
  };
}

/**
 * The moment the embers of this sleep start to rise: when the level passes `SLEEP_LEVELS.EMBERS_START_LEVEL`. Solved from the level's
 * curve, so the moment does not depend on when frames come.
 */
export function embersStartOf(state: AsleepState): number {
  const remainingAtStart = 1 - state.levelAtStart;
  const remainingAtEmbers = 1 - SLEEP_LEVELS.EMBERS_START_LEVEL;
  if (remainingAtStart <= remainingAtEmbers) return state.sinceMilliseconds;
  const seconds = Math.log(remainingAtStart / remainingAtEmbers) / EASING_RATES_PER_SECOND.FALLING_ASLEEP;
  return state.sinceMilliseconds + (seconds * MILLISECONDS_PER_SECOND);
}

/** Flint wakes: a cue, a click, a drag, a gesture or an emote ends sleep, and the embers in the air fade out. An awake Flint stays awake. */
export function sleepStateWaking(state: SleepState, elapsedMilliseconds: number): SleepState {
  if (state.phase !== 'asleep') return state;
  const embersStartedAt = embersStartOf(state);
  return {
    phase:             'waking',
    sinceMilliseconds: elapsedMilliseconds,
    levelAtStart:      sleepLevelAt(state, elapsedMilliseconds),
    fadingEmbers:      embersStartedAt <= elapsedMilliseconds
      ? { risingSinceMilliseconds: embersStartedAt, fadingSinceMilliseconds: elapsedMilliseconds }
      : state.fadingEmbers,
  };
}

/** The state after this frame: a wake that has run its course becomes awake, and embers that have faded out are dropped. */
export function sleepStateAfterFrame(state: SleepState, elapsedMilliseconds: number): SleepState {
  if (state.phase === 'awake') return state;
  const fadingEmbersAreGone = state.fadingEmbers !== null && emberFadeAt(state.fadingEmbers, elapsedMilliseconds) <= SLEEP_LEVELS.SETTLED_LEVEL;
  const fadingEmbers = fadingEmbersAreGone ? null : state.fadingEmbers;
  if (state.phase === 'waking' && fadingEmbers === null && sleepLevelAt(state, elapsedMilliseconds) <= SLEEP_LEVELS.SETTLED_LEVEL) return SLEEP_AWAKE;
  return fadingEmbersAreGone ? { ...state, fadingEmbers } : state;
}

/** A sleep's own embers once they rise, at full opacity; before that, the embers of an earlier sleep while they fade. */
function visibleEmbersOf(state: Exclude<SleepState, { readonly phase: 'awake' }>, elapsedMilliseconds: number): EmberPose[] {
  if (state.phase === 'asleep') {
    const ownEmbersStart = embersStartOf(state);
    if (ownEmbersStart <= elapsedMilliseconds) return embersOf(ownEmbersStart, 1, elapsedMilliseconds);
  }
  if (state.fadingEmbers === null) return [];
  return embersOf(state.fadingEmbers.risingSinceMilliseconds, emberFadeAt(state.fadingEmbers, elapsedMilliseconds), elapsedMilliseconds);
}

export function sleepIsActive(state: SleepState): boolean {
  return state.phase !== 'awake';
}

/**
 * Sleep's part of the target pose. While asleep the hover and the lean change at once and the body easing makes the move; the eyes, the
 * breath and the glow follow the level, also while Flint wakes.
 */
export function sleepPartOf(input: SleepInput): PosePart | null {
  const {
    state, elapsedMilliseconds, incomingEyeHeight, reducedMotion
  } = input;
  if (state.phase === 'awake') return null;
  const level = sleepLevelAt(state, elapsedMilliseconds);
  const breath = reducedMotion ? 0 : Math.sin(elapsedMilliseconds / SLEEP_POSE.BREATH_DIVISOR_MILLISECONDS);
  const breathing = {
    widthFactor:  1 + (SLEEP_POSE.BREATH_WIDTH_FACTOR * breath * level),
    heightFactor: 1 - (SLEEP_POSE.BREATH_HEIGHT_FACTOR * breath * level),
  };
  const lyingDown = state.phase === 'asleep' ? { hover: SLEEP_POSE.HOVER_UNITS, leanDegrees: SLEEP_POSE.LEAN_DEGREES } : {};
  const brightness = SLEEP_POSE.GLOW_BASE_OPACITY + (SLEEP_POSE.GLOW_BREATH_OPACITY * ((1 + breath) / 2));
  return {
    body:  { ...breathing, ...lyingDown },
    eyes:  { height: incomingEyeHeight + ((SLEEP_POSE.CLOSED_EYE_HEIGHT_UNITS - incomingEyeHeight) * level) },
    sleep: { glowOpacity: level * brightness, embers: reducedMotion ? [] : visibleEmbersOf(state, elapsedMilliseconds) },
  };
}
