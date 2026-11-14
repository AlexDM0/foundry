/**
 * The state of Flint's mind, as plain data: where it lives, the behaviour it runs with that behaviour's own state, its gesture, emote and
 * sleep, and what waits for the director. `flint/SpriteMind.ts` changes it on each frame; nothing else keeps state between frames. The
 * mind sits below the catalogs of behaviours, so it carries an intent as the string of the fixed list that it is, and a behaviour's state
 * as that behaviour's own, known here only by its name.
 */
import type { MotionState }     from '../MotionPose.ts';
import type { Point }           from '../SpriteGeometry.ts';
import type { AttendantRoster } from '../attendants/AttendantRoster.ts';
import type { EmoteName }       from '../emotes/EmoteCatalog.ts';
import type { GestureIntent }   from '../gestures/GestureCatalog.ts';
import type { SleepState }      from '../sleep/SleepSequence.ts';
import type { WalkDirection }   from '../utils/WalkMotionUtil.ts';

/** An intent of `SPRITE_INTENTS` in `flint/SpriteHabitat.ts`; the sensors and `perform` check it before the mind sees it. */
export type IntentName = string;

/** A host's cue name, as `SpriteCue` in `flint/SpriteHabitat.ts`. */
export type CueName = string;

export interface ActiveGesture {
  /** The intent that started the gesture; it names the gesture and the form it runs. */
  readonly intent:                GestureIntent;
  readonly startedAtMilliseconds: number;
  /** The target of a gesture that aims, relative to the bottom tip, for Flint facing right. */
  readonly target:                Point | null;
  /** What the gesture's verdict answered at its moment; null before it. */
  readonly verdict:               boolean | null;
}

export interface ActiveEmote {
  readonly name:                  EmoteName;
  readonly startedAtMilliseconds: number;
}

/** The state of the running behaviour: its name in the behaviour catalog, and the fields that behaviour keeps. */
export interface BehaviourState {
  readonly name: string;
}

/** Where Flint stands, for the sensors that stop Flint while that place is off the screen; in the air while it is carried or stranded. */
export type StandingPlace =
  | { readonly kind: 'home' }
  | { readonly kind: 'habitat'; readonly habitatId: string }
  | { readonly kind: 'in-the-air' };

/** An intent that waits for the next frame, with the habitat that a visit goes to, chosen when the intent was given. */
export interface PendingIntent {
  readonly intent:        IntentName;
  readonly visitTargetId: string | null;
}

export interface SpriteMindState {
  readonly motion:                      MotionState;
  /** False until the first floor is seen, which places Flint in the middle of it. */
  readonly isPlaced:                    boolean;
  /** The habitat Flint lives in; null is its home. */
  readonly livesIn:                     string | null;
  readonly behaviour:                   BehaviourState;
  readonly gesture:                     ActiveGesture | null;
  readonly emote:                       ActiveEmote | null;
  readonly sleep:                       SleepState;
  readonly lastIntent:                  IntentName | null;
  readonly pendingIntent:               PendingIntent | null;
  /** The cues of the habitat Flint lives in that the director has not seen, the most recent last. */
  readonly directorInbox:               readonly CueName[];
  readonly recentCues:                  readonly CueName[];
  readonly lastDirectorAskMilliseconds: number;
  readonly quietSinceMilliseconds:      number;
  /** The intent the arrival itself just carried out (the wave of a pop-in), so an answer to `arrived` does not repeat it; null otherwise. */
  readonly arrivalGreeting:             IntentName | null;
  /** True until Flint first moves on its own, so a stored habitat that registers late can still take it in. */
  readonly mayRestoreStoredHabitat:     boolean;
  /** The seeded sequence a behaviour draws its choices from, so a spec sees the same run each time. */
  readonly sequenceSeed:                number;
  /** The walk the host holds through `steer`, as a held arrow key does; the rest follows it while it is not 0. */
  readonly steeredWalk:                 WalkDirection;
  /** What the host gave through `attend`; no behaviour, gesture, emote or sleep changes it. */
  readonly attendants:                  AttendantRoster;
}
