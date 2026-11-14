/**
 * The pose: everything the renderer draws, as data. A behaviour, a gesture, an emote and sleep each give a part of the target pose;
 * `flint/PoseComposition.ts` stacks the parts and `flint/PoseEasing.ts` moves the drawn pose towards the target. All values are in sprite
 * units for Flint facing right, relative to the bottom tip of the body, unless a field says otherwise.
 */
import { EYE_SHAPE } from './constants/BodyShape.ts';
import {
  ANGER_VEIN_SHAPE,
  GREETING_ANCHOR,
  SHARED_MARK_ANCHOR,
  SWEAT_BEADS_SHAPE,
  SWEAT_DROP_SHAPE
} from './constants/EmoteMarkShapes.ts';
import { HOVER } from './constants/Motion.ts';
import {
  LOOKING_GLASS_SHAPE,
  MERGE_BLOCK_SHAPE,
  NOTEPAD_SHAPE,
  TICKET_SHAPE
} from './constants/PropShapes.ts';

/** 1 when Flint faces right, -1 when it faces left. */
export type Facing = 1 | -1;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The corner count shows the work: 3 points or writes, 4 types or stamps, 5 grabs or holds, 6 fastens or merges. */
export type HandCornerCount = 3 | 4 | 5 | 6;

/**
 * How the easing step moves a hand's centre: `eased` at the hand rate, `exact-position` set on this frame (the radius still eases), or
 * `held-to-lens`, the drawn lens centre plus the grip offset on every frame, so the looking glass and the hand move as one rigid part.
 */
export type HandPlacement = 'eased' | 'exact-position' | 'held-to-lens';

export interface HandPose {
  readonly cornerCount: HandCornerCount;
  readonly centreX:     number;
  readonly centreY:     number;
  /** 0 is no hand. */
  readonly radius:      number;
  readonly turnDegrees: number;
  readonly placement:   HandPlacement;
}

/** `peek` eases the position at the body rate, as Flint does while it peeks around a corner; `exact` sets it on this frame. */
export type BodyPositionEasing = 'exact' | 'peek';

export interface BodyPose {
  /** Overlay units: the x of the bottom tip, before the shake. */
  readonly positionX:      number;
  /** Overlay units: the y of the floor that Flint stands on. */
  readonly floorY:         number;
  readonly jumpHeight:     number;
  readonly hover:          number;
  /** Moves the whole figure up: a hop, a bounce, the bob of busy work. */
  readonly lift:           number;
  /** Moves the whole figure sideways, unmirrored: the shake of anger and nerves. */
  readonly shake:          number;
  readonly facing:         Facing;
  /** Turns the body, glow and eyes around the bottom tip; the hands and props do not lean. */
  readonly leanDegrees:    number;
  readonly widthFactor:    number;
  readonly heightFactor:   number;
  /** 1 faces the user; `BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR` is the sideways pose of a corner. */
  readonly sidewaysWidth:  number;
  readonly positionEasing: BodyPositionEasing;
}

export interface EyesPose {
  /** Moves both eyes to the side that Flint faces. */
  readonly shift:               number;
  readonly height:              number;
  /** The right eye's own height (the Doubt emote); null is the height of both. */
  readonly rightHeightOverride: number | null;
  /** Positive is down. */
  readonly lift:                number;
  /** The left eye turns by minus this angle, the right eye by plus it. */
  readonly slantDegrees:        number;
  /** 0 shows the eye rectangles, 1 the happy eyes; between, the two cross-fade. */
  readonly happiness:           number;
}

/** Every prop has `shown`, its eased level: the opacity, and for the keyboard, the bolt and the sheet, how far it has slid in. */
export interface KeyboardPose {
  readonly shown: number;
  /** The jolt of angry typing, down. */
  readonly drop:  number;
}

export interface BoltPose {
  readonly shown: number;
}

export type StackedPageCount = 0 | 1 | 2 | 3;

export type ReviewVerdict = 'tick' | 'cross';

export interface SheetPose {
  readonly shown:            number;
  /** The line Flint reads, drawn in the body colour; null reads none. */
  readonly readLineIndex:    number | null;
  readonly stackedPageCount: StackedPageCount;
  /** Positive is down: the page turn of busy review, the jab of angry review. */
  readonly offsetY:          number;
  readonly verdict:          ReviewVerdict | null;
}

/** The looking glass grows from scale 0 with `shown`; its centre eases at the hand rate. */
export interface LookingGlassPose {
  readonly shown:   number;
  readonly centreX: number;
  readonly centreY: number;
}

export interface SparkPose {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

export interface MergePose {
  readonly shown:         number;
  readonly topBlockY:     number;
  readonly bottomBlockY:  number;
  readonly blocksOpacity: number;
  readonly mergedOpacity: number;
  readonly mergedOffsetX: number;
  readonly mergedOffsetY: number;
  readonly tickOpacity:   number;
  readonly sparks:        readonly SparkPose[];
}

export interface BookPose {
  readonly shown:             number;
  /** The signed fraction of the page width from the spine to the turning page's edge, times the facing; null turns no page. */
  readonly turningPageSpread: number | null;
}

/** A written length per line, in units; the renderer grows each line from its left end on the screen, whatever the facing. */
export interface NotepadPose {
  readonly shown:          number;
  readonly writtenLengths: readonly number[];
}

export interface SearchBarPose {
  readonly shown:       number;
  readonly queryLength: number;
}

export interface HologramPose {
  readonly shown:     number;
  /** Multiplies the opacity: the flicker of the light. */
  readonly flicker:   number;
  readonly scanLineY: number;
}

export interface TicketPose {
  readonly shown:          number;
  /** Multiplies the opacity: the fade in and out of one ticket in its cycle. */
  readonly cycleOpacity:   number;
  readonly writtenLengths: readonly number[];
  readonly sealShown:      boolean;
  readonly offsetX:        number;
  readonly offsetY:        number;
}

export interface PropsPose {
  readonly keyboard:     KeyboardPose;
  readonly bolt:         BoltPose;
  readonly sheet:        SheetPose;
  readonly lookingGlass: LookingGlassPose;
  readonly merge:        MergePose;
  readonly book:         BookPose;
  readonly notepad:      NotepadPose;
  readonly searchBar:    SearchBarPose;
  readonly hologram:     HologramPose;
  readonly ticket:       TicketPose;
}

export type EmoteMarkName =
  | 'anger-vein'
  | 'sweat-drop'
  | 'exclamation'
  | 'question'
  | 'thinking-dots'
  | 'lightbulb'
  | 'happy-glints'
  | 'sweat-beads'
  | 'greeting';

export interface SweatBeadPose {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

/** A mark is never eased: its emote or gesture gives every value on every frame. */
export interface EmoteMarkPose {
  readonly name:                 EmoteMarkName;
  /** Before the facing: the renderer multiplies the x by the facing, and never mirrors the mark. */
  readonly anchorX:              number;
  readonly anchorY:              number;
  readonly scale:                number;
  /** The spring of the entrance, and a pulse. */
  readonly innerScaleX:          number;
  readonly innerScaleY:          number;
  readonly opacity:              number;
  readonly thinkingDotsShown:    number;
  readonly lightbulbRaysOpacity: number;
  readonly sweatBeads:           readonly SweatBeadPose[];
}

/** Relative to the bottom tip with the hover and lift, but never mirrored and never shaken. */
export interface EmberPose {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

export interface SleepPose {
  readonly glowOpacity: number;
  readonly embers:      readonly EmberPose[];
}

/** The edge of a component that is drawn in front of Flint while it comes around the corner; overlay units. */
export interface OcclusionPose {
  readonly edgeX:      number;
  /** 1 hides what is right of the edge, -1 what is left of it. */
  readonly hiddenSide: Facing;
}

/** An eased value that the target sets on this frame: a blink closes the eyes at once, the merge snap shows the happy eyes at once. */
export type ExactField = 'hover' | 'lean' | 'sideways-width' | 'eye-shift' | 'eye-height' | 'eye-lift' | 'eye-slant' | 'happy-eyes';

export interface Pose {
  readonly body:        BodyPose;
  readonly eyes:        EyesPose;
  /** In a target, null is no hand: the drawn hand shrinks away in its last shape. */
  readonly nearHand:    HandPose | null;
  readonly farHand:     HandPose | null;
  readonly props:       PropsPose;
  readonly emoteMark:   EmoteMarkPose | null;
  readonly sleep:       SleepPose;
  readonly occlusion:   OcclusionPose | null;
  readonly exactFields: readonly ExactField[];
}

/** Changes to the body: a plain field replaces, an `added` field adds, a factor multiplies. */
export interface BodyPart {
  readonly leanDegrees?:      number;
  readonly addedLeanDegrees?: number;
  readonly hover?:            number;
  readonly addedLift?:        number;
  readonly addedShake?:       number;
  readonly widthFactor?:      number;
  readonly heightFactor?:     number;
  readonly sidewaysWidth?:    number;
}

/**
 * One layer's part of the target pose. A field that is absent keeps what the layers below gave; a hand or a mark given as null removes it;
 * a prop given replaces that prop whole; `exactFields` adds to the list.
 */
export interface PosePart {
  readonly body?:        BodyPart;
  readonly eyes?:        Partial<EyesPose>;
  readonly nearHand?:    HandPose | null;
  readonly farHand?:     HandPose | null;
  readonly props?:       Partial<PropsPose>;
  readonly emoteMark?:   EmoteMarkPose | null;
  readonly sleep?:       Partial<SleepPose>;
  readonly exactFields?: readonly ExactField[];
}

export const NEUTRAL_EYES: EyesPose = Object.freeze({
  shift:               EYE_SHAPE.SHIFT_AT_REST_UNITS,
  height:              EYE_SHAPE.HEIGHT_UNITS,
  rightHeightOverride: null,
  lift:                0,
  slantDegrees:        0,
  happiness:           0,
});

/** Every prop hidden, each with the parameters it starts from when it fades in. */
export const HIDDEN_PROPS: PropsPose = Object.freeze({
  keyboard: Object.freeze({ shown: 0, drop: 0 }),
  bolt:     Object.freeze({ shown: 0 }),
  sheet:    Object.freeze({
    shown: 0, readLineIndex: null, stackedPageCount: 0, offsetY: 0, verdict: null,
  }),
  lookingGlass: Object.freeze({ shown: 0, centreX: LOOKING_GLASS_SHAPE.RESTING_CENTRE_X_UNITS, centreY: LOOKING_GLASS_SHAPE.RESTING_CENTRE_Y_UNITS }),
  merge:        Object.freeze({
    shown:         0,
    topBlockY:     MERGE_BLOCK_SHAPE.TOP_BLOCK_Y_UNITS,
    bottomBlockY:  MERGE_BLOCK_SHAPE.BOTTOM_BLOCK_Y_UNITS,
    blocksOpacity: 0,
    mergedOpacity: 0,
    mergedOffsetX: 0,
    mergedOffsetY: 0,
    tickOpacity:   0,
    sparks:        Object.freeze([]),
  }),
  book:      Object.freeze({ shown: 0, turningPageSpread: null }),
  notepad:   Object.freeze({ shown: 0, writtenLengths: Object.freeze(NOTEPAD_SHAPE.LINE_Y_UNITS.map(() => 0)) }),
  searchBar: Object.freeze({ shown: 0, queryLength: 0 }),
  hologram:  Object.freeze({ shown: 0, flicker: 1, scanLineY: 0 }),
  ticket:    Object.freeze({
    shown: 0, cycleOpacity: 1, writtenLengths: Object.freeze(TICKET_SHAPE.LINE_Y_UNITS.map(() => 0)), sealShown: false, offsetX: 0, offsetY: 0,
  }),
});

/** Flint at rest on a floor at y 0, x 0, facing right, hovering at its rest height, with no hand, prop, mark or sleep. */
export const NEUTRAL_POSE: Pose = Object.freeze({
  body: Object.freeze({
    positionX:      0,
    floorY:         0,
    jumpHeight:     0,
    hover:          HOVER.HEIGHT_UNITS,
    lift:           0,
    shake:          0,
    facing:         1,
    leanDegrees:    0,
    widthFactor:    1,
    heightFactor:   1,
    sidewaysWidth:  1,
    positionEasing: 'exact',
  }),
  eyes:        NEUTRAL_EYES,
  nearHand:    null,
  farHand:     null,
  props:       HIDDEN_PROPS,
  emoteMark:   null,
  sleep:       Object.freeze({ glowOpacity: 0, embers: Object.freeze([]) }),
  occlusion:   null,
  exactFields: Object.freeze([]),
});

/** The anchor and scale of each mark in `01-character.md`. */
export const EMOTE_MARK_PLACES: Readonly<Record<EmoteMarkName, { readonly anchorX: number; readonly anchorY: number; readonly scale: number }>> = Object.freeze({
  'anger-vein':    { anchorX: ANGER_VEIN_SHAPE.ANCHOR_X_UNITS, anchorY: ANGER_VEIN_SHAPE.ANCHOR_Y_UNITS, scale: ANGER_VEIN_SHAPE.SCALE },
  'sweat-drop':    { anchorX: SWEAT_DROP_SHAPE.ANCHOR_X_UNITS, anchorY: SWEAT_DROP_SHAPE.ANCHOR_Y_UNITS, scale: SWEAT_DROP_SHAPE.SCALE },
  'exclamation':   { anchorX: SHARED_MARK_ANCHOR.ANCHOR_X_UNITS, anchorY: SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS, scale: SHARED_MARK_ANCHOR.SCALE },
  'question':      { anchorX: SHARED_MARK_ANCHOR.ANCHOR_X_UNITS, anchorY: SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS, scale: SHARED_MARK_ANCHOR.SCALE },
  'thinking-dots': { anchorX: SHARED_MARK_ANCHOR.ANCHOR_X_UNITS, anchorY: SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS, scale: SHARED_MARK_ANCHOR.SCALE },
  'lightbulb':     { anchorX: SHARED_MARK_ANCHOR.ANCHOR_X_UNITS, anchorY: SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS, scale: SHARED_MARK_ANCHOR.SCALE },
  'happy-glints':  { anchorX: SHARED_MARK_ANCHOR.ANCHOR_X_UNITS, anchorY: SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS, scale: SHARED_MARK_ANCHOR.SCALE },
  'sweat-beads':   { anchorX: SWEAT_BEADS_SHAPE.ANCHOR_X_UNITS, anchorY: SWEAT_BEADS_SHAPE.ANCHOR_Y_UNITS, scale: SWEAT_BEADS_SHAPE.SCALE },
  'greeting':      { anchorX: GREETING_ANCHOR.ANCHOR_X_UNITS, anchorY: GREETING_ANCHOR.ANCHOR_Y_UNITS, scale: GREETING_ANCHOR.SCALE },
});

/** A mark at its anchor and scale, fully shown, with no spring, no dots, no rays and no beads: the start every emote builds on. */
export function emoteMarkAtRest(name: EmoteMarkName): EmoteMarkPose {
  const place = EMOTE_MARK_PLACES[name];
  return {
    name,
    anchorX:              place.anchorX,
    anchorY:              place.anchorY,
    scale:                place.scale,
    innerScaleX:          1,
    innerScaleY:          1,
    opacity:              1,
    thinkingDotsShown:    0,
    lightbulbRaysOpacity: 0,
    sweatBeads:           [],
  };
}
