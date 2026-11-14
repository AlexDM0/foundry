/**
 * The one easing step of `02-animations.md`, "Rules for all animations": it moves the drawn pose towards the target pose, so every change
 * of state is smooth and no behaviour animates a transition. A field with no rate in that table is taken from the target as it is.
 */
import type {
  BodyPose,
  EyesPose,
  ExactField,
  HandPose,
  LookingGlassPose,
  Pose,
  PropsPose
} from './SpritePose.ts';
import { EASING_RATES_PER_SECOND, HAND_SHRINK_STEP_MULTIPLIER, MILLISECONDS_PER_SECOND } from './constants/Easing.ts';
import { HAND_SHAPE }                                                                    from './constants/HandShape.ts';
import { LOOKING_GLASS_SHAPE }                                                           from './constants/PropShapes.ts';

/** The share of the remaining distance that one step of this length covers at this rate. */
export function easingFractionOf(ratePerSecond: number, deltaMilliseconds: number): number {
  return 1 - Math.exp(-ratePerSecond * (deltaMilliseconds / MILLISECONDS_PER_SECOND));
}

function easedValue(value: number, target: number, fraction: number): number {
  return value + ((target - value) * fraction);
}

interface Fractions {
  readonly handsAndProps: number;
  readonly body:          number;
  readonly eyes:          number;
}

function easedBody(drawn: BodyPose, target: BodyPose, fractions: Fractions, exactFields: readonly ExactField[]): BodyPose {
  const isExact = (field: ExactField): boolean => exactFields.includes(field);
  return {
    ...target,
    positionX:     target.positionEasing === 'peek' ? easedValue(drawn.positionX, target.positionX, fractions.body) : target.positionX,
    hover:         isExact('hover') ? target.hover : easedValue(drawn.hover, target.hover, fractions.body),
    leanDegrees:   isExact('lean') ? target.leanDegrees : easedValue(drawn.leanDegrees, target.leanDegrees, fractions.body),
    sidewaysWidth: isExact('sideways-width') ? target.sidewaysWidth : easedValue(drawn.sidewaysWidth, target.sidewaysWidth, fractions.handsAndProps),
  };
}

function easedEyes(drawn: EyesPose, target: EyesPose, fractions: Fractions, exactFields: readonly ExactField[]): EyesPose {
  const eased = (field: ExactField, value: number, goal: number, fraction: number): number => (exactFields.includes(field) ? goal : easedValue(value, goal, fraction));
  return {
    shift:               eased('eye-shift', drawn.shift, target.shift, fractions.handsAndProps),
    height:              eased('eye-height', drawn.height, target.height, fractions.eyes),
    rightHeightOverride: eased('eye-height', drawn.rightHeightOverride ?? drawn.height, target.rightHeightOverride ?? target.height, fractions.eyes),
    lift:                eased('eye-lift', drawn.lift, target.lift, fractions.eyes),
    slantDegrees:        eased('eye-slant', drawn.slantDegrees, target.slantDegrees, fractions.eyes),
    happiness:           eased('happy-eyes', drawn.happiness, target.happiness, fractions.eyes),
  };
}

/**
 * A hand grows from the body, shrinks away when no gesture needs it, and shrinks to nothing before it takes a new shape, at twice the
 * step of a hand; a hand that is gone starts again from the body.
 */
function easedHand(drawn: HandPose | null, target: HandPose | null, fraction: number, lens: LookingGlassPose): HandPose | null {
  if (target === null) {
    return drawn === null ? null : { ...drawn, radius: easedValue(drawn.radius, 0, fraction) };
  }
  const current = drawn ?? { ...target, radius: 0 };
  if (current.cornerCount !== target.cornerCount && current.radius > HAND_SHAPE.VANISHED_RADIUS_UNITS) {
    return { ...current, radius: easedValue(current.radius, 0, Math.min(1, fraction * HAND_SHRINK_STEP_MULTIPLIER)) };
  }
  const start = current.radius <= HAND_SHAPE.VANISHED_RADIUS_UNITS ? { centreX: HAND_SHAPE.EMERGE_X_UNITS, centreY: HAND_SHAPE.EMERGE_Y_UNITS } : current;
  const radius = easedValue(current.radius, target.radius, fraction);
  if (target.placement === 'held-to-lens') {
    return {
      ...target, radius, centreX: lens.centreX + LOOKING_GLASS_SHAPE.GRIP_OFFSET_X_UNITS, centreY: lens.centreY + LOOKING_GLASS_SHAPE.GRIP_OFFSET_Y_UNITS,
    };
  }
  if (target.placement === 'exact-position') return { ...target, radius };
  return {
    ...target, radius, centreX: easedValue(start.centreX, target.centreX, fraction), centreY: easedValue(start.centreY, target.centreY, fraction),
  };
}

/** A prop eases only its shown level; one the target no longer shows keeps its last drawn parameters while it fades. */
function easedProp<Prop extends { readonly shown: number }>(drawn: Prop, target: Prop, fraction: number): Prop {
  const shown = easedValue(drawn.shown, target.shown, fraction);
  return target.shown === 0 ? { ...drawn, shown } : { ...target, shown };
}

function easedProps(drawn: PropsPose, target: PropsPose, fraction: number): PropsPose {
  const lookingGlass = easedProp(drawn.lookingGlass, target.lookingGlass, fraction);
  return {
    keyboard:     easedProp(drawn.keyboard, target.keyboard, fraction),
    bolt:         easedProp(drawn.bolt, target.bolt, fraction),
    sheet:        easedProp(drawn.sheet, target.sheet, fraction),
    lookingGlass: target.lookingGlass.shown === 0 ? lookingGlass : {
      ...lookingGlass,
      centreX: easedValue(drawn.lookingGlass.centreX, target.lookingGlass.centreX, fraction),
      centreY: easedValue(drawn.lookingGlass.centreY, target.lookingGlass.centreY, fraction),
    },
    merge:     easedProp(drawn.merge, target.merge, fraction),
    book:      easedProp(drawn.book, target.book, fraction),
    notepad:   easedProp(drawn.notepad, target.notepad, fraction),
    searchBar: easedProp(drawn.searchBar, target.searchBar, fraction),
    hologram:  easedProp(drawn.hologram, target.hologram, fraction),
    ticket:    easedProp(drawn.ticket, target.ticket, fraction),
  };
}

/** The drawn pose after one frame of this length; the marks, sleep and occlusion are the target's, since their layers time them. */
export function easedPoseOf(drawn: Pose, target: Pose, deltaMilliseconds: number): Pose {
  const fractions: Fractions = {
    handsAndProps: easingFractionOf(EASING_RATES_PER_SECOND.HANDS_AND_PROPS, deltaMilliseconds),
    body:          easingFractionOf(EASING_RATES_PER_SECOND.BODY, deltaMilliseconds),
    eyes:          easingFractionOf(EASING_RATES_PER_SECOND.EYES, deltaMilliseconds),
  };
  const props = easedProps(drawn.props, target.props, fractions.handsAndProps);
  return {
    body:        easedBody(drawn.body, target.body, fractions, target.exactFields),
    eyes:        easedEyes(drawn.eyes, target.eyes, fractions, target.exactFields),
    nearHand:    easedHand(drawn.nearHand, target.nearHand, fractions.handsAndProps, props.lookingGlass),
    farHand:     easedHand(drawn.farHand, target.farHand, fractions.handsAndProps, props.lookingGlass),
    props,
    emoteMark:   target.emoteMark,
    sleep:       target.sleep,
    occlusion:   target.occlusion,
    exactFields: target.exactFields,
  };
}
