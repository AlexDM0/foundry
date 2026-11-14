/**
 * The one easing step of `02-animations.md`, "Rules for all animations": it moves the drawn pose towards the target pose, so every change
 * of state is smooth and no behaviour animates a transition. A field with no rate in that table is taken from the target as it is. Each
 * prop eases by its own definition, through the prop catalog.
 */
import type {
  BodyPose,
  BodyTint,
  EyesPose,
  ExactField,
  HandPose,
  PagePose,
  Pose,
  SleepPose
} from './SpritePose.ts';
import { EMPTY_PAGE }                                                                     from './SpritePose.ts';
import type { AttendantMember }                                                           from './attendants/AttendantRoster.ts';
import { EASING_RATES_PER_SECOND, HAND_SHRINK_STEP_MULTIPLIER, VANISHED_ATTENDANT_SCALE } from './constants/Easing.ts';
import { HAND_SHAPE }                                                                     from './constants/HandShape.ts';
import type { PropName, PropsPose }                                                       from './props/PropCatalog.ts';
import { propDefinitionOf, propsPoseFrom }                                                from './props/PropCatalog.ts';
import { PropEasingUtil }                                                                 from './props/PropEasingUtil.ts';
import { AnimationCurveUtil }                                                             from './utils/AnimationCurveUtil.ts';

const { easedTowards } = PropEasingUtil;
const { easingFractionOf } = AnimationCurveUtil;

interface Fractions {
  readonly handsAndProps: number;
  readonly body:          number;
  readonly eyes:          number;
}

/** The amount eases at the target's own rate, or the eye rate; while it fades to 0 the tint keeps its drawn colour. */
function easedTint(drawn: BodyTint, target: BodyTint, fractions: Fractions, deltaMilliseconds: number, isExact: boolean): BodyTint {
  const fraction = target.ratePerSecond === undefined ? fractions.eyes : easingFractionOf(target.ratePerSecond, deltaMilliseconds);
  const amount = isExact ? target.amount : easedTowards(drawn.amount, target.amount, fraction);
  return { ...(target.amount === 0 ? drawn : target), amount };
}

function easedBody(drawn: BodyPose, target: BodyPose, fractions: Fractions, exactFields: readonly ExactField[], deltaMilliseconds: number): BodyPose {
  const isExact = (field: ExactField): boolean => exactFields.includes(field);
  return {
    ...target,
    positionX:     target.positionEasing === 'peek' ? easedTowards(drawn.positionX, target.positionX, fractions.body) : target.positionX,
    hover:         isExact('hover') ? target.hover : easedTowards(drawn.hover, target.hover, fractions.body),
    leanDegrees:   isExact('lean') ? target.leanDegrees : easedTowards(drawn.leanDegrees, target.leanDegrees, fractions.body),
    sidewaysWidth: isExact('sideways-width') ? target.sidewaysWidth : easedTowards(drawn.sidewaysWidth, target.sidewaysWidth, fractions.handsAndProps),
    tint:          easedTint(drawn.tint, target.tint, fractions, deltaMilliseconds, isExact('tint')),
    fillOpacity:   isExact('fill-opacity') ? target.fillOpacity : easedTowards(drawn.fillOpacity, target.fillOpacity, fractions.eyes),
  };
}

function easedEyes(drawn: EyesPose, target: EyesPose, fractions: Fractions, exactFields: readonly ExactField[]): EyesPose {
  const eased = (field: ExactField, value: number, goal: number, fraction: number): number => (exactFields.includes(field) ? goal : easedTowards(value, goal, fraction));
  return {
    shift:               eased('eye-shift', drawn.shift, target.shift, fractions.handsAndProps),
    height:              eased('eye-height', drawn.height, target.height, fractions.eyes),
    rightHeightOverride: eased('eye-height', drawn.rightHeightOverride ?? drawn.height, target.rightHeightOverride ?? target.height, fractions.eyes),
    lift:                eased('eye-lift', drawn.lift, target.lift, fractions.eyes),
    slantDegrees:        eased('eye-slant', drawn.slantDegrees, target.slantDegrees, fractions.eyes),
    happiness:           eased('happy-eyes', drawn.happiness, target.happiness, fractions.eyes),
  };
}

/** The inner glow eases at the eye rate, so a glow a gesture set fades when the gesture stops; the embers are the sleep layer's own. */
function easedSleep(drawn: SleepPose, target: SleepPose, fractions: Fractions, exactFields: readonly ExactField[]): SleepPose {
  const glowOpacity = exactFields.includes('inner-glow') ? target.glowOpacity : easedTowards(drawn.glowOpacity, target.glowOpacity, fractions.eyes);
  return { ...target, glowOpacity };
}

function gripPointOf<Name extends PropName>(name: Name, props: PropsPose): { readonly x: number; readonly y: number } | null {
  const definition = propDefinitionOf(name);
  return definition.gripOf === undefined ? null : definition.gripOf(props[name]);
}

/**
 * A hand grows from the body, shrinks away when no gesture needs it, and shrinks to nothing before it takes a new shape, at twice the
 * step of a hand; a hand that is gone starts again from the body. A hand held to a prop sits on that prop's drawn grip point.
 */
function easedHand(drawn: HandPose | null, target: HandPose | null, fraction: number, props: PropsPose): HandPose | null {
  if (target === null) {
    return drawn === null ? null : { ...drawn, radius: easedTowards(drawn.radius, 0, fraction) };
  }
  const current = drawn ?? { ...target, radius: 0 };
  if (current.cornerCount !== target.cornerCount && current.radius > HAND_SHAPE.VANISHED_RADIUS_UNITS) {
    return { ...current, radius: easedTowards(current.radius, 0, Math.min(1, fraction * HAND_SHRINK_STEP_MULTIPLIER)) };
  }
  const start = current.radius <= HAND_SHAPE.VANISHED_RADIUS_UNITS ? { centreX: HAND_SHAPE.EMERGE_X_UNITS, centreY: HAND_SHAPE.EMERGE_Y_UNITS } : current;
  const radius = easedTowards(current.radius, target.radius, fraction);
  const grip = typeof target.placement === 'object' ? gripPointOf(target.placement.heldTo, props) : null;
  if (grip !== null) return {
    ...target, radius, centreX: grip.x, centreY: grip.y
  };
  if (target.placement === 'exact-position') return { ...target, radius };
  return {
    ...target, radius, centreX: easedTowards(start.centreX, target.centreX, fraction), centreY: easedTowards(start.centreY, target.centreY, fraction),
  };
}

function easedProp<Name extends PropName>(name: Name, drawn: PropsPose, target: PropsPose, fraction: number): PropsPose[Name] {
  const definition = propDefinitionOf(name);
  return definition.easedOf === undefined
    ? PropEasingUtil.easedShownLevelOf(drawn[name], target[name], fraction)
    : definition.easedOf(drawn[name], target[name], fraction);
}

/** A member the target still has takes the target's place; one it lost shrinks away at the hand rate, and is gone once it is too small to see. */
function easedAttendants(drawn: readonly AttendantMember[], target: readonly AttendantMember[], fraction: number): readonly AttendantMember[] {
  const leaving = drawn
    .filter((member) => !target.some((kept) => kept.name === member.name && kept.index === member.index))
    .map((member) => ({ ...member, scale: easedTowards(member.scale, 0, fraction) }))
    .filter((member) => member.scale > VANISHED_ATTENDANT_SCALE);
  return [...target, ...leaving];
}

/** The behaviour's page shapes as it gives them; once it gives none, the last ones fade out at the pace it set, and then are gone. */
function pageAfterFrame(drawn: PagePose, target: PagePose, deltaMilliseconds: number): PagePose {
  if (target.shapes.length > 0 || drawn.shapes.length === 0) return target;
  const opacity = drawn.opacity - (deltaMilliseconds / Math.max(deltaMilliseconds, drawn.fadeOutMilliseconds));
  return opacity > 0 ? { ...drawn, opacity } : EMPTY_PAGE;
}

/**
 * The drawn pose after one frame of this length; the marks, the embers and occlusion are the target's, since their layers time them, and so
 * are the page's shapes until they fade.
 */
export function easedPoseOf(drawn: Pose, target: Pose, deltaMilliseconds: number): Pose {
  const fractions: Fractions = {
    handsAndProps: easingFractionOf(EASING_RATES_PER_SECOND.HANDS_AND_PROPS, deltaMilliseconds),
    body:          easingFractionOf(EASING_RATES_PER_SECOND.BODY, deltaMilliseconds),
    eyes:          easingFractionOf(EASING_RATES_PER_SECOND.EYES, deltaMilliseconds),
  };
  const props = propsPoseFrom((name) => easedProp(name, drawn.props, target.props, fractions.handsAndProps));
  return {
    body:        easedBody(drawn.body, target.body, fractions, target.exactFields, deltaMilliseconds),
    eyes:        easedEyes(drawn.eyes, target.eyes, fractions, target.exactFields),
    nearHand:    easedHand(drawn.nearHand, target.nearHand, fractions.handsAndProps, props),
    farHand:     easedHand(drawn.farHand, target.farHand, fractions.handsAndProps, props),
    props,
    emoteMark:   target.emoteMark,
    sleep:       easedSleep(drawn.sleep, target.sleep, fractions, target.exactFields),
    attendants:  easedAttendants(drawn.attendants, target.attendants, fractions.handsAndProps),
    occlusion:   target.occlusion,
    page:        pageAfterFrame(drawn.page, target.page, deltaMilliseconds),
    exactFields: target.exactFields,
  };
}
