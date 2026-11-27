/**
 * The pose: everything the renderer draws, as data. Each layer gives a part of the target pose, which `flint/PoseComposition.ts` stacks and
 * `flint/PoseEasing.ts` eases towards. Values are in sprite units for Flint facing right, relative to the bottom tip of the body, unless a
 * field says otherwise.
 */
import type { Facing }                  from './SpriteGeometry.ts';
import type { AttendantMember }         from './attendants/AttendantRoster.ts';
import { EYE_SHAPE }                    from './constants/BodyShape.ts';
import { HOVER }                        from './constants/Motion.ts';
import type { FlintColourRole }         from './constants/Palette.ts';
import type { Shape }                   from './drawing/Shape.ts';
import type { MarkDetailsOf, MarkName } from './marks/MarkCatalog.ts';
import { markDefinitionOf }             from './marks/MarkCatalog.ts';
import type { PropName, PropsPose }     from './props/PropCatalog.ts';
import { HIDDEN_PROPS }                 from './props/PropCatalog.ts';

/** The corner count shows the work: 3 points or writes, 4 types or stamps, 5 grabs or holds, 6 fastens or merges. */
export type HandCornerCount = 3 | 4 | 5 | 6;

/** A hand whose centre is the drawn grip point of this prop on every frame, so the hand and the prop move as one rigid part. */
export interface HeldToProp {
  readonly heldTo: PropName;
}

/** How the easing step moves a hand's centre: `eased` at the hand rate, `exact-position` set on this frame (the radius still eases), or held to a prop. */
export type HandPlacement = 'eased' | 'exact-position' | HeldToProp;

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

/** The body drawn again on top of itself in this colour, with the amount as its opacity. */
export interface BodyTint {
  readonly role:           FlintColourRole;
  /** From 0, no tint, to 1. */
  readonly amount:         number;
  /** The rate the amount eases at; the eye rate when absent. */
  readonly ratePerSecond?: number;
}

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
  readonly tint:           BodyTint;
  /** Below 1 the body also shows a dashed outline, with the opposite opacity; the eyes do not fade. */
  readonly fillOpacity:    number;
}

export interface EyesPose {
  /** Moves both eyes to the side that Flint faces. */
  readonly shift:               number;
  readonly height:              number;
  /** The right eye's own height; null is the height of both. */
  readonly rightHeightOverride: number | null;
  /** Positive is down. */
  readonly lift:                number;
  /** The left eye turns by minus this angle, the right eye by plus it. */
  readonly slantDegrees:        number;
  /** 0 shows the eye rectangles, 1 the happy eyes; between, the two cross-fade. */
  readonly happiness:           number;
}

/** A mark of one name, with that mark's own details. A mark is never eased: its emote or gesture gives every value on every frame. */
export interface EmoteMarkPoseOf<Name extends MarkName> {
  readonly name:        Name;
  /** Before the facing: the renderer multiplies the x by the facing, and never mirrors the mark. */
  readonly anchorX:     number;
  readonly anchorY:     number;
  readonly scale:       number;
  /** The spring of the entrance, and a pulse. */
  readonly innerScaleX: number;
  readonly innerScaleY: number;
  readonly opacity:     number;
  readonly details:     MarkDetailsOf<Name>;
}

export type EmoteMarkPose = { [Name in MarkName]: EmoteMarkPoseOf<Name> }[MarkName];

/** Relative to the bottom tip with the hover and lift, but never mirrored and never shaken. */
export interface EmberPose {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

export interface SleepPose {
  /** A gesture can light the glow too: its inner glow. */
  readonly glowOpacity: number;
  readonly embers:      readonly EmberPose[];
}

/** The edge of a component that is drawn in front of Flint while it comes around the corner; overlay units. */
export interface OcclusionPose {
  readonly edgeX:      number;
  /** 1 hides what is right of the edge, -1 what is left of it. */
  readonly hiddenSide: Facing;
}

/**
 * Shapes a behaviour gives at a place on the page, in overlay units, drawn behind Flint: they do not move with Flint and are never
 * mirrored. They are never eased, since the behaviour gives each value on each frame; once it gives none, the last ones fade out over
 * `fadeOutMilliseconds`, so a behaviour that ends leaves no shape behind.
 */
export interface PagePose {
  readonly shapes:              readonly Shape[];
  /** Of all the shapes together; below 1 only while they fade out. */
  readonly opacity:             number;
  readonly fadeOutMilliseconds: number;
}

/** No shape on the page. */
export const EMPTY_PAGE: PagePose = Object.freeze({ shapes: Object.freeze([]), opacity: 1, fadeOutMilliseconds: 0 });

/** An eased value that the target sets on this frame: a blink closes the eyes at once, the merge snap shows the happy eyes at once. */
export type ExactField =
  | 'hover'
  | 'lean'
  | 'sideways-width'
  | 'eye-shift'
  | 'eye-height'
  | 'eye-lift'
  | 'eye-slant'
  | 'happy-eyes'
  | 'tint'
  | 'fill-opacity'
  | 'inner-glow';

export interface Pose {
  readonly body:        BodyPose;
  readonly eyes:        EyesPose;
  /** In a target, null is no hand: the drawn hand shrinks away in its last shape. */
  readonly nearHand:    HandPose | null;
  readonly farHand:     HandPose | null;
  readonly props:       PropsPose;
  readonly emoteMark:   EmoteMarkPose | null;
  readonly sleep:       SleepPose;
  /** Set after every other layer, so no gesture, emote or sleep removes one; a member the target lacks shrinks away. */
  readonly attendants:  readonly AttendantMember[];
  readonly occlusion:   OcclusionPose | null;
  /** Only a behaviour gives the page's shapes; no part of a gesture, an emote or sleep can. */
  readonly page:        PagePose;
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
  readonly tint?:             BodyTint;
  readonly fillOpacity?:      number;
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

/** No tint: the body's own colour at amount 0. */
export const NO_TINT: BodyTint = Object.freeze({ role: 'body', amount: 0 });

/** Flint at rest on a floor at y 0, x 0, facing right, hovering at its rest height, with no hand, prop, mark, sleep or attendant. */
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
    tint:           NO_TINT,
    fillOpacity:    1,
  }),
  eyes:        NEUTRAL_EYES,
  nearHand:    null,
  farHand:     null,
  props:       HIDDEN_PROPS,
  emoteMark:   null,
  sleep:       Object.freeze({ glowOpacity: 0, embers: Object.freeze([]) }),
  attendants:  Object.freeze([]),
  occlusion:   null,
  page:        EMPTY_PAGE,
  exactFields: Object.freeze([]),
});

/** A mark at its anchor and scale, fully shown, with no spring and its details at rest: the start every emote and gesture builds on. */
export function emoteMarkAtRest<Name extends MarkName>(name: Name): EmoteMarkPoseOf<Name> {
  const definition = markDefinitionOf(name);
  return {
    name,
    anchorX:     definition.anchorX,
    anchorY:     definition.anchorY,
    scale:       definition.scale,
    innerScaleX: 1,
    innerScaleY: 1,
    opacity:     1,
    details:     definition.restDetails,
  };
}
