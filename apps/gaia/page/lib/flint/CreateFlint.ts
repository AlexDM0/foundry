/**
 * The core entry of the package: `createFlint` mounts Flint's overlay in the host's root and runs the frame loop, sense, mind, pose,
 * easing, draw. There is one Flint per document.
 */
import type { FrameSource }       from './FrameSource.ts';
import { animationFrameSourceOf } from './FrameSource.ts';
import { intendedGestureOf }      from './IntentMeaning.ts';
import { easedPoseOf }            from './PoseEasing.ts';
import type {
  Director,
  FlintConfinement,
  SpriteCue,
  SpriteHabitat,
  SpriteIntent,
  VisitTargetPolicy
} from './SpriteHabitat.ts';
import {
  FLINT_CONTRACT_VERSIONS,
  isFlintSteering,
  isSpriteAttendant,
  isSpriteIntent
} from './SpriteHabitat.ts';
import {
  INITIAL_MIND_STATE,
  mindStateAfterDirectorAsked,
  mindStateAfterFrame,
  mindStateAttended,
  mindStateWithPendingIntent,
  standingPlaceOf,
  targetPoseOfMind
} from './SpriteMind.ts';
import type { Pose }                                                        from './SpritePose.ts';
import type { DrawingConfinement }                                          from './SpriteRenderer.ts';
import { createSpriteRenderer }                                             from './SpriteRenderer.ts';
import { createSpriteSensors }                                              from './SpriteSensors.ts';
import { behaviourDefinitionOf }                                            from './behaviours/BehaviourCatalog.ts';
import { MAXIMUM_FRAME_STEP_MILLISECONDS }                                  from './constants/Easing.ts';
import { DEFAULT_PIXELS_FOR_ONE_UNIT, OVERLAY, REDUCED_MOTION_MEDIA_QUERY } from './constants/Overlay.ts';
import { FLINT_COLOURS }                                                    from './constants/Palette.ts';
import type { FlintColourRole, FlintTheme }                                 from './constants/Palette.ts';
import type { BrainSession }                                                from './mind/DirectorAsk.ts';
import {
  brainAnswers,
  brainSessionAt,
  brainSessionOf,
  directorIsDue,
  perceptionDigestOf
} from './mind/DirectorAsk.ts';
import { elementUseOf, intentIsRefused }       from './mind/IntentApplication.ts';
import type { SpriteMindState, StandingPlace } from './mind/MindState.ts';
import type { Perception }                     from './mind/Perception.ts';
import { ruleDirectorIntentOf }                from './mind/RuleDirector.ts';
import { mindStateSteered }                    from './mind/Steering.ts';
import { PlaceUtil }                           from './mind/utils/PlaceUtil.ts';
import { StoredHabitatUtil }                   from './mind/utils/StoredHabitatUtil.ts';

/**
 * The host's store of the habitat Flint lives in. The value is the package's own (`flint/mind/utils/StoredHabitatUtil.ts`): it carries
 * `FLINT_CONTRACT_VERSIONS.storedHabitat`, and the host stores it as it is.
 */
export interface FlintStorage {
  readonly readHabitatKind:  () => string | null;
  readonly writeHabitatKind: (kind: string) => void;
}

export interface FlintOptions {
  /** Flint draws its overlay in this element. */
  readonly root:              HTMLElement;
  /** The corner where Flint lives and sleeps; it stands on the bottom edge of this element's box. */
  readonly home:              HTMLElement;
  /** The size of Flint; the default is 1. */
  readonly pixelsForOneUnit?: number;
  /** The default is the browser's animation frames; a spec gives its own. */
  readonly frameSource?:      FrameSource;
  /** The default stores nothing. */
  readonly storage?:          FlintStorage;
  /** The default is the browser's reduced-motion media query. */
  readonly reducedMotion?:    () => boolean;
  /** Colours by role; the default is the palette of `flint/constants/Palette.ts`, which a host can also change by custom property. */
  readonly theme?:            Partial<FlintTheme>;
  /** Which habitat is "the component the user works in"; the default is the habitat last focused or clicked. */
  readonly visitTarget?:      VisitTargetPolicy;
  /** Where Flint may be (`FlintConfinement` in `flint/SpriteHabitat.ts`); the default is `roams-the-page`. */
  readonly confinement?:      FlintConfinement;
}

/**
 * `unknown-intent` when the value is not on the fixed intent list; `needs-an-element` for a behaviour that takes one (`lay-bar-along`)
 * given none; `already-running` for a behaviour that runs one at a time (`chase-bug`) while it runs or its intent waits; `outside-its-box`
 * when a Flint that stays in its box is given an element outside the element of the box it lives in; `destroyed` after `destroy`. A
 * refused intent changes nothing.
 */
export type PerformVerdict = 'performed' | 'unknown-intent' | 'needs-an-element' | 'already-running' | 'outside-its-box' | 'destroyed';

/** `unknown-steering` when the value is not one of `FLINT_STEERINGS`, `destroyed` after `destroy`. */
export type SteerVerdict = 'steered' | 'unknown-steering' | 'destroyed';

/** `unknown-attendant` when the value is not one of `SPRITE_ATTENDANTS`, `destroyed` after `destroy`. */
export type AttendVerdict = 'attended' | 'unknown-attendant' | 'destroyed';

export interface FlintHandle {
  readonly contractVersion: number;
  /** Returns the function that removes the habitat. Flint ignores a habitat smaller than 50 by 50 pixels. */
  readonly registerHabitat: (element: HTMLElement, habitat: SpriteHabitat) => () => void;
  /** A cue on a habitat's element or an element inside it; any cue wakes Flint, and the habitat Flint lives in answers its own. */
  readonly cue:             (element: HTMLElement, cueName: SpriteCue) => void;
  /**
   * Carries out an intent on the next frame, as a director's answer is; a reflex, a visit or a landing that runs then drops it. A `visit`
   * goes to the habitat the visit-target policy picks now. A gesture that aims, such as `grab`, given an element turns Flint to it and
   * reaches for its centre on each frame, also while it moves. A behaviour that takes an element (`chase-bug`, `lay-bar-along`) reads its
   * box on each frame, and ends once it is gone from the page.
   */
  readonly perform:         (intent: string, toward?: Element) => PerformVerdict;
  /** Steers Flint on the next frames, as a held arrow key or the space bar does; a visit, a drag or a landing ignores it. */
  readonly steer:           (steering: string) => SteerVerdict;
  /**
   * The kind of the habitat Flint lives in now, as its host registered it; null at home, before its first frame and after `destroy`. A
   * host reads it to start a behaviour on the floor of its own habitat, or to leave an answer to a habitat Flint lives in.
   */
  readonly livesIn:         () => string | null;
  /**
   * Sets how many members of an attendant of `SPRITE_ATTENDANTS` stay with Flint, held between 0 and its maximum; 0 takes it away. No
   * gesture, emote, walk, jump, drag or sleep removes one.
   */
  readonly attend:          (attendant: string, count: number) => AttendVerdict;
  /** A brain answers in place of the rule director, except while Flint sleeps, until this much frame time has passed or `stopBrain`. */
  readonly startBrain:      (director: Director, maximumMilliseconds: number) => void;
  readonly stopBrain:       () => void;
  readonly destroy:         () => void;
}

export type FlintRefusalReason = 'second-flint-in-document' | 'no-window';

export class FlintRefusal extends Error {
  public readonly reason: FlintRefusalReason;

  public constructor(reason: FlintRefusalReason) {
    super(reason);
    this.name = 'FlintRefusal';
    this.reason = reason;
  }
}

/** What the frame loop keeps between frames; the mind's own state is `mind`, the page's is in the sensors. */
interface FlintRuntime {
  mind:                    SpriteMindState;
  drawnPose:               Pose | null;
  lastElapsedMilliseconds: number | null;
  brain:                   BrainSession | null;
  /** The number of the brain's question whose answer is awaited; while one is, the director is not asked again. */
  awaitedAskNumber:        number | null;
  askCount:                number;
  isDestroyed:             boolean;
  /** The element a host gave with its intent; it is let go once no aimed gesture or behaviour that takes it runs, and no intent waits. */
  targetElement:           Element | null;
}

const NO_STORAGE: FlintStorage = Object.freeze({ readHabitatKind: () => null, writeHabitatKind: () => undefined });

function mindHoldsItsElement(mind: SpriteMindState): boolean {
  const gestureAims = mind.gesture !== null && intendedGestureOf(mind.gesture.intent).definition.aimsAtElement;
  return gestureAims || behaviourDefinitionOf(mind.behaviour.name).element !== 'none' || mind.pendingIntent !== null;
}

const DRAWN_EVERYWHERE: DrawingConfinement = Object.freeze({ kind: 'everywhere' });

const DRAWN_NOWHERE: DrawingConfinement = Object.freeze({ kind: 'nowhere' });

/** The box of the place Flint stands in on this frame: a habitat, also one it visits, or else its home. */
function drawingConfinementAt(place: StandingPlace, perception: Perception): DrawingConfinement {
  const box = place.kind === 'habitat' ? PlaceUtil.habitatById(perception, place.habitatId)?.box ?? null : perception.home;
  return box === null ? DRAWN_NOWHERE : { kind: 'inside', box };
}

function placeOverlay(overlay: SVGSVGElement, theme: Partial<FlintTheme>): void {
  const { style } = overlay;
  style.position = 'fixed';
  style.left = '0';
  style.top = '0';
  style.width = '100%';
  style.height = '100%';
  style.overflow = 'visible';
  style.pointerEvents = 'none';
  style.zIndex = String(OVERLAY.STACK_LEVEL);
  for (const [role, colour] of Object.entries(theme) as [FlintColourRole, string | undefined][]) {
    if (colour !== undefined && Object.hasOwn(FLINT_COLOURS, role)) style.setProperty(FLINT_COLOURS[role].property, colour);
  }
}

export function createFlint(options: FlintOptions): FlintHandle {
  const document = options.root.ownerDocument;
  const view = document.defaultView;
  if (document.querySelector(`[${OVERLAY.MARKER_ATTRIBUTE}]`) !== null) throw new FlintRefusal('second-flint-in-document');
  const frameSource = options.frameSource ?? (view === null ? null : animationFrameSourceOf(view));
  if (frameSource === null) throw new FlintRefusal('no-window');
  const pixelsForOneUnit = options.pixelsForOneUnit ?? DEFAULT_PIXELS_FOR_ONE_UNIT;
  const confinement = options.confinement ?? 'roams-the-page';
  const staysInItsBox = confinement === 'stays-in-its-box';
  const renderer = createSpriteRenderer({ document, pixelsForOneUnit, bodyTakesPointer: !staysInItsBox });
  placeOverlay(renderer.element, options.theme ?? {});
  options.root.appendChild(renderer.element);
  const sensors = createSpriteSensors({
    document,
    overlay:     renderer.element,
    bodyElement: renderer.bodyElement,
    home:        options.home,
    pixelsForOneUnit,
    visitTarget: options.visitTarget ?? 'last-focused-or-clicked',
    confinement,
  });

  const reducedMotionQuery = options.reducedMotion === undefined ? view?.matchMedia(REDUCED_MOTION_MEDIA_QUERY) ?? null : null;
  const reducedMotion = options.reducedMotion ?? (() => reducedMotionQuery?.matches ?? false);
  const storage = options.storage ?? NO_STORAGE;
  const storedHabitatKind = StoredHabitatUtil.storedHabitatOf(storage.readHabitatKind())?.kind ?? null;
  const runtime: FlintRuntime = {
    mind:                    INITIAL_MIND_STATE,
    drawnPose:               null,
    lastElapsedMilliseconds: null,
    brain:                   null,
    awaitedAskNumber:        null,
    askCount:                0,
    isDestroyed:             false,
    targetElement:           null,
  };

  const giveIntent = (intent: SpriteIntent, visitTargetId: string | null): void => {
    if (!runtime.isDestroyed) runtime.mind = mindStateWithPendingIntent(runtime.mind, { intent, visitTargetId });
  };

  /** The element of the box Flint lives in: its home, or the habitat's element; null while that habitat is no longer registered. */
  const elementWhereFlintLives = (): Element | null => {
    const { livesIn } = runtime.mind;
    return livesIn === null ? options.home : sensors.registeredOf(livesIn)?.element ?? null;
  };

  const rememberWhereFlintLives = (livesIn: string | null): void => {
    const kind = livesIn === null ? null : sensors.registeredOf(livesIn)?.habitat.kind ?? null;
    storage.writeHabitatKind(StoredHabitatUtil.storedValueOf(kind));
  };

  /** The rule director answers at once; a brain's answer may come later, and is refused for the rule director's when it is no intent. */
  const askDirector = (elapsedMilliseconds: number): void => {
    const { mind, brain } = runtime;
    const visitTargetId = sensors.visitTargetIdFor(mind.livesIn);
    const registered = mind.livesIn === null ? null : sensors.registeredOf(mind.livesIn);
    const asksBrain = brain !== null && brainAnswers(brain, mind);
    const digest = perceptionDigestOf({
      state:           mind,
      habitat:         registered?.habitat ?? null,
      content:         asksBrain ? registered?.habitat.contentFor?.() ?? null : null,
      visitTargetKind: visitTargetId === null ? null : sensors.registeredOf(visitTargetId)?.habitat.kind ?? null,
      copyIsOffered:   (registered?.habitat.copyTargetFor?.() ?? null) !== null,
      elapsedMilliseconds,
    });
    runtime.mind = mindStateAfterDirectorAsked(mind, elapsedMilliseconds);
    if (!asksBrain) {
      giveIntent(ruleDirectorIntentOf(digest), visitTargetId);
      return;
    }
    const askNumber = ++runtime.askCount;
    runtime.awaitedAskNumber = askNumber;
    const settle = (answer: unknown): void => {
      if (runtime.awaitedAskNumber !== askNumber) return;
      runtime.awaitedAskNumber = null;
      giveIntent(typeof answer === 'string' && isSpriteIntent(answer) ? answer : ruleDirectorIntentOf(digest), visitTargetId);
    };
    try {
      const answer = brain.director.nextIntent(digest);
      if (typeof answer === 'string') settle(answer);
      else Promise.resolve(answer).then(settle, () => settle(null));
    } catch {
      settle(null);
    }
  };

  const onFrame = (elapsedMilliseconds: number): void => {
    const deltaMilliseconds = Math.min(MAXIMUM_FRAME_STEP_MILLISECONDS, Math.max(0, elapsedMilliseconds - (runtime.lastElapsedMilliseconds ?? elapsedMilliseconds)));
    runtime.lastElapsedMilliseconds = elapsedMilliseconds;
    const brain = brainSessionAt(runtime.brain, elapsedMilliseconds);
    if (brain !== runtime.brain) {
      runtime.brain = brain;
      runtime.awaitedAskNumber = null;
    }
    const isPaused = sensors.isPaused(standingPlaceOf(runtime.mind));
    // A paused Flint is hidden, so it is never left drawn, and pressable, over the page where its place used to be.
    renderer.element.style.visibility = isPaused ? 'hidden' : '';
    if (isPaused) return;
    const isReducedMotion = reducedMotion();
    const before = runtime.mind;
    const perceived = sensors.perceive({
      copyTargetHabitatId: before.livesIn,
      storedHabitatKind:   before.mayRestoreStoredHabitat ? storedHabitatKind : null,
      reducedMotion:       isReducedMotion,
      targetElement:       runtime.targetElement,
    });
    const perception = staysInItsBox ? { ...perceived, cues: perceived.cues.filter((heard) => heard.habitatId === before.livesIn) } : perceived;
    runtime.mind = mindStateAfterFrame(before, perception, { elapsedMilliseconds, deltaMilliseconds });
    if (!mindHoldsItsElement(runtime.mind)) runtime.targetElement = null;
    if (runtime.mind.livesIn !== before.livesIn) rememberWhereFlintLives(runtime.mind.livesIn);
    if (runtime.awaitedAskNumber === null && directorIsDue(runtime.mind, elapsedMilliseconds)) askDirector(elapsedMilliseconds);
    const targetPose = targetPoseOfMind(runtime.mind, elapsedMilliseconds, isReducedMotion);
    runtime.drawnPose = runtime.drawnPose === null ? targetPose : easedPoseOf(runtime.drawnPose, targetPose, deltaMilliseconds);
    renderer.confine(staysInItsBox ? drawingConfinementAt(standingPlaceOf(runtime.mind), perception) : DRAWN_EVERYWHERE);
    renderer.draw(runtime.drawnPose);
  };
  const stopFrames = frameSource(onFrame);

  return {
    contractVersion: FLINT_CONTRACT_VERSIONS.spriteHabitat,
    registerHabitat: (element, habitat) => (runtime.isDestroyed ? () => undefined : sensors.registerHabitat(element, habitat)),
    cue:             (element, cue) => {
      if (!runtime.isDestroyed) sensors.cue(element, cue);
    },
    perform: (intent, toward) => {
      if (runtime.isDestroyed) return 'destroyed';
      if (!isSpriteIntent(intent)) return 'unknown-intent';
      const elementUse = elementUseOf(intent);
      if (elementUse === 'required' && toward === undefined) return 'needs-an-element';
      if (intentIsRefused(runtime.mind, intent)) return 'already-running';
      if (staysInItsBox && elementUse !== 'none' && toward !== undefined && elementWhereFlintLives()?.contains(toward) !== true) return 'outside-its-box';
      giveIntent(intent, sensors.visitTargetIdFor(runtime.mind.livesIn));
      runtime.targetElement = elementUse === 'none' ? null : toward ?? null;
      return 'performed';
    },
    steer: (steering) => {
      if (runtime.isDestroyed) return 'destroyed';
      if (!isFlintSteering(steering)) return 'unknown-steering';
      runtime.mind = mindStateSteered(runtime.mind, steering, runtime.lastElapsedMilliseconds ?? 0, reducedMotion());
      return 'steered';
    },
    livesIn: () => {
      const { livesIn } = runtime.mind;
      if (runtime.isDestroyed || livesIn === null) return null;
      return sensors.registeredOf(livesIn)?.habitat.kind ?? null;
    },
    attend: (attendant, count) => {
      if (runtime.isDestroyed) return 'destroyed';
      if (!isSpriteAttendant(attendant)) return 'unknown-attendant';
      runtime.mind = mindStateAttended(runtime.mind, attendant, count, runtime.lastElapsedMilliseconds ?? 0);
      return 'attended';
    },
    startBrain: (director, maximumMilliseconds) => {
      if (runtime.isDestroyed) return;
      runtime.brain = brainSessionOf(director, maximumMilliseconds, runtime.lastElapsedMilliseconds ?? 0);
      runtime.awaitedAskNumber = null;
    },
    stopBrain: () => {
      runtime.brain = null;
      runtime.awaitedAskNumber = null;
    },
    destroy: () => {
      if (runtime.isDestroyed) return;
      runtime.isDestroyed = true;
      stopFrames();
      runtime.brain = null;
      runtime.awaitedAskNumber = null;
      sensors.destroy();
      renderer.element.remove();
    },
  };
}
