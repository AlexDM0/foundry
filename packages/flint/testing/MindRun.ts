/**
 * Drives the pure mind frame by frame for a spec, with no page: a base perception that holds until a spec changes it, extras (a cue, a
 * click, a drop) for one frame only, and a frame length, so no spec waits on real time.
 */
import type { SpriteIntent }                                                   from '../SpriteHabitat.ts';
import { INITIAL_MIND_STATE, mindStateAfterFrame, mindStateWithPendingIntent } from '../SpriteMind.ts';
import type { SpriteMindState }                                                from '../mind/MindState.ts';
import type { PerceivedHabitat, Perception, PlaceBox }                         from '../mind/Perception.ts';
import { NO_TARGET }                                                           from '../mind/Perception.ts';

export const FRAME_MILLISECONDS = 16;

/** A home in the bottom right of a 1200 unit wide page, and a chat to its left; both roomy. */
export const HOME_BOX: PlaceBox = Object.freeze({
  leftX: 900, rightX: 1100, topY: 600, floorY: 700,
});
export const CHAT_BOX: PlaceBox = Object.freeze({
  leftX: 200, rightX: 600, topY: 200, floorY: 500,
});
export const AGENTS_BOX: PlaceBox = Object.freeze({
  leftX: 650, rightX: 850, topY: 200, floorY: 500,
});

export function habitatOf(id: string, box: PlaceBox, changes: Partial<PerceivedHabitat> = {}): PerceivedHabitat {
  return {
    id, kind: id, box, isRoomy: true, copyTarget: null, keepsFlintInside: false, ...changes,
  };
}

export const CHAT = habitatOf('chat', CHAT_BOX);
export const AGENTS = habitatOf('agents', AGENTS_BOX);

export function perceptionOf(changes: Partial<Perception> = {}): Perception {
  return {
    home:            HOME_BOX,
    habitats:        [CHAT, AGENTS],
    pointer:         null,
    happenings:      [],
    cues:            [],
    storedHabitatId: null,
    stageWidthUnits: 1200,
    target:          NO_TARGET,
    reducedMotion:   false,
    ...changes,
  };
}

export interface MindRun {
  readonly state:               () => SpriteMindState;
  readonly elapsedMilliseconds: () => number;
  /** The base perception from now on. */
  readonly perceive:            (changes: Partial<Perception>) => void;
  /** One frame, with these changes for this frame only. */
  readonly frame:               (changes?: Partial<Perception>) => SpriteMindState;
  /** Frames of the frame length for at least this long. */
  readonly runFor:              (milliseconds: number) => SpriteMindState;
  /** Frames until the state answers yes, failing after the limit so a spec never hangs. */
  readonly runUntil:            (isDone: (state: SpriteMindState) => boolean, limitMilliseconds?: number) => SpriteMindState;
  readonly give:                (intent: SpriteIntent, visitTargetId?: string | null) => void;
  readonly change:              (changeState: (state: SpriteMindState) => SpriteMindState) => void;
}

const RUN_LIMIT_MILLISECONDS = 30000;

export function createMindRun(initial: SpriteMindState = INITIAL_MIND_STATE, basePerception: Perception = perceptionOf()): MindRun {
  let state = initial;
  let elapsedMilliseconds = 0;
  let base = basePerception;
  const frame = (changes: Partial<Perception> = {}): SpriteMindState => {
    elapsedMilliseconds += FRAME_MILLISECONDS;
    state = mindStateAfterFrame(state, { ...base, ...changes }, { elapsedMilliseconds, deltaMilliseconds: FRAME_MILLISECONDS });
    return state;
  };
  return {
    state:               () => state,
    elapsedMilliseconds: () => elapsedMilliseconds,
    perceive:            (changes) => {
      base = { ...base, ...changes };
    },
    frame,
    runFor: (milliseconds) => {
      const until = elapsedMilliseconds + milliseconds;
      while (elapsedMilliseconds < until) frame();
      return state;
    },
    runUntil: (isDone, limitMilliseconds = RUN_LIMIT_MILLISECONDS) => {
      const until = elapsedMilliseconds + limitMilliseconds;
      while (!isDone(state)) {
        if (elapsedMilliseconds >= until) throw new Error(`the state did not come within ${limitMilliseconds} ms`);
        frame();
      }
      return state;
    },
    give: (intent, visitTargetId = null) => {
      state = mindStateWithPendingIntent(state, { intent, visitTargetId });
    },
    change: (changeState) => {
      state = changeState(state);
    },
  };
}
