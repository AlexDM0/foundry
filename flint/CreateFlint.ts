/**
 * The core entry of the package: `createFlint` mounts Flint's overlay in the host's root and runs the frame loop, sense, mind, pose,
 * easing, draw (`03-behaviour-and-architecture.md`, "The pattern"). There is one Flint per document.
 */
import type { FrameSource }       from './FrameSource.ts';
import { animationFrameSourceOf } from './FrameSource.ts';
import { easedPoseOf }            from './PoseEasing.ts';
import type {
  Director,
  SpriteCue,
  SpriteHabitat,
  SpriteIntent,
  VisitTargetPolicy
} from './SpriteHabitat.ts';
import { FLINT_CONTRACT_VERSIONS, isFlintSteering, isSpriteIntent } from './SpriteHabitat.ts';
import {
  mindStateAfterDirectorAsked,
  mindStateAfterFrame,
  mindStateWithPendingIntent,
  standingPlaceOf,
  targetPoseOfMind
} from './SpriteMind.ts';
import type { Pose }                                                        from './SpritePose.ts';
import { createSpriteRenderer }                                             from './SpriteRenderer.ts';
import { createSpriteSensors }                                              from './SpriteSensors.ts';
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
import type { SpriteMindState } from './mind/MindState.ts';
import { INITIAL_MIND_STATE }   from './mind/MindState.ts';
import { ruleDirectorIntentOf } from './mind/RuleDirector.ts';
import { mindStateSteered }     from './mind/Steering.ts';
import { StoredHabitatUtil }    from './mind/utils/StoredHabitatUtil.ts';

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
}

/** `unknown-intent` when the value is not on the fixed intent list, `destroyed` after `destroy`. */
export type PerformVerdict = 'performed' | 'unknown-intent' | 'destroyed';

/** `unknown-steering` when the value is not one of `FLINT_STEERINGS`, `destroyed` after `destroy`. */
export type SteerVerdict = 'steered' | 'unknown-steering' | 'destroyed';

export interface FlintHandle {
  readonly contractVersion: number;
  /** Returns the function that removes the habitat. Flint ignores a habitat smaller than 100 by 100 pixels. */
  readonly registerHabitat: (element: HTMLElement, habitat: SpriteHabitat) => () => void;
  /** A cue on a habitat's element or an element inside it; any cue wakes Flint, and the habitat Flint lives in answers its own. */
  readonly cue:             (element: HTMLElement, cueName: SpriteCue) => void;
  /**
   * Carries out an intent on the next frame, as a director's answer is; a reflex, a visit or a landing that runs then drops it. A `visit`
   * goes to the habitat the visit-target policy picks now. A `grab` given an element turns Flint to it and reaches for its centre on
   * each frame, also while it moves.
   */
  readonly perform:         (intent: string, toward?: Element) => PerformVerdict;
  /** Steers Flint on the next frames, as a held arrow key or the space bar does; a visit, a drag or a landing ignores it. */
  readonly steer:           (steering: string) => SteerVerdict;
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
  /** The element a host's grab reaches for; it is let go once no grab runs or waits. */
  reachElement:            Element | null;
}

const NO_STORAGE: FlintStorage = Object.freeze({ readHabitatKind: () => null, writeHabitatKind: () => undefined });

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
  const renderer = createSpriteRenderer({ document, pixelsForOneUnit });
  placeOverlay(renderer.element, options.theme ?? {});
  options.root.appendChild(renderer.element);
  const sensors = createSpriteSensors({
    document,
    overlay:     renderer.element,
    bodyElement: renderer.bodyElement,
    home:        options.home,
    pixelsForOneUnit,
    visitTarget: options.visitTarget ?? 'last-focused-or-clicked',
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
    reachElement:            null,
  };

  const giveIntent = (intent: SpriteIntent, visitTargetId: string | null): void => {
    if (!runtime.isDestroyed) runtime.mind = mindStateWithPendingIntent(runtime.mind, { intent, visitTargetId });
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
    if (sensors.isPaused(standingPlaceOf(runtime.mind))) return;
    const isReducedMotion = reducedMotion();
    const before = runtime.mind;
    const perception = sensors.perceive({
      copyTargetHabitatId: before.livesIn,
      storedHabitatKind:   before.mayRestoreStoredHabitat ? storedHabitatKind : null,
      reducedMotion:       isReducedMotion,
      reachElement:        runtime.reachElement,
    });
    runtime.mind = mindStateAfterFrame(before, perception, { elapsedMilliseconds, deltaMilliseconds });
    if (runtime.mind.gesture?.name !== 'grab' && runtime.mind.pendingIntent === null) runtime.reachElement = null;
    if (runtime.mind.livesIn !== before.livesIn) rememberWhereFlintLives(runtime.mind.livesIn);
    if (runtime.awaitedAskNumber === null && directorIsDue(runtime.mind, elapsedMilliseconds)) askDirector(elapsedMilliseconds);
    const targetPose = targetPoseOfMind(runtime.mind, elapsedMilliseconds, isReducedMotion);
    runtime.drawnPose = runtime.drawnPose === null ? targetPose : easedPoseOf(runtime.drawnPose, targetPose, deltaMilliseconds);
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
      giveIntent(intent, intent === 'visit' ? sensors.visitTargetIdFor(runtime.mind.livesIn) : null);
      runtime.reachElement = intent === 'grab' ? toward ?? null : null;
      return 'performed';
    },
    steer: (steering) => {
      if (runtime.isDestroyed) return 'destroyed';
      if (!isFlintSteering(steering)) return 'unknown-steering';
      runtime.mind = mindStateSteered(runtime.mind, steering, runtime.lastElapsedMilliseconds ?? 0, reducedMotion());
      return 'steered';
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
