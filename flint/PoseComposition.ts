/**
 * Stacks the layers of the target pose in one fixed order: the behaviour's base pose, then the gesture, the emote, sleep, and last
 * reduced motion. A later layer wins over an earlier one on each field it gives, so an emote's mark hides a gesture's "Hi!" or vein.
 */
import type {
  BodyPart,
  Pose,
  PosePart,
  PropsPose
} from './SpritePose.ts';
import { HOVER } from './constants/Motion.ts';

/** One layer: given the pose of the layers below, its part, or null when the layer is not active. */
export type PoseLayer = (incoming: Pose) => PosePart | null;

export type PoseLayerName = 'behaviour' | 'gesture' | 'emote' | 'sleep' | 'reduced-motion';

export const POSE_COMPOSITION_ORDER: readonly PoseLayerName[] = Object.freeze(['behaviour', 'gesture', 'emote', 'sleep', 'reduced-motion']);

export interface PoseLayers {
  /** The behaviour's pose: position, facing, hover, walk, jump and blink. */
  readonly base:          Pose;
  readonly gesture:       PoseLayer;
  readonly emote:         PoseLayer;
  readonly sleep:         PoseLayer;
  readonly reducedMotion: boolean;
}

export const NO_LAYER: PoseLayer = () => null;

function bodyWithPart(body: Pose['body'], part: BodyPart): Pose['body'] {
  return {
    ...body,
    leanDegrees:   (part.leanDegrees ?? body.leanDegrees) + (part.addedLeanDegrees ?? 0),
    hover:         part.hover ?? body.hover,
    lift:          body.lift + (part.addedLift ?? 0),
    shake:         body.shake + (part.addedShake ?? 0),
    widthFactor:   body.widthFactor * (part.widthFactor ?? 1),
    heightFactor:  body.heightFactor * (part.heightFactor ?? 1),
    sidewaysWidth: part.sidewaysWidth ?? body.sidewaysWidth,
  };
}

/** The pose with one part laid over it, by the rules of `PosePart`. */
export function poseWithPart(pose: Pose, part: PosePart | null): Pose {
  if (part === null) return pose;
  const props: PropsPose = part.props === undefined ? pose.props : { ...pose.props, ...part.props };
  return {
    body:        part.body === undefined ? pose.body : bodyWithPart(pose.body, part.body),
    eyes:        part.eyes === undefined ? pose.eyes : { ...pose.eyes, ...part.eyes },
    nearHand:    part.nearHand === undefined ? pose.nearHand : part.nearHand,
    farHand:     part.farHand === undefined ? pose.farHand : part.farHand,
    props,
    emoteMark:   part.emoteMark === undefined ? pose.emoteMark : part.emoteMark,
    sleep:       part.sleep === undefined ? pose.sleep : { ...pose.sleep, ...part.sleep },
    occlusion:   pose.occlusion,
    exactFields: part.exactFields === undefined ? pose.exactFields : [...pose.exactFields, ...part.exactFields],
  };
}

/**
 * Under reduced motion Flint holds still poses and changes only its expression: no bob, shake, squash or hover swing (a hover that sleep
 * landed stays landed). A gesture holds still because the mind gives it its still moment in place of the running time; an emote is told
 * through its input.
 */
export function stillPoseOf(pose: Pose): Pose {
  return {
    ...pose,
    body: {
      ...pose.body, lift: 0, shake: 0, widthFactor: 1, heightFactor: 1, hover: pose.body.hover === 0 ? 0 : HOVER.HEIGHT_UNITS,
    },
  };
}

export function composedTargetPose(layers: PoseLayers): Pose {
  const withGesture = poseWithPart(layers.base, layers.gesture(layers.base));
  const withEmote = poseWithPart(withGesture, layers.emote(withGesture));
  const withSleep = poseWithPart(withEmote, layers.sleep(withEmote));
  return layers.reducedMotion ? stillPoseOf(withSleep) : withSleep;
}
