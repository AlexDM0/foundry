/**
 * The contract of a behaviour: how
 * it starts, what it does after each frame, and its part of the target pose, with its intents and what the mind must know of it. The mind
 * reaches a behaviour only through `flint/behaviours/BehaviourCatalog.ts`, as it reaches a gesture, so it names none. A behaviour is pure:
 * it changes the mind's state and gives a pose part, and the pose stage eases.
 */
import type { BehaviourPart }                                  from '../mind/BehaviourPart.ts';
import type { BehaviourState, SpriteMindState, StandingPlace } from '../mind/MindState.ts';
import type { FrameTime, Perception }                          from '../mind/Perception.ts';

/** What a behaviour starts from: the frame's perception and time, and the habitat a visit goes to, chosen when the intent was given. */
export interface BehaviourStart {
  readonly perception:          Perception;
  readonly elapsedMilliseconds: number;
  readonly visitTargetId:       string | null;
}

export interface BehaviourPartInput {
  readonly state:               SpriteMindState;
  readonly elapsedMilliseconds: number;
  readonly reducedMotion:       boolean;
}

/**
 * What starts a behaviour besides its intents. Flint rests in the `rest`, and every other behaviour ends in it; a drag starts the `drag`
 * behaviour wherever Flint is, and a click starts the `click` behaviour where the running behaviour takes clicks. One behaviour of the
 * catalog has each role.
 */
export type BehaviourRole = 'rest' | 'drag' | 'click' | null;

/**
 * What an intent given while the behaviour runs does: it is `dropped`, since the behaviour finishes first; it is `laid-over-it`, a gesture
 * or an emote over the behaviour, while the intent of another behaviour replaces it; a gesture's intent ends it (`gesture-ends-it`); or
 * every intent ends it (`ends-it`). An intent that ends a behaviour starts from the rest.
 */
export type IntentWhileRunning = 'dropped' | 'laid-over-it' | 'gesture-ends-it' | 'ends-it';

/** Whether `perform(intent, element)` gives the behaviour an element: never, when the host has one, or always. */
export type ElementUse = 'none' | 'optional' | 'required';

/** What the rule director knows when no cue is new; `PerceptionDigest` of `flint/SpriteHabitat.ts` holds these facts. */
export interface NothingNewFacts {
  readonly isAsleep:          boolean;
  readonly visitTargetKind:   string | null;
  readonly copyIsOffered:     boolean;
  readonly quietMilliseconds: number;
}

export interface BehaviourDefinition<Name extends string = string, Intent extends string = string, State extends BehaviourState = BehaviourState> {
  /** The name of its folder, and of its state. */
  readonly name:                   Name;
  /** The intents on the fixed list that start it; a behaviour that a reflex or another behaviour starts has none. */
  readonly intents:                readonly Intent[];
  readonly role:                   BehaviourRole;
  readonly intentWhileRunning:     IntentWhileRunning;
  /** True refuses its own intent while it runs or waits: one at a time. */
  readonly refusesItsOwnIntent:    boolean;
  /** True when its intent is what a director answers while nothing happens, so giving it does not end the quiet. */
  readonly intentKeepsTheQuiet:    boolean;
  /** True asks the director every few seconds while it runs; it then takes the director's answer as any intent. */
  readonly asksDirector:           boolean;
  /** True lets a click start the click behaviour while it runs. */
  readonly takesClicks:            boolean;
  /** True lets the host's `steer` take Flint while it runs; the steered Flint rests. */
  readonly takesSteering:          boolean;
  readonly element:                ElementUse;
  /** True when it aims the gestures it starts itself, so a host's element does not turn them. */
  readonly aimsItsOwnGestures:     boolean;
  /** The rule director's answer when no cue is new: the first behaviour of the catalog that answers yes, with its first intent. */
  readonly chosenWhenNothingIsNew: ((facts: NothingNewFacts) => boolean) | null;
  /** The rest's own state at a moment, when Flint comes to rest; null for every behaviour but the rest. */
  readonly atRest:                 ((elapsedMilliseconds: number) => State) | null;
  /** Starts it by its intent or its role; null for a behaviour that only another behaviour starts, through that behaviour's own function. */
  readonly started:                ((state: SpriteMindState, start: BehaviourStart) => SpriteMindState) | null;
  /** Where Flint stands while it runs, when that is not the place it lives: away on a habitat it goes to, or in the air. */
  standingPlaceOf(own: State): StandingPlace | null;
  afterFrame(state: SpriteMindState, own: State, perception: Perception, time: FrameTime): SpriteMindState;
  /** What a drop of the user's drag does while it runs; only the drag behaviour answers it. */
  droppedOn?(state: SpriteMindState, own: State, habitatId: string | null, perception: Perception, elapsedMilliseconds: number): SpriteMindState;
  partOf(own: State, input: BehaviourPartInput): BehaviourPart;
}

/** Keeps the literal name and intents of a behaviour definition, so the catalog can derive the intent list from it. */
export function behaviourDefinition<const Name extends string, const Intent extends string, State extends BehaviourState & { readonly name: Name }>(
  definition: BehaviourDefinition<Name, Intent, State>,
): BehaviourDefinition<Name, Intent, State> {
  return Object.freeze(definition);
}
